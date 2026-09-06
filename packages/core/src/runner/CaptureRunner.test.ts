import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  glob: vi.fn(),
}));

import { glob } from "node:fs/promises";
import type { ScreenshotFileSystem } from "../filesystem";
import type { PluginTask } from "../plugin";
import type ScreenshotTool from "../screenshot";
import { CaptureRunner } from "./CaptureRunner";
import type { RunEvent, RunnablePlugin } from "./types";

/** No `expected/` or `actual/` files on disk unless a test says otherwise. */
const mockNoScreenshotsOnDisk = () => {
  vi.mocked(glob).mockImplementation(async function* () {} as any);
};

/**
 * A stand-in for `ScreenshotFileSystem`.
 *
 * Injecting this is what keeps these tests off the disk entirely: the real
 * constructor creates `actual/`, `expected/` and `diff/` eagerly, so a runner
 * built without it would try to `mkdir` the output directory below — which
 * only succeeds when the tests happen to run as root. Keep it injected, or
 * switch `outputDir` to a temp directory as `LocalEngine.test.ts` does.
 */
const createFileSystem = () =>
  ({
    clearActual: vi.fn(),
    clearDiff: vi.fn(),
  }) as unknown as ScreenshotFileSystem & {
    clearActual: ReturnType<typeof vi.fn>;
    clearDiff: ReturnType<typeof vi.fn>;
  };

const createScreenshotTool = (concurrency = 1) =>
  ({
    outputDir: "/out",
    concurrency,
    getPageFromPool: vi.fn((index: number) => ({ page: index })),
  }) as unknown as ScreenshotTool;

const task = (id: string): PluginTask => ({
  id,
  url: `http://localhost:6006/?id=${id}`,
});

type FakePluginOptions = {
  name?: string;
  tasks?: PluginTask[];
  execute?: RunnablePlugin["execute"];
  initPage?: RunnablePlugin["initPage"];
};

const createPlugin = ({
  name = "fake",
  tasks = [],
  execute = async () => ({ filepath: "/out/actual/a.png", success: true }),
  initPage,
}: FakePluginOptions = {}): RunnablePlugin => ({
  name,
  description: "fake plugin",
  discover: vi.fn(async () => tasks),
  execute: vi.fn(execute),
  ...(initPage ? { initPage: vi.fn(initPage) } : {}),
});

const createRunner = (
  plugins: RunnablePlugin[],
  overrides: Partial<ConstructorParameters<typeof CaptureRunner>[0]> = {},
) => {
  const events: RunEvent[] = [];
  const runner = new CaptureRunner({
    screenshotTool: createScreenshotTool(),
    plugins,
    outputDir: "/out",
    fileSystem: createFileSystem(),
    id: "run-1",
    ...overrides,
  });
  runner.on((event) => events.push(event));
  return { runner, events };
};

const typesOf = (events: RunEvent[]) => events.map((event) => event.type);

beforeEach(() => {
  vi.mocked(glob).mockReset();
  mockNoScreenshotsOnDisk();
});

describe("CaptureRunner lifecycle", () => {
  it("emits an ordered event stream for a successful run", async () => {
    const plugin = createPlugin({ tasks: [task("a"), task("b")] });
    const { runner, events } = createRunner([plugin]);

    await runner.run();

    expect(typesOf(events).filter((type) => type !== "log")).toEqual([
      "run:start",
      "discover:start",
      "discover:plugin",
      "discover:complete",
      "plugin:start",
      "task:start",
      "task:complete",
      "task:start",
      "task:complete",
      "plugin:complete",
      "run:complete",
    ]);
  });

  it("assigns monotonic 1-based sequence numbers", async () => {
    const plugin = createPlugin({ tasks: [task("a")] });
    const { runner, events } = createRunner([plugin]);

    await runner.run();

    expect(events.map((event) => event.seq)).toEqual(
      events.map((_, index) => index + 1),
    );
    expect(events.every((event) => event.runId === "run-1")).toBe(true);
  });

  it("reaches the completed state with per-task records", async () => {
    const plugin = createPlugin({ tasks: [task("a"), task("b")] });
    const { runner } = createRunner([plugin]);

    const detail = await runner.run();

    expect(detail.state).toBe("completed");
    expect(detail.totalTasks).toBe(2);
    expect(detail.completedTasks).toBe(2);
    expect(detail.failedTasks).toBe(0);
    expect(detail.tasks.map((record) => record.status)).toEqual([
      "passed",
      "passed",
    ]);
  });

  it("refuses to start twice", async () => {
    const { runner } = createRunner([createPlugin()]);

    await runner.run();

    await expect(runner.run()).rejects.toThrow(/already been started/);
  });
});

