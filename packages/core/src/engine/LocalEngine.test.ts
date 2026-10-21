import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  glob: vi.fn(),
}));

vi.mock("../screenshots/collectScreenshots", () => ({
  collectScreenshots: vi.fn(async () => []),
}));

import fs from "node:fs";
import { glob } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginTask } from "../plugin";
import type { RunEvent, RunnablePlugin } from "../runner/types";
import type ScreenshotTool from "../screenshot";
import { collectScreenshots } from "../screenshots/collectScreenshots";
import type { Screenshot } from "../types";
import type { ResolvedWebServerConfig } from "../webServer";
import { OutputTail, type ProcessExit } from "../webServer/process";
import { LocalEngine } from "./LocalEngine";
import {
  ENGINE_ERROR_CODES,
  isRunInProgressError,
  isUnknownTargetsError,
  isWatchInProgressError,
  RunInProgressError,
  UnknownTargetsError,
  type WatchEvent,
} from "./types";
import type { FileWatcher } from "./WatchSession";

/**
 * A real, writable directory for each test.
 *
 * `ScreenshotFileSystem` creates `actual/`, `expected/` and `diff/` eagerly in
 * its constructor, so constructing a `LocalEngine` touches the disk. An
 * absolute path like `/out` only works when the tests run as root — which is
 * why an earlier version of this file passed locally and failed on CI with
 * EACCES.
 */
let outputDir: string;

const task = (id: string): PluginTask => ({ id, url: `http://x/${id}` });

const createTool = () =>
  ({
    outputDir,
    concurrency: 1,
    filesystem: undefined,
    init: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    recycleContexts: vi.fn(async () => {}),
    getPageFromPool: vi.fn(() => ({})),
  }) as unknown as ScreenshotTool;

const createPlugin = (
  name: string,
  tasks: PluginTask[],
  execute: RunnablePlugin["execute"] = async () => ({
    filepath: `${outputDir}/actual/a.png`,
    success: true,
  }),
): RunnablePlugin => ({
  name,
  description: `${name} plugin`,
  discover: vi.fn(async () => tasks),
  execute: vi.fn(execute),
});

const createEngine = (
  plugins: RunnablePlugin[],
  overrides: Partial<ConstructorParameters<typeof LocalEngine>[0]> = {},
) => {
  const tools: ScreenshotTool[] = [];
  const engine = new LocalEngine({
    outputDir,
    plugins,
    createScreenshotTool: () => {
      const tool = createTool();
      tools.push(tool);
      return tool;
    },
    ...overrides,
  });
  return { engine, tools };
};

