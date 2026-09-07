import { describe, expect, it } from "vitest";
import type { PluginTask } from "../plugin";
import type {
  RunnablePlugin,
  RunSummary,
  StartRunRequest,
} from "../runner/types";
import type { EmittableWatchEvent } from "./types";
import {
  type FileWatcher,
  globRoot,
  WatchSession,
  type WatchSessionOptions,
} from "./WatchSession";

/**
 * A watcher a test can drive.
 *
 * Real filesystem events are asynchronous, ordered by the OS and different on
 * every platform; none of that is what these tests are about.
 */
class FakeWatcher implements FileWatcher {
  readonly closed = { count: 0 };
  private allListeners: ((event: string, path: string) => void)[] = [];
  private readyListeners: (() => void)[] = [];

  on(event: string, listener: (...args: any[]) => void): unknown {
    if (event === "all") {
      this.allListeners.push(listener);
    }
    if (event === "ready") {
      this.readyListeners.push(listener);
      // Ready straight away: the initial scan is not what is under test.
      listener();
    }
    return this;
  }

  async close(): Promise<void> {
    this.closed.count += 1;
  }

  emit(path: string, event = "change"): void {
    for (const listener of this.allListeners) {
      listener(event, path);
    }
  }
}

const task = (id: string, data?: unknown): PluginTask => ({
  id,
  url: `http://x/${id}`,
  data,
});

const plugin = (
  name: string,
  tasks: PluginTask[],
  watch?: RunnablePlugin["watch"],
): RunnablePlugin => ({
  name,
  description: `${name} plugin`,
  discover: async () => tasks,
  execute: async () => ({}),
  watch,
});

/** A plugin whose stories live in `data.file` — the shape of a precise plugin. */
const precisePlugin = (name: string, tasks: PluginTask[]) =>
  plugin(name, tasks, {
    paths: ["**/*.stories.tsx"],
    resolve: (file, all) => {
      const affected = all
        .filter((entry) => (entry.data as { file?: string })?.file === file)
        .map((entry) => entry.id);
      return affected.length > 0 ? affected : null;
    },
  });

type Harness = {
  session: WatchSession;
  watcher: FakeWatcher;
  requests: StartRunRequest[];
  events: EmittableWatchEvent[];
  finishRun: () => void;
  save: (...files: string[]) => Promise<void>;
};