describe("CaptureRunner clearing", () => {
  it("clears actual and diff by default", async () => {
    const fileSystem = createFileSystem();
    const { runner } = createRunner([createPlugin()], { fileSystem });

    await runner.run();

    expect(fileSystem.clearActual).toHaveBeenCalledOnce();
    expect(fileSystem.clearDiff).toHaveBeenCalledOnce();
  });

  it("leaves existing output alone when clearActual is false", async () => {
    const fileSystem = createFileSystem();
    const { runner } = createRunner([createPlugin()], { fileSystem });

    await runner.run({ clearActual: false });

    expect(fileSystem.clearActual).not.toHaveBeenCalled();
    expect(fileSystem.clearDiff).not.toHaveBeenCalled();
  });
});

describe("CaptureRunner selection", () => {
  it("runs only the requested plugins", async () => {
    const wanted = createPlugin({ name: "wanted", tasks: [task("a")] });
    const other = createPlugin({ name: "other", tasks: [task("b")] });
    const { runner } = createRunner([wanted, other]);

    await runner.run({ plugins: ["wanted"] });

    expect(wanted.discover).toHaveBeenCalledOnce();
    expect(other.discover).not.toHaveBeenCalled();
  });

  it("applies a glob filter and reports the counts", async () => {
    const plugin = createPlugin({
      name: "storybook",
      tasks: [task("button--primary"), task("card--default")],
    });
    const { runner, events } = createRunner([plugin]);

    await runner.run({ filter: "button*" });

    expect(plugin.execute).toHaveBeenCalledOnce();
    const applied = events.find((event) => event.type === "filter:applied");
    expect(applied).toMatchObject({
      filter: "button*",
      plugins: [{ plugin: "storybook", before: 2, after: 1 }],
    });
  });

  it("captures an explicit task id selection", async () => {
    const plugin = createPlugin({
      tasks: [task("a"), task("b"), task("c")],
    });
    const { runner } = createRunner([plugin]);

    await runner.run({ taskIds: ["b"] });

    expect(vi.mocked(plugin.execute).mock.calls.map(([t]) => t.id)).toEqual([
      "b",
    ]);
  });

  it("composes filter and taskIds", async () => {
    const plugin = createPlugin({
      tasks: [task("button--a"), task("button--b"), task("card--a")],
    });
    const { runner } = createRunner([plugin]);

    await runner.run({ filter: "button*", taskIds: ["button--b", "card--a"] });

    expect(vi.mocked(plugin.execute).mock.calls.map(([t]) => t.id)).toEqual([
      "button--b",
    ]);
  });

  it("does not emit filter:applied when nothing was selected", async () => {
    const plugin = createPlugin({ tasks: [task("a")] });
    const { runner, events } = createRunner([plugin]);

    await runner.run();

    expect(typesOf(events)).not.toContain("filter:applied");
  });

  it("skips plugins with no matching tasks", async () => {
    const plugin = createPlugin({ tasks: [task("a")] });
    const { runner, events } = createRunner([plugin]);

    await runner.run({ filter: "nothing*" });

    expect(plugin.execute).not.toHaveBeenCalled();
    expect(typesOf(events)).not.toContain("plugin:start");
    expect(runner.getSummary().anyTasksRan).toBe(false);
  });
});

