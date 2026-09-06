import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  glob: vi.fn(),
}));

vi.mock("../screenshots/collectScreenshots", () => ({
  collectScreenshots: vi.fn(async () => []),
}));

import { glob } from "node:fs/promises";
import type { PluginTask } from "../plugin";
import type { RunEvent, RunnablePlugin } from "../runner/types";
import type ScreenshotTool from "../screenshot";
import { collectScreenshots } from "../screenshots/collectScreenshots";
import type { Screenshot } from "../types";
import { LocalEngine } from "./LocalEngine";
import { RunInProgressError, UnknownTargetsError } from "./types";

const task = (id: string): PluginTask => ({ id, url: `http://x/${id}` });

const createTool = () =>
  ({
    outputDir: "/out",
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
    filepath: "/out/actual/a.png",
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
    outputDir: "/out",
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
  vi.mocked(glob).mockReset();
  vi.mocked(glob).mockImplementation(async function* () {} as any);
  vi.mocked(collectScreenshots).mockReset();
  vi.mocked(collectScreenshots).mockResolvedValue([]);
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
      return { filepath: "/out/actual/a.png", success: true };
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