const build = (
  plugins: RunnablePlugin[],
  overrides: Partial<WatchSessionOptions> = {},
): Harness => {
  const watcher = new FakeWatcher();
  const requests: StartRunRequest[] = [];
  const events: EmittableWatchEvent[] = [];

  let releaseRun: (() => void) | undefined;
  let runCount = 0;

  const session = new WatchSession({
    plugins,
    cwd: "/project",
    debounceMs: 1,
    createWatcher: () => watcher,
    discover: async () =>
      new Map(
        await Promise.all(
          plugins.map(
            async (entry) =>
              [entry.name, await entry.discover(undefined)] as const,
          ),
        ),
      ),
    startRun: async (request) => {
      requests.push(request);
      runCount += 1;
      return { id: `run-${runCount}` } as RunSummary;
    },
    waitForRun: () =>
      new Promise<void>((resolve) => {
        releaseRun = resolve;
      }),
    emit: (event) => events.push(event),
    ...overrides,
  });

  return {
    session,
    watcher,
    requests,
    events,
    finishRun: () => releaseRun?.(),
    save: async (...files: string[]) => {
      for (const file of files) {
        watcher.emit(file);
      }
      await tick(20);
    },
  };
};

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe("WatchSession", () => {
  it("captures only the tasks a changed file resolves to", async () => {
    const harness = build([
      precisePlugin("storybook", [
        task("button--primary", { file: "src/Button.stories.tsx" }),
        task("button--secondary", { file: "src/Button.stories.tsx" }),
        task("input--default", { file: "src/Input.stories.tsx" }),
      ]),
    ]);

    await harness.session.start();
    await harness.save("src/Button.stories.tsx");

    expect(harness.requests).toEqual([
      {
        taskIds: ["button--primary", "button--secondary"],
        filter: undefined,
        clearActual: false,
        trigger: { source: "watch", files: ["src/Button.stories.tsx"] },
      },
    ]);

    await harness.session.stop();
  });

  it("never clears actual/, so untouched diffs survive a save", async () => {
    const harness = build([
      precisePlugin("storybook", [task("a", { file: "a.stories.tsx" })]),
    ]);

    await harness.session.start();
    await harness.save("a.stories.tsx");

    expect(harness.requests[0]?.clearActual).toBe(false);

    await harness.session.stop();
  });

  it("coalesces a burst of saves into one run", async () => {
    const harness = build([
      precisePlugin("storybook", [
        task("a", { file: "a.stories.tsx" }),
        task("b", { file: "b.stories.tsx" }),
      ]),
    ]);

    await harness.session.start();
    // Three saves inside one debounce window — a formatter, or a save-all.
    harness.watcher.emit("a.stories.tsx");
    harness.watcher.emit("b.stories.tsx");
    harness.watcher.emit("a.stories.tsx");
    await tick(20);

    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0]?.taskIds).toEqual(["a", "b"]);

    await harness.session.stop();
  });

  it("queues a change that arrives during a run instead of rejecting it", async () => {
    const harness = build([
      precisePlugin("storybook", [
        task("a", { file: "a.stories.tsx" }),
        task("b", { file: "b.stories.tsx" }),
      ]),
    ]);

    await harness.session.start();
    await harness.save("a.stories.tsx");
    expect(harness.requests).toHaveLength(1);

    // While the first run is still going.
    harness.watcher.emit("b.stories.tsx");
    await tick(20);
    expect(harness.requests).toHaveLength(1);

    harness.finishRun();
    await tick(20);

    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[1]?.taskIds).toEqual(["b"]);

    await harness.session.stop();
  });

  it("runs a whole plugin when its resolve cannot tell", async () => {
    const harness = build([
      precisePlugin("storybook", [task("a", { file: "a.stories.tsx" })]),
    ]);

    await harness.session.start();
    // A component, not a story: the plugin returns null.
    await harness.save("src/Button.tsx");

    expect(harness.requests).toEqual([
      {
        plugins: ["storybook"],
        filter: undefined,
        clearActual: false,
        trigger: { source: "watch", files: ["src/Button.tsx"] },
      },
    ]);

    await harness.session.stop();
  });

  it("runs a whole plugin that has no watch support at all", async () => {
    const harness = build([plugin("pages", [task("home"), task("pricing")])]);

    await harness.session.start();
    await harness.save("src/anything.ts");

    expect(harness.requests[0]?.plugins).toEqual(["pages"]);

    await harness.session.stop();
  });

  it("expands a plugin that needs everything when another named tasks", async () => {
    // The common two-plugin case: storybook resolves precisely, pages cannot.
    const harness = build([
      precisePlugin("storybook", [task("a", { file: "a.stories.tsx" })]),
      plugin("pages", [task("home"), task("pricing")]),
    ]);

    await harness.session.start();
    await harness.save("a.stories.tsx");

    // `plugins` and `taskIds` compose as "and", so one request can only carry
    // both intents as ids.
    expect(harness.requests[0]?.taskIds).toEqual(["a", "home", "pricing"]);
    expect(harness.requests[0]?.plugins).toBeUndefined();

    await harness.session.stop();
  });

  it("falls back to a filtered full run above the task cap", async () => {
    const tasks = Array.from({ length: 5 }, (_, index) =>
      task(`t${index}`, { file: "many.stories.tsx" }),
    );
    const harness = build([precisePlugin("storybook", tasks)], {
      maxTasks: 3,
      filter: "Button/*",
    });

    await harness.session.start();
    await harness.save("many.stories.tsx");

    expect(harness.requests).toEqual([
      {
        filter: "Button/*",
        clearActual: false,
        trigger: { source: "watch", files: ["many.stories.tsx"] },
      },
    ]);

    await harness.session.stop();
  });

  it("captures everything when discovery itself fails", async () => {
    const harness = build(
      [precisePlugin("storybook", [task("a", { file: "a.stories.tsx" })])],
      {
        discover: async () => {
          throw new Error("Storybook is restarting");
        },
      },
    );

    await harness.session.start();
    await harness.save("a.stories.tsx");

    expect(harness.requests[0]).toMatchObject({ clearActual: false });
    expect(harness.requests[0]?.taskIds).toBeUndefined();

    await harness.session.stop();
  });

  it("treats a resolve that throws as 'cannot tell'", async () => {
    const harness = build([
      plugin("storybook", [task("a")], {
        paths: [],
        resolve: () => {
          throw new Error("boom");
        },
      }),
    ]);

    await harness.session.start();
    await harness.save("a.stories.tsx");

    expect(harness.requests[0]?.plugins).toEqual(["storybook"]);

    await harness.session.stop();
  });

  it("reports the change it acted on, with the run it started", async () => {
    const harness = build([
      precisePlugin("storybook", [task("a", { file: "a.stories.tsx" })]),
    ]);

    await harness.session.start();
    await harness.save("a.stories.tsx");

    expect(harness.events[0]).toEqual({
      type: "watch:start",
      paths: ["."],
      filter: undefined,
      debounceMs: 1,
    });
    expect(harness.events[1]).toEqual({
      type: "watch:change",
      files: ["a.stories.tsx"],
      scope: "tasks",
      taskIds: ["a"],
      runId: "run-1",
      error: undefined,
    });
    expect(harness.session.getStatus()).toMatchObject({
      active: true,
      lastChange: { files: ["a.stories.tsx"], runId: "run-1" },
    });

    await harness.session.stop();
  });

  it("reports a run it could not start, and keeps watching", async () => {
    const harness = build(
      [precisePlugin("storybook", [task("a", { file: "a.stories.tsx" })])],
      {
        startRun: async () => {
          throw new Error("A capture run is already in progress (run-9)");
        },
      },
    );

    await harness.session.start();
    await harness.save("a.stories.tsx");

    expect(harness.events.at(-1)).toMatchObject({
      type: "watch:change",
      runId: undefined,
      error: "A capture run is already in progress (run-9)",
    });
    expect(harness.session.getStatus().active).toBe(true);

    await harness.session.stop();
  });

  it("ignores directory events", async () => {
    const harness = build([
      precisePlugin("storybook", [task("a", { file: "a.stories.tsx" })]),
    ]);

    await harness.session.start();
    harness.watcher.emit("src/components", "addDir");
    await tick(20);

    expect(harness.requests).toHaveLength(0);

    await harness.session.stop();
  });

  it("leaves nothing running after stop", async () => {
    const harness = build([
      precisePlugin("storybook", [task("a", { file: "a.stories.tsx" })]),
    ]);

    await harness.session.start();
    await harness.session.stop();

    expect(harness.watcher.closed.count).toBe(1);
    expect(harness.events.at(-1)).toEqual({
      type: "watch:stop",
      reason: "requested",
    });
    expect(harness.session.getStatus().active).toBe(false);

    // A change after stopping is not acted on.
    harness.watcher.emit("a.stories.tsx");
    await tick(20);
    expect(harness.requests).toHaveLength(0);
  });

  it("stops once, however many times it is asked", async () => {
    const harness = build([precisePlugin("storybook", [])]);

    await harness.session.start();
    await harness.session.stop();
    await harness.session.stop();

    expect(harness.watcher.closed.count).toBe(1);
  });

  it("watches the project root, plus the roots of plugin globs", async () => {
    const watcher = new FakeWatcher();
    const roots: string[][] = [];
    const create = (given: string[]) => {
      roots.push(given);
      return watcher;
    };

    const session = new WatchSession({
      plugins: [
        plugin("a", [], {
          paths: ["packages/ui/**/*.stories.tsx"],
          resolve: () => null,
        }),
      ],
      cwd: "/project",
      paths: ["src"],
      createWatcher: create,
      discover: async () => new Map(),
      startRun: async () => ({ id: "run-1" }) as RunSummary,
      waitForRun: async () => {},
    });

    await session.start();

    expect(roots[0]).toEqual(["src", "packages/ui"]);

    await session.stop();
  });

  it("never watches the output directory or the usual junk", async () => {
    const watcher = new FakeWatcher();
    let ignored: (candidate: string) => boolean = () => false;

    const session = new WatchSession({
      plugins: [],
      cwd: "/project",
      ignoredPaths: ["screenshots"],
      createWatcher: (_roots, options) => {
        ignored = options.ignored;
        return watcher;
      },
      discover: async () => new Map(),
      startRun: async () => ({ id: "run-1" }) as RunSummary,
      waitForRun: async () => {},
    });

    await session.start();

    // Capturing writes PNGs here; watching it would make every run trigger the
    // next one, forever.
    expect(ignored("/project/screenshots/actual/a.png")).toBe(true);
    expect(ignored("/project/node_modules/react/index.js")).toBe(true);
    expect(ignored("/project/dist/index.js")).toBe(true);
    expect(ignored("/project/.git/HEAD")).toBe(true);
    expect(ignored("/elsewhere/src/a.tsx")).toBe(true);
    expect(ignored("/project/src/Button.tsx")).toBe(false);

    await session.stop();
  });
});

describe("globRoot", () => {
  it("keeps the static prefix of a glob", () => {
    expect(globRoot("**/*.stories.tsx")).toBe(".");
    expect(globRoot("packages/ui/**/*.stories.tsx")).toBe("packages/ui");
    expect(globRoot("src/*.tsx")).toBe("src");
    expect(globRoot("src/components/Button.tsx")).toBe(
      "src/components/Button.tsx",
    );
    expect(globRoot("apps/@(web|docs)/**")).toBe("apps");
  });
});