describe("CaptureRunner failures", () => {
  it("records failing screenshots without failing the run", async () => {
    const plugin = createPlugin({
      name: "storybook",
      tasks: [task("a"), task("b")],
      execute: async (t) =>
        t.id === "a"
          ? { success: false, filepath: "/out/actual/a.png" }
          : { success: true, filepath: "/out/actual/b.png" },
    });
    const { runner, events } = createRunner([plugin]);

    const detail = await runner.run();

    expect(detail.state).toBe("completed");
    expect(detail.failedTasks).toBe(1);
    expect(detail.failures).toEqual([
      {
        taskId: "a",
        taskUrl: "http://localhost:6006/?id=a",
        pluginName: "storybook",
        result: { success: false, filepath: "/out/actual/a.png" },
      },
    ]);
    expect(runner.hasScreenshotFailure).toBe(true);

    const pluginComplete = events.find(
      (event) => event.type === "plugin:complete",
    );
    expect(pluginComplete).toMatchObject({ failed: true });
  });

  it("maps result shapes onto task statuses", async () => {
    const plugin = createPlugin({
      tasks: [task("new"), task("changed"), task("skipped")],
      execute: async (t) => {
        if (t.id === "new") {
          return { isNew: true, filepath: "/out/actual/new.png" };
        }
        if (t.id === "changed") {
          return { success: false, filepath: "/out/actual/changed.png" };
        }
        return { skipped: true };
      },
    });
    const { runner } = createRunner([plugin]);

    const detail = await runner.run();

    expect(
      Object.fromEntries(
        detail.tasks.map((record) => [record.id, record.status]),
      ),
    ).toEqual({ new: "new", changed: "changed", skipped: "skipped" });
  });

  it("emits run:error and rejects when a plugin throws", async () => {
    const boom = new Error("execute exploded");
    const plugin = createPlugin({
      tasks: [task("a")],
      execute: async () => {
        throw boom;
      },
    });
    const { runner, events } = createRunner([plugin]);

    await expect(runner.run()).rejects.toThrow("execute exploded");

    expect(runner.getSummary().state).toBe("failed");
    expect(events.at(-1)).toMatchObject({
      type: "run:error",
      error: { message: "execute exploded" },
    });
  });

  it("emits run:error when discovery throws", async () => {
    const plugin = createPlugin();
    vi.mocked(plugin.discover).mockRejectedValue(new Error("discover failed"));
    const { runner, events } = createRunner([plugin]);

    await expect(runner.run()).rejects.toThrow("discover failed");
    expect(typesOf(events)).toContain("run:error");
  });

  it("reports deleted baselines as a screenshot failure", async () => {
    vi.mocked(glob).mockImplementation(async function* (pattern: string) {
      if (pattern.includes("actual")) {
        return;
      }
      yield "/out/expected/gone.png";
    } as any);

    const plugin = createPlugin({ tasks: [task("a")] });
    const { runner } = createRunner([plugin]);

    const detail = await runner.run();

    expect(detail.deletedScreenshots).toEqual(["gone.png"]);
    expect(runner.hasScreenshotFailure).toBe(true);
  });

  it("does not check for deleted baselines when no tasks ran", async () => {
    const { runner } = createRunner([createPlugin()]);

    await runner.run();

    expect(glob).not.toHaveBeenCalled();
  });

  it("survives a listener that throws", async () => {
    const plugin = createPlugin({ tasks: [task("a")] });
    const { runner } = createRunner([plugin]);
    runner.on(() => {
      throw new Error("bad observer");
    });

    await expect(runner.run()).resolves.toMatchObject({ state: "completed" });
  });
});

describe("CaptureRunner cancellation", () => {
  it("stops starting tasks once aborted and ends in the cancelled state", async () => {
    const started: string[] = [];
    const plugin = createPlugin({
      tasks: [task("a"), task("b"), task("c")],
      execute: async (t) => {
        started.push(t.id);
        return { filepath: `/out/actual/${t.id}.png`, success: true };
      },
    });

    const { runner, events } = createRunner([plugin]);
    runner.on((event) => {
      if (event.type === "task:complete" && event.taskId === "a") {
        runner.abort();
      }
    });

    const detail = await runner.run();

    expect(started).toEqual(["a"]);
    expect(detail.state).toBe("cancelled");
    expect(typesOf(events)).toContain("run:cancelled");
  });

  it("skips execution entirely when aborted during discovery", async () => {
    const plugin = createPlugin({ tasks: [task("a")] });
    const { runner, events } = createRunner([plugin]);
    runner.on((event) => {
      if (event.type === "discover:complete") {
        runner.abort();
      }
    });

    await runner.run();

    expect(plugin.execute).not.toHaveBeenCalled();
    expect(typesOf(events)).not.toContain("plugin:start");
  });

  it("exposes the abort signal", () => {
    const { runner } = createRunner([createPlugin()]);

    expect(runner.signal.aborted).toBe(false);
    runner.abort();
    expect(runner.signal.aborted).toBe(true);
  });
});

describe("CaptureRunner page pool", () => {
  it("initialises a plugin context once per worker", async () => {
    const initPage = vi.fn(async () => ({ ready: true }));
    const plugin = createPlugin({
      tasks: [task("a"), task("b"), task("c")],
      initPage,
    });

    const { runner } = createRunner([plugin], {
      screenshotTool: createScreenshotTool(1),
    });

    await runner.run();

    expect(initPage).toHaveBeenCalledOnce();
    expect(
      vi
        .mocked(plugin.execute)
        .mock.calls.every(
          ([, , , context]) => (context as { ready: boolean }).ready,
        ),
    ).toBe(true);
  });
});