/** Resolve once the engine's active run has settled. */
const settle = async (engine: LocalEngine, runId: string) => {
  for (let i = 0; i < 200; i++) {
    const run = await engine.getRun(runId);
    if (run && run.state !== "running" && run.state !== "discovering") {
      return run;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Run ${runId} never settled`);
};

beforeEach(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "cappa-engine-"));
  vi.mocked(glob).mockReset();
  vi.mocked(glob).mockImplementation(async function* () {} as any);
  vi.mocked(collectScreenshots).mockReset();
  vi.mocked(collectScreenshots).mockResolvedValue([]);
});

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true });
});

describe("LocalEngine discovery", () => {
  it("lists plugins", async () => {
    const { engine } = createEngine([createPlugin("storybook", [])]);

    await expect(engine.listPlugins()).resolves.toEqual([
      { name: "storybook", description: "storybook plugin" },
    ]);

    await engine.close();
  });

  it("discovers targets across plugins and tags them with the owner", async () => {
    const { engine } = createEngine([
      createPlugin("a", [task("a1")]),
      createPlugin("b", [task("b1")]),
    ]);

    await expect(engine.listTargets()).resolves.toEqual([
      { id: "a1", url: "http://x/a1", plugin: "a" },
      { id: "b1", url: "http://x/b1", plugin: "b" },
    ]);

    await engine.close();
  });

  it("caches targets and re-discovers on refresh", async () => {
    const plugin = createPlugin("a", [task("a1")]);
    const { engine } = createEngine([plugin]);

    await engine.listTargets();
    await engine.listTargets();
    expect(plugin.discover).toHaveBeenCalledOnce();

    await engine.listTargets({ refresh: true });
    expect(plugin.discover).toHaveBeenCalledTimes(2);

    await engine.close();
  });

  it("warms the browser for discovery and keeps it warm", async () => {
    const { engine, tools } = createEngine([createPlugin("a", [task("a1")])]);

    await engine.listTargets();

    expect(tools).toHaveLength(1);
    expect(tools[0]?.init).toHaveBeenCalledOnce();
    expect(engine.isWarm).toBe(true);

    await engine.close();
    expect(tools[0]?.close).toHaveBeenCalledOnce();
  });
});

describe("LocalEngine runs", () => {
  it("returns a summary immediately and completes in the background", async () => {
    const plugin = createPlugin("a", [task("a1"), task("a2")]);
    const { engine } = createEngine([plugin]);

    const summary = await engine.startRun();
    expect(summary.id).toBeTruthy();

    const detail = await settle(engine, summary.id);
    expect(detail.state).toBe("completed");
    expect(detail.tasks).toHaveLength(2);

    await engine.close();
  });

  it("reuses one browser across runs", async () => {
    const plugin = createPlugin("a", [task("a1")]);
    const { engine, tools } = createEngine([plugin]);

    const first = await engine.startRun();
    await settle(engine, first.id);
    const second = await engine.startRun();
    await settle(engine, second.id);

    expect(tools).toHaveLength(1);
    expect(tools[0]?.init).toHaveBeenCalledOnce();
    expect(tools[0]?.recycleContexts).toHaveBeenCalled();

    await engine.close();
  });

  it("rejects a second run while one is active", async () => {
    const { engine } = createEngine([createPlugin("a", [task("a1")])]);

    const first = await engine.startRun();

    await expect(engine.startRun()).rejects.toBeInstanceOf(RunInProgressError);

    await settle(engine, first.id);
    await engine.close();
  });

  it("rejects concurrent startRun calls without both claiming the browser", async () => {
    const { engine, tools } = createEngine([createPlugin("a", [task("a1")])]);

    const results = await Promise.allSettled([
      engine.startRun(),
      engine.startRun(),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(tools).toHaveLength(1);

    await engine.close();
  });

  it("accepts another run once the first finishes", async () => {
    const { engine } = createEngine([createPlugin("a", [task("a1")])]);

    const first = await engine.startRun();
    await settle(engine, first.id);

    const second = await engine.startRun();
    expect(second.id).not.toBe(first.id);

    await settle(engine, second.id);
    await engine.close();
  });

  it("allows starting a run from inside a run:complete subscriber", async () => {
    // The obvious client behaviour: react to the terminal event by kicking off
    // the next run. Engine cleanup must already have happened by then.
    const { engine } = createEngine([createPlugin("a", [task("a1")])]);

    const first = await engine.startRun();

    const second = await new Promise<string>((resolve, reject) => {
      engine.subscribeRun(first.id, (event) => {
        if (event.type !== "run:complete") {
          return;
        }
        engine.startRun().then(
          (summary) => resolve(summary.id),
          (error) => reject(error),
        );
      });
    });

    expect(second).not.toBe(first.id);

    await settle(engine, second);
    await engine.close();
  });

  it("frees the engine after a run that errored", async () => {
    const plugin = createPlugin("a", [task("a1")], async () => {
      throw new Error("execute exploded");
    });
    const { engine } = createEngine([plugin]);

    const failing = await engine.startRun();
    const detail = await settle(engine, failing.id);
    expect(detail.state).toBe("failed");

    // A failed run must not wedge the engine.
    const next = await engine.startRun();
    await settle(engine, next.id);

    await engine.close();
  });

  it("lists runs newest first", async () => {
    const { engine } = createEngine([createPlugin("a", [task("a1")])]);

    const first = await engine.startRun();
    await settle(engine, first.id);
    const second = await engine.startRun();
    await settle(engine, second.id);

    const runs = await engine.listRuns();
    expect(runs.map((run) => run.id)).toEqual([second.id, first.id]);

    await engine.close();
  });

  it("passes the request through to the runner", async () => {
    const plugin = createPlugin("a", [task("keep"), task("drop")]);
    const { engine } = createEngine([plugin]);

    const summary = await engine.startRun({ taskIds: ["keep"] });
    await settle(engine, summary.id);

    expect(vi.mocked(plugin.execute).mock.calls.map(([t]) => t.id)).toEqual([
      "keep",
    ]);

    await engine.close();
  });

  it("rejects task ids that were never discovered", async () => {
    const { engine } = createEngine([createPlugin("a", [task("a1")])]);

    await expect(engine.startRun({ taskIds: ["nope"] })).rejects.toBeInstanceOf(
      UnknownTargetsError,
    );

    // The failed claim must not leave the engine wedged.
    const summary = await engine.startRun();
    await settle(engine, summary.id);

    await engine.close();
  });

  it("invalidates the target cache after a run", async () => {
    const plugin = createPlugin("a", [task("a1")]);
    const { engine } = createEngine([plugin]);

    await engine.listTargets();
    expect(plugin.discover).toHaveBeenCalledOnce();

    const summary = await engine.startRun();
    await settle(engine, summary.id);

    await engine.listTargets();
    expect(plugin.discover).toHaveBeenCalledTimes(3); // initial + run + re-list

    await engine.close();
  });

  it("serves cached targets rather than discovering during a run", async () => {
    const plugin = createPlugin("a", [task("a1")]);
    const { engine, tools } = createEngine([plugin]);

    const cached = await engine.listTargets();
    const summary = await engine.startRun();

    await expect(engine.listTargets()).resolves.toEqual(cached);
    // Crucially: no second browser, and no context recycling mid-run.
    expect(tools).toHaveLength(1);

    await settle(engine, summary.id);
    await engine.close();
  });
});

describe("LocalEngine subscriptions", () => {
  it("streams run events and replays for a late subscriber", async () => {
    const { engine } = createEngine([createPlugin("a", [task("a1")])]);

    const summary = await engine.startRun();
    await settle(engine, summary.id);

    const late: RunEvent[] = [];
    engine.subscribeRun(summary.id, (event) => late.push(event));

    expect(late.map((event) => event.type)).toContain("run:complete");
    expect(late[0]?.seq).toBe(1);

    await engine.close();
  });

  it("replays only what a reconnecting subscriber missed", async () => {
    const { engine } = createEngine([createPlugin("a", [task("a1")])]);

    const summary = await engine.startRun();
    await settle(engine, summary.id);

    const all: RunEvent[] = [];
    engine.subscribeRun(summary.id, (event) => all.push(event));

    const resumed: RunEvent[] = [];
    engine.subscribeRun(summary.id, (event) => resumed.push(event), {
      sinceSeq: 2,
    });

    expect(resumed).toEqual(all.filter((event) => event.seq > 2));

    await engine.close();
  });
});

describe("LocalEngine cancellation and shutdown", () => {
  it("cancels an active run", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const plugin = createPlugin("a", [task("a1"), task("a2")], async () => {
      await gate;
      return { filepath: `${outputDir}/actual/a.png`, success: true };
    });
    const { engine } = createEngine([plugin]);

    const summary = await engine.startRun();
    await engine.cancelRun(summary.id);
    release?.();

    const detail = await settle(engine, summary.id);
    expect(detail.state).toBe("cancelled");

    await engine.close();
  });

  it("cancelling an unknown run is a no-op", async () => {
    const { engine } = createEngine([createPlugin("a", [])]);

    await expect(engine.cancelRun("nope")).resolves.toBeUndefined();

    await engine.close();
  });

  it("closes the browser and refuses further work", async () => {
    const { engine, tools } = createEngine([createPlugin("a", [task("a1")])]);

    await engine.listTargets();
    await engine.close();

    expect(tools[0]?.close).toHaveBeenCalledOnce();
    await expect(engine.startRun()).rejects.toThrow(/closed/);
  });
});

describe("LocalEngine screenshots", () => {
  const screenshots = [
    {
      id: "1",
      name: "button",
      category: "new",
      actualPath: "actual/button.png",
    },
    {
      id: "2",
      name: "card",
      category: "passed",
      actualPath: "actual/card.png",
      expectedPath: "expected/card.png",
    },
  ] as Screenshot[];

  it("reads the index from disk on every call", async () => {
    vi.mocked(collectScreenshots).mockResolvedValue(screenshots);
    const { engine } = createEngine([]);

    await engine.listScreenshots();
    await engine.listScreenshots();

    expect(collectScreenshots).toHaveBeenCalledTimes(2);

    await engine.close();
  });

  it("filters by category and search term", async () => {
    vi.mocked(collectScreenshots).mockResolvedValue(screenshots);
    const { engine } = createEngine([]);

    await expect(engine.listScreenshots({ category: "new" })).resolves.toEqual([
      screenshots[0],
    ]);
    await expect(engine.listScreenshots({ search: "CARD" })).resolves.toEqual([
      screenshots[1],
    ]);

    await engine.close();
  });

  it("reports names it could not approve", async () => {
    vi.mocked(collectScreenshots).mockResolvedValue(screenshots);
    const { engine } = createEngine([]);

    const result = await engine.approve(["missing"]);

    expect(result).toEqual({
      approved: [],
      errors: [{ name: "missing", error: "Screenshot not found" }],
    });

    await engine.close();
  });
});

describe("engine error guards", () => {
  /**
   * `@cappa/core` ships dual ESM/CJS builds, so a CJS consumer and an ESM one
   * hold different copies of these classes and `instanceof` between them is
   * false. That silently turned a 409 into a 500 in the server. The guards must
   * therefore key off a stable code, not class identity — simulated here with a
   * structurally identical error that shares no prototype.
   */
  const fromAnotherCopy = (code: string, extra: Record<string, unknown>) =>
    Object.assign(new Error("thrown by a duplicate module instance"), {
      code,
      ...extra,
    });

  it("recognises its own errors", () => {
    expect(isRunInProgressError(new RunInProgressError("run-1"))).toBe(true);
    expect(isUnknownTargetsError(new UnknownTargetsError(["a"]))).toBe(true);
  });

  it("recognises an equivalent error from a duplicate module copy", () => {
    const duplicate = fromAnotherCopy(ENGINE_ERROR_CODES.runInProgress, {
      activeRunId: "run-1",
    });

    expect(duplicate instanceof RunInProgressError).toBe(false);
    expect(isRunInProgressError(duplicate)).toBe(true);

    const unknown = fromAnotherCopy(ENGINE_ERROR_CODES.unknownTargets, {
      taskIds: ["ghost"],
    });
    expect(unknown instanceof UnknownTargetsError).toBe(false);
    expect(isUnknownTargetsError(unknown)).toBe(true);
  });

  it("does not confuse the two error kinds", () => {
    expect(isUnknownTargetsError(new RunInProgressError("run-1"))).toBe(false);
    expect(isRunInProgressError(new UnknownTargetsError(["a"]))).toBe(false);
  });

  it("rejects non-errors and unrelated errors", () => {
    expect(isRunInProgressError(undefined)).toBe(false);
    expect(
      isRunInProgressError({ code: ENGINE_ERROR_CODES.runInProgress }),
    ).toBe(false);
    expect(isRunInProgressError(new Error("boom"))).toBe(false);
  });
});

/** A watcher the test drives, standing in for chokidar. */
class FakeWatcher implements FileWatcher {
  closeCount = 0;
  private allListeners: ((event: string, path: string) => void)[] = [];

  on(event: string, listener: (...args: any[]) => void): unknown {
    if (event === "all") {
      this.allListeners.push(listener);
    }
    if (event === "ready") {
      listener();
    }
    return this;
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }

  save(path: string): void {
    for (const listener of this.allListeners) {
      listener("change", path);
    }
  }
}

const watchPlugin = (
  name: string,
  tasks: PluginTask[],
  watch?: RunnablePlugin["watch"],
): RunnablePlugin => ({
  ...createPlugin(name, tasks),
  watch,
});

const byStoryFile: RunnablePlugin["watch"] = {
  paths: ["**/*.stories.tsx"],
  resolve: (file, tasks) => {
    const affected = tasks
      .filter((entry) => (entry.data as { file?: string })?.file === file)
      .map((entry) => entry.id);
    return affected.length > 0 ? affected : null;
  },
};

const storyTask = (id: string, file: string): PluginTask => ({
  ...task(id),
  data: { file },
});

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe("LocalEngine watch", () => {
  const createWatchEngine = (plugins: RunnablePlugin[]) => {
    const watcher = new FakeWatcher();
    const { engine, tools } = createEngine(plugins, {
      cwd: "/project",
      createWatcher: () => watcher,
    });
    return { engine, tools, watcher };
  };

  it("captures the affected tasks through an ordinary run", async () => {
    const { engine, watcher } = createWatchEngine([
      watchPlugin(
        "storybook",
        [
          storyTask("button--primary", "src/Button.stories.tsx"),
          storyTask("input--default", "src/Input.stories.tsx"),
        ],
        byStoryFile,
      ),
    ]);

    await engine.startWatch({ debounceMs: 1 });
    watcher.save("src/Button.stories.tsx");
    await tick(80);

    const runs = await engine.listRuns();
    expect(runs).toHaveLength(1);
    // A watch capture is a normal run: same store, same summary, and it says
    // what triggered it.
    expect(runs[0]?.request).toMatchObject({
      taskIds: ["button--primary"],
      clearActual: false,
      trigger: { source: "watch", files: ["src/Button.stories.tsx"] },
    });

    await engine.close();
  });

  it("keeps the browser warm across iterations", async () => {
    const { engine, tools, watcher } = createWatchEngine([
      watchPlugin("storybook", [storyTask("a", "a.stories.tsx")], byStoryFile),
    ]);

    await engine.startWatch({ debounceMs: 1 });
    watcher.save("a.stories.tsx");
    await tick(80);
    watcher.save("a.stories.tsx");
    await tick(80);

    // One browser for discovery and both runs — the whole point of holding the
    // eviction lease.
    expect(tools).toHaveLength(1);
    expect(engine.isWarm).toBe(true);

    await engine.close();
  });

  it("survives the idle timeout while watching", async () => {
    const watcher = new FakeWatcher();
    const { engine } = createEngine(
      [
        watchPlugin(
          "storybook",
          [storyTask("a", "a.stories.tsx")],
          byStoryFile,
        ),
      ],
      // Zero is the CLI's one-shot setting: without a lease it would close the
      // browser the moment a run released it.
      { browserIdleTimeoutMs: 0, createWatcher: () => watcher },
    );

    await engine.startWatch({ debounceMs: 1 });
    watcher.save("a.stories.tsx");
    await tick(80);

    expect(engine.isWarm).toBe(true);

    await engine.close();
  });

  it("streams watch events, with replay from a sequence number", async () => {
    const { engine, watcher } = createWatchEngine([
      watchPlugin("storybook", [storyTask("a", "a.stories.tsx")], byStoryFile),
    ]);

    const seen: WatchEvent[] = [];
    await engine.startWatch({ debounceMs: 1 });
    watcher.save("a.stories.tsx");
    await tick(80);

    const unsubscribe = engine.subscribeWatch((event) => seen.push(event));

    expect(seen.map((event) => event.type)).toEqual([
      "watch:start",
      "watch:change",
    ]);
    expect(seen[0]?.seq).toBe(1);

    const late: WatchEvent[] = [];
    engine.subscribeWatch((event) => late.push(event), { sinceSeq: 1 });
    expect(late.map((event) => event.type)).toEqual(["watch:change"]);

    unsubscribe();
    await engine.close();
  });

  it("refuses a second watch session", async () => {
    const { engine } = createWatchEngine([watchPlugin("storybook", [])]);

    await engine.startWatch({ debounceMs: 1 });
    const error = await engine.startWatch().catch((e) => e);

    expect(isWatchInProgressError(error)).toBe(true);

    await engine.close();
  });

  it("reports status, and stops on request", async () => {
    const { engine, watcher } = createWatchEngine([
      watchPlugin("storybook", []),
    ]);

    await expect(engine.getWatchStatus()).resolves.toMatchObject({
      active: false,
    });

    await engine.startWatch({ debounceMs: 1, filter: "Button/*" });
    await expect(engine.getWatchStatus()).resolves.toMatchObject({
      active: true,
      filter: "Button/*",
    });

    await engine.stopWatch();

    expect(watcher.closeCount).toBe(1);
    await expect(engine.getWatchStatus()).resolves.toMatchObject({
      active: false,
    });
    // Stoppable again, and startable again.
    await engine.stopWatch();
    await engine.startWatch({ debounceMs: 1 });

    await engine.close();
  });

  it("stops the watch session when the engine closes", async () => {
    const { engine, watcher } = createWatchEngine([
      watchPlugin("storybook", []),
    ]);

    await engine.startWatch({ debounceMs: 1 });
    await engine.close();

    expect(watcher.closeCount).toBe(1);
    expect(engine.isWarm).toBe(false);
  });
});

/**
 * A pretend app under test: `spawn` "starts" it, the probe sees it, and a
 * test can crash it or watch it being killed — no real processes.
 */
const createFakeServers = ({ alreadyServing = false } = {}) => {
  let serving = alreadyServing;
  const processes: {
    kill: ReturnType<typeof vi.fn>;
    crash: (exit: ProcessExit, output?: string) => void;
  }[] = [];

  const spawn = vi.fn((_command: string) => {
    let resolveExit: (exit: ProcessExit) => void = () => {};
    let exit: ProcessExit | undefined;
    const exited = new Promise<ProcessExit>((resolve) => {
      resolveExit = (value) => {
        exit ??= value;
        resolve(value);
      };
    });
    const output = new OutputTail();
    serving = true;

    const kill = vi.fn(async () => {
      serving = false;
      resolveExit({ code: null, signal: "SIGTERM" });
    });
    processes.push({
      kill,
      crash: (value, text = "") => {
        output.push(text);
        serving = false;
        resolveExit(value);
      },
    });

    return {
      pid: 1234,
      exited,
      get exit() {
        return exit;
      },
      output,
      kill,
    };
  });

  return {
    spawn,
    processes,
    probe: vi.fn(async () => serving),
    get serving() {
      return serving;
    },
  };
};

const storybookServer: ResolvedWebServerConfig = {
  command: "pnpm storybook --ci",
  url: "http://localhost:6006",
  reuseExistingServer: true,
  timeout: 1000,
  cwd: "/repo",
  env: {},
};

const logMessages = async (engine: LocalEngine, runId: string) => {
  const messages: string[] = [];
  engine.subscribeRun(runId, (event) => {
    if (event.type === "log") {
      messages.push(event.message);
    }
  })();
  return messages;
};

describe("LocalEngine web servers", () => {
  it("starts nothing until the first run, then starts the server inside it", async () => {
    const servers = createFakeServers();
    const { engine } = createEngine([createPlugin("a", [task("one")])], {
      webServer: [storybookServer],
      webServerPool: servers,
    });

    expect(servers.spawn).not.toHaveBeenCalled();

    const run = await engine.startRun();
    await settle(engine, run.id);

    expect(servers.spawn).toHaveBeenCalledWith(
      "pnpm storybook --ci",
      expect.objectContaining({ cwd: "/repo" }),
    );
    expect(await logMessages(engine, run.id)).toContainEqual(
      expect.stringContaining("Started `pnpm storybook --ci`"),
    );

    await engine.close();
  });

  it("keeps a started server for the next run and says so", async () => {
    const servers = createFakeServers();
    const { engine } = createEngine([createPlugin("a", [task("one")])], {
      webServer: [storybookServer],
      webServerPool: servers,
    });

    await settle(engine, (await engine.startRun()).id);
    const second = await engine.startRun();
    await settle(engine, second.id);

    expect(servers.spawn).toHaveBeenCalledTimes(1);
    expect(await logMessages(engine, second.id)).toContainEqual(
      expect.stringContaining("started earlier by cappa"),
    );

    await engine.close();
  });

  it("starts the server for discovery from the UI", async () => {
    const servers = createFakeServers();
    const { engine } = createEngine([createPlugin("a", [task("one")])], {
      webServer: [storybookServer],
      webServerPool: servers,
    });

    await engine.listTargets();

    expect(servers.spawn).toHaveBeenCalledTimes(1);
    await engine.close();
  });

  it("stops the server on close", async () => {
    const servers = createFakeServers();
    const { engine } = createEngine([createPlugin("a", [task("one")])], {
      webServer: [storybookServer],
      webServerPool: servers,
    });

    await settle(engine, (await engine.startRun()).id);
    await engine.close();

    expect(servers.processes[0]?.kill).toHaveBeenCalled();
    expect(servers.serving).toBe(false);
  });

  it("stops the server with the idle browser and starts it again on the next run", async () => {
    const servers = createFakeServers();
    const { engine } = createEngine([createPlugin("a", [task("one")])], {
      webServer: [storybookServer],
      webServerPool: servers,
      browserIdleTimeoutMs: 10,
    });

    await settle(engine, (await engine.startRun()).id);
    await vi.waitFor(() => expect(engine.isWarm).toBe(false));
    await vi.waitFor(() =>
      expect(servers.processes[0]?.kill).toHaveBeenCalled(),
    );

    await settle(engine, (await engine.startRun()).id);
    expect(servers.spawn).toHaveBeenCalledTimes(2);

    await engine.close();
  });

  it("stops the server after a one-shot run with no idle timeout", async () => {
    const servers = createFakeServers();
    const { engine } = createEngine([createPlugin("a", [task("one")])], {
      webServer: [storybookServer],
      webServerPool: servers,
      browserIdleTimeoutMs: 0,
    });

    await settle(engine, (await engine.startRun()).id);
    await vi.waitFor(() =>
      expect(servers.processes[0]?.kill).toHaveBeenCalled(),
    );
    await engine.close();
  });

  it("reuses a server that is already up, and never stops it", async () => {
    const servers = createFakeServers({ alreadyServing: true });
    const { engine } = createEngine([createPlugin("a", [task("one")])], {
      webServer: [storybookServer],
      webServerPool: servers,
    });

    const run = await engine.startRun();
    await settle(engine, run.id);
    await engine.close();

    expect(servers.spawn).not.toHaveBeenCalled();
    expect(servers.serving).toBe(true);
    expect(await logMessages(engine, run.id)).toContainEqual(
      expect.stringContaining("Reusing server at http://localhost:6006"),
    );
  });

  it("fails the run when the server does not start, and frees the engine", async () => {
    const servers = createFakeServers();
    servers.spawn.mockImplementationOnce(() => {
      const output = new OutputTail();
      output.push("ERR_PNPM_NO_SCRIPT Missing script: storybook\n");
      const exit = { code: 1, signal: null };
      return {
        pid: 1,
        exited: Promise.resolve(exit),
        exit,
        output,
        kill: vi.fn(async () => {}),
      };
    });
    servers.probe.mockResolvedValue(false);
    const plugin = createPlugin("a", [task("one")]);
    const { engine } = createEngine([plugin], {
      webServer: [storybookServer],
      webServerPool: servers,
    });

    const run = await engine.startRun();
    const detail = await settle(engine, run.id);

    expect(detail.state).toBe("failed");
    expect(detail.error?.message).toContain("exited with code 1");
    expect(detail.error?.message).toContain("Missing script: storybook");
    expect(plugin.discover).not.toHaveBeenCalled();

    // The engine is free for another attempt.
    servers.probe.mockImplementation(async () => servers.serving);
    const retry = await engine.startRun();
    expect((await settle(engine, retry.id)).state).toBe("completed");
    await engine.close();
  });

  it("explains refused tasks with a crashed server's output, then restarts it", async () => {
    const servers = createFakeServers();
    const plugin = createPlugin("a", [task("one")], async () => {
      servers.processes[0]?.crash(
        { code: 137, signal: null },
        "JavaScript heap out of memory\n",
      );
      // Let the pool notice the exit before the task reports.
      await new Promise((resolve) => setImmediate(resolve));
      return {
        error:
          "page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:6006/iframe.html",
      };
    });
    const { engine } = createEngine([plugin], {
      webServer: [storybookServer],
      webServerPool: servers,
    });

    const detail = await settle(engine, (await engine.startRun()).id);
    const error = String(detail.failures[0]?.result.error);

    expect(error).toContain("Cannot reach http://localhost:6006");
    expect(error).toContain("exited with code 137");
    expect(error).toContain("JavaScript heap out of memory");

    vi.mocked(plugin.execute).mockResolvedValue({
      filepath: `${outputDir}/actual/a.png`,
      success: true,
    });
    await settle(engine, (await engine.startRun()).id);
    expect(servers.spawn).toHaveBeenCalledTimes(2);

    await engine.close();
  });

  it("suggests a webServer for refused tasks when none is configured", async () => {
    const plugin = createPlugin("a", [task("one")], async () => ({
      error: "page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:6006/",
    }));
    const { engine } = createEngine([plugin]);

    const detail = await settle(engine, (await engine.startRun()).id);

    expect(String(detail.failures[0]?.result.error)).toContain(
      "add a `webServer` entry to cappa.config.ts",
    );
    await engine.close();
  });
});
