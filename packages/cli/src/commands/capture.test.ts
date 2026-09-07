import type {
  RunDetail,
  RunEvent,
  Screenshot,
  ScreenshotTool,
  WatchEvent,
} from "@cappa/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loggerInstance } = vi.hoisted(() => ({
  loggerInstance: {
    level: 4,
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    box: vi.fn(),
  },
}));

vi.mock("@cappa/logger", () => ({
  getLogger: () => loggerInstance,
  initLogger: () => loggerInstance,
}));

vi.mock("chalk", () => {
  const identity = (value: string) => value;
  return {
    __esModule: true,
    default: {
      cyan: identity,
      red: identity,
      bold: identity,
      dim: identity,
      green: identity,
      yellow: identity,
    },
  };
});

const { engineRef, getConfigMock } = vi.hoisted(() => ({
  engineRef: { current: null as unknown },
  getConfigMock: vi.fn(),
}));

vi.mock("@cappa/config", () => ({
  getConfig: getConfigMock,
  configToEngineOptions: () => ({ outputDir: "/out", plugins: [] }),
}));

// `runCapture` builds its own engine, so the only seam is the constructor.
// A plain function (not an arrow) so it can be called with `new`; returning an
// object from a constructor replaces the instance.
vi.mock("@cappa/core", () => ({
  LocalEngine: vi.fn(function LocalEngine() {
    return engineRef.current;
  }),
}));

import {
  describeWatchChange,
  formatDuration,
  formatProgress,
  registerSignalHandlers,
  registerWatchSignalHandlers,
  renderRunEvent,
  renderWatchRunEvent,
  runCapture,
  summarizeRunDetail,
} from "./capture";

const event = <T extends RunEvent["type"]>(
  type: T,
  rest: Omit<Extract<RunEvent, { type: T }>, "type" | "seq" | "runId" | "at">,
): RunEvent =>
  ({ type, seq: 1, runId: "run-1", at: 0, ...rest }) as unknown as RunEvent;

describe("registerSignalHandlers", () => {
  let unregister: (() => void) | undefined;

  afterEach(() => {
    unregister?.();
    unregister = undefined;
  });

  const makeMocks = () => {
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockExit = vi.fn() as unknown as (code: number) => void;
    const mockTool = { close: mockClose } as unknown as ScreenshotTool;
    return { mockClose, mockExit, mockTool };
  };

  // The handler awaits an optional pre-close hook, so close and exit land on
  // later ticks rather than synchronously with the signal.
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it("calls close() then exit(130) on SIGINT", async () => {
    const { mockClose, mockExit, mockTool } = makeMocks();
    unregister = registerSignalHandlers(mockTool, mockExit);

    process.emit("SIGINT");
    await settle();

    expect(mockClose).toHaveBeenCalledOnce();
    expect(mockExit).toHaveBeenCalledWith(130);
  });

  it("calls close() then exit(130) on SIGTERM", async () => {
    const { mockClose, mockExit, mockTool } = makeMocks();
    unregister = registerSignalHandlers(mockTool, mockExit);

    process.emit("SIGTERM");
    await settle();

    expect(mockClose).toHaveBeenCalledOnce();
    expect(mockExit).toHaveBeenCalledWith(130);
  });

  it("runs the pre-close hook before closing", async () => {
    const { mockClose, mockExit, mockTool } = makeMocks();
    const order: string[] = [];
    const onSignal = vi.fn(async () => {
      order.push("hook");
    });
    mockClose.mockImplementation(async () => {
      order.push("close");
    });

    unregister = registerSignalHandlers(mockTool, mockExit, onSignal);

    process.emit("SIGINT");
    await settle();

    // Cancelling a remote run has to finish before the engine — and with it the
    // event stream — goes away.
    expect(order).toEqual(["hook", "close"]);
  });

  it("exits immediately on a second signal", async () => {
    const { mockClose, mockExit, mockTool } = makeMocks();
    // A hook that never settles stands in for a host that will not acknowledge.
    const onSignal = vi.fn(() => new Promise<void>(() => {}));

    unregister = registerSignalHandlers(mockTool, mockExit, onSignal);

    process.emit("SIGINT");
    await settle();
    expect(mockExit).not.toHaveBeenCalled();

    process.emit("SIGINT");
    await settle();

    expect(mockExit).toHaveBeenCalledWith(130);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("exits cleanly when close() itself fails", async () => {
    const { mockExit, mockTool } = makeMocks();
    // A Ctrl-C reaches Chromium too — the terminal signals the whole process
    // group — so by the time this runs the browser is often already gone.
    const mockClose = vi.fn().mockRejectedValue(new Error("Target closed"));
    const closeable = { ...mockTool, close: mockClose };

    unregister = registerSignalHandlers(closeable as never, mockExit);

    process.emit("SIGINT");
    await settle();

    expect(mockExit).toHaveBeenCalledWith(130);
  });

  it("does not call close() or exit() after unregister", () => {
    const { mockClose, mockExit, mockTool } = makeMocks();
    unregister = registerSignalHandlers(mockTool, mockExit);
    unregister();

    process.emit("SIGINT");
    process.emit("SIGTERM");

    expect(mockClose).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });
});

describe("formatProgress", () => {
  it("formats a progress message with completed count, total, and task ID", () => {
    expect(formatProgress(1, 480, "story-button")).toBe(
      "[1/480] captured story-button",
    );
  });

  it("formats correctly when completed equals total", () => {
    expect(formatProgress(480, 480, "story-footer")).toBe(
      "[480/480] captured story-footer",
    );
  });

  it("handles a single-task run", () => {
    expect(formatProgress(1, 1, "homepage")).toBe("[1/1] captured homepage");
  });
});

describe("formatDuration", () => {
  it("should format sub-second durations", () => {
    expect(formatDuration(500)).toBe("0.50s");
    expect(formatDuration(123)).toBe("0.12s");
  });

  it("should format durations under a minute", () => {
    expect(formatDuration(1000)).toBe("1.00s");
    expect(formatDuration(5432)).toBe("5.43s");
    expect(formatDuration(45678)).toBe("45.68s");
  });

  it("should format durations over a minute", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });
});

describe("renderRunEvent", () => {
  beforeEach(() => {
    for (const fn of Object.values(loggerInstance)) {
      if (typeof fn === "function") {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  });

  it("forwards log events to the matching logger level", () => {
    renderRunEvent(
      event("log", { level: "debug", message: "hello", args: [1] }),
    );
    expect(loggerInstance.debug).toHaveBeenCalledWith("hello", 1);

    renderRunEvent(
      event("log", { level: "warn", message: "careful", args: [] }),
    );
    expect(loggerInstance.warn).toHaveBeenCalledWith("careful");
  });

  it("reports the task count discovered per plugin", () => {
    renderRunEvent(
      event("discover:plugin", { plugin: "storybook", taskCount: 12 }),
    );
    expect(loggerInstance.info).toHaveBeenCalledWith(
      "Found 12 tasks for storybook",
    );
  });

  it("renders the filter box and per-plugin match counts", () => {
    renderRunEvent(
      event("filter:applied", {
        filter: "button*",
        taskIds: undefined,
        plugins: [{ plugin: "storybook", before: 10, after: 2 }],
      }),
    );

    expect(loggerInstance.box).toHaveBeenCalledWith({
      title: "Filter Active",
      message: "Only capturing tasks matching: button*",
    });
    expect(loggerInstance.info).toHaveBeenCalledWith(
      "storybook: 2/10 tasks match filter",
    );
  });

  it("does not render the filter box for an id-only selection", () => {
    renderRunEvent(
      event("filter:applied", {
        filter: undefined,
        taskIds: ["button--primary"],
        plugins: [{ plugin: "storybook", before: 10, after: 1 }],
      }),
    );

    expect(loggerInstance.box).not.toHaveBeenCalled();
  });

  it("logs progress on task completion", () => {
    renderRunEvent(
      event("task:complete", {
        plugin: "storybook",
        taskId: "button--primary",
        url: "http://localhost:6006",
        status: "passed",
        completed: 3,
        total: 9,
        durationMs: 12,
        result: undefined,
      }),
    );

    expect(loggerInstance.info).toHaveBeenCalledWith(
      "[3/9] captured button--primary",
    );
  });

  it("logs plugin completion as success or error depending on failures", () => {
    renderRunEvent(
      event("plugin:complete", {
        plugin: "storybook",
        resultCount: 4,
        failed: false,
      }),
    );
    expect(loggerInstance.success).toHaveBeenCalledWith(
      "Plugin storybook completed: 4 results",
    );

    renderRunEvent(
      event("plugin:complete", {
        plugin: "pages",
        resultCount: 2,
        failed: true,
      }),
    );
    expect(loggerInstance.error).toHaveBeenCalledWith(
      "Plugin pages completed with failures: 2 results",
    );
  });

  it("logs run errors", () => {
    renderRunEvent(
      event("run:error", {
        error: { name: "Error", message: "boom" },
      }),
    );
    expect(loggerInstance.error).toHaveBeenCalledWith(
      "Error during plugin execution:",
      "boom",
    );
  });
});

/**
 * A `CaptureEngine` that replays a scripted event sequence.
 *
 * `startRun` emits nothing itself — events are delivered on subscribe, which is
 * how the real engine behaves for anything buffered before the CLI attached.
 */
const makeFakeEngine = (options: {
  events?: RunEvent[];
  detail?: Partial<RunDetail>;
  screenshots?: Screenshot[];
}) => {
  const events = options.events ?? [
    event("run:complete", { summary: {} as never }),
  ];

  const detail = {
    id: "run-1",
    failures: [],
    deletedScreenshots: [],
    ...options.detail,
  } as unknown as RunDetail;

  return {
    close: vi.fn().mockResolvedValue(undefined),
    startRun: vi.fn().mockResolvedValue({ id: "run-1" }),
    getRun: vi.fn().mockResolvedValue(detail),
    listScreenshots: vi.fn().mockResolvedValue(options.screenshots ?? []),
    subscribeRun: vi.fn((_id: string, onEvent: (e: RunEvent) => void) => {
      for (const entry of events) {
        onEvent(entry);
      }
      return vi.fn();
    }),
  };
};

describe("runCapture", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const fn of Object.values(loggerInstance)) {
      if (typeof fn === "function") {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }

    getConfigMock.mockResolvedValue({
      outputDir: "screenshots",
      review: { browserIdleTimeout: 1000 },
    });

    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    delete process.env.CI;
  });

  it("renders the run's events and succeeds when nothing failed", async () => {
    engineRef.current = makeFakeEngine({
      events: [
        event("discover:plugin", { plugin: "pages", taskCount: 2 }),
        event("task:complete", {
          plugin: "pages",
          taskId: "home",
          url: "http://localhost/",
          status: "passed",
          completed: 1,
          total: 2,
          durationMs: 5,
        }),
        event("run:complete", { summary: {} as never }),
      ],
    });

    await runCapture();

    expect(loggerInstance.info).toHaveBeenCalledWith("Found 2 tasks for pages");
    expect(loggerInstance.info).toHaveBeenCalledWith("[1/2] captured home");
    expect(loggerInstance.success).toHaveBeenCalledWith(
      expect.stringContaining("All plugins completed successfully in"),
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("starts the run with the filter and clears actual/", async () => {
    const engine = makeFakeEngine({});
    engineRef.current = engine;

    await runCapture({ filter: "button--*" });

    expect(engine.startRun).toHaveBeenCalledWith({
      filter: "button--*",
      clearActual: true,
    });
  });

  it("reports failures from getRun and exits 1", async () => {
    engineRef.current = makeFakeEngine({
      detail: {
        failures: [
          {
            pluginName: "pages",
            taskId: "home",
            result: { success: false, isNew: false, filepath: "home.png" },
          },
        ] as never,
        deletedScreenshots: ["gone.png"],
      },
    });

    await runCapture();

    expect(loggerInstance.box).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Failed Screenshots" }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("closes the engine even when the run reports an error", async () => {
    const engine = makeFakeEngine({
      events: [
        event("run:error", { error: { name: "Error", message: "boom" } }),
      ],
      detail: { error: { name: "Error", message: "boom" } },
    });
    engineRef.current = engine;

    await expect(runCapture()).rejects.toThrow("boom");
    expect(engine.close).toHaveBeenCalledOnce();
    // A run that threw is not summarised, so no screenshot read happens.
    expect(engine.listScreenshots).not.toHaveBeenCalled();
  });

  it("closes the engine on the success path too", async () => {
    const engine = makeFakeEngine({});
    engineRef.current = engine;

    await runCapture();

    expect(engine.close).toHaveBeenCalledOnce();
  });

  it("reads screenshots through the engine for the onFail payload", async () => {
    const engine = makeFakeEngine({
      screenshots: [
        { name: "home", category: "changed", actualPath: "actual/home.png" },
      ] as never,
    });
    engineRef.current = engine;

    const onFail = vi.fn();
    getConfigMock.mockResolvedValue({
      outputDir: "screenshots",
      review: { browserIdleTimeout: 1000 },
      onFail,
    });

    await runCapture({ ci: true });

    expect(engine.listScreenshots).toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledWith([
      expect.objectContaining({ name: "home" }),
    ]);
  });
});

const watchEvent = (
  type: WatchEvent["type"],
  rest: Record<string, unknown> = {},
): WatchEvent => ({ type, seq: 1, at: 0, ...rest }) as unknown as WatchEvent;

/** A fake engine that can also watch, and lets a test push watch events. */
const makeWatchingEngine = (
  options: Parameters<typeof makeFakeEngine>[0] = {},
) => {
  const engine = makeFakeEngine(options);
  const listeners: ((event: WatchEvent) => void)[] = [];

  return {
    ...engine,
    startWatch: vi.fn().mockResolvedValue({
      active: true,
      paths: ["."],
      debounceMs: 300,
    }),
    stopWatch: vi.fn().mockResolvedValue(undefined),
    subscribeWatch: vi.fn((onEvent: (event: WatchEvent) => void) => {
      listeners.push(onEvent);
      return vi.fn();
    }),
    emitWatch: (event: WatchEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
};

describe("describeWatchChange", () => {
  it("names the number of tasks and the file that changed", () => {
    expect(
      describeWatchChange(
        watchEvent("watch:change", {
          files: ["src/Button.stories.tsx"],
          scope: "tasks",
          taskIds: ["a", "b", "c"],
        }) as never,
      ),
    ).toBe("↻ 3 tasks · src/Button.stories.tsx changed");
  });

  it("says when a plugin could not attribute the change", () => {
    expect(
      describeWatchChange(
        watchEvent("watch:change", {
          files: ["src/Button.tsx"],
          scope: "plugins",
        }) as never,
      ),
    ).toContain("every task of the affected plugin(s)");
  });

  it("summarises a burst of files rather than listing them", () => {
    expect(
      describeWatchChange(
        watchEvent("watch:change", {
          files: ["a.ts", "b.ts", "c.ts"],
          scope: "all",
        }) as never,
      ),
    ).toBe("↻ everything · 3 files changed");
  });
});

describe("summarizeRunDetail", () => {
  it("reports a clean iteration", () => {
    expect(
      summarizeRunDetail(
        {
          totalTasks: 3,
          completedTasks: 3,
          failures: [],
          deletedScreenshots: [],
        } as unknown as RunDetail,
        "1.20s",
      ),
    ).toBe("3/3 captured, all passing — 1.20s");
  });

  it("counts failures and deleted baselines as things to review", () => {
    expect(
      summarizeRunDetail(
        {
          totalTasks: 3,
          completedTasks: 3,
          failures: [{}, {}],
          deletedScreenshots: ["gone.png"],
        } as unknown as RunDetail,
        "1.20s",
      ),
    ).toBe("3/3 captured, 3 to review — 1.20s");
  });
});

describe("renderWatchRunEvent", () => {
  beforeEach(() => {
    for (const fn of Object.values(loggerInstance)) {
      if (typeof fn === "function") {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  });

  it("says nothing about a task that passed", () => {
    renderWatchRunEvent(
      event("task:complete", {
        plugin: "pages",
        taskId: "home",
        url: "http://localhost/",
        status: "passed",
        completed: 1,
        total: 1,
        durationMs: 5,
      }),
    );

    expect(loggerInstance.info).not.toHaveBeenCalled();
  });

  it("reports a task that changed", () => {
    renderWatchRunEvent(
      event("task:complete", {
        plugin: "pages",
        taskId: "home",
        url: "http://localhost/",
        status: "changed",
        completed: 1,
        total: 1,
        durationMs: 5,
      }),
    );

    expect(loggerInstance.info).toHaveBeenCalledWith("  changed home");
  });

  it("keeps warnings and errors, and drops debug chatter", () => {
    renderWatchRunEvent(
      event("log", { level: "debug", message: "noise", args: [] }),
    );
    renderWatchRunEvent(
      event("log", { level: "warn", message: "retrying", args: [] }),
    );

    expect(loggerInstance.debug).not.toHaveBeenCalled();
    expect(loggerInstance.warn).toHaveBeenCalledWith("retrying");
  });
});

describe("registerWatchSignalHandlers", () => {
  let unregister: (() => void) | undefined;

  afterEach(() => {
    unregister?.();
    unregister = undefined;
  });

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it("stops the session and exits 0 — quitting a watch is not a failure", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    unregister = registerWatchSignalHandlers(stop, exit);

    process.emit("SIGINT");
    await settle();

    expect(stop).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("leaves immediately on a second signal", async () => {
    const stop = vi.fn(() => new Promise<void>(() => {}));
    const exit = vi.fn();
    unregister = registerWatchSignalHandlers(stop, exit);

    process.emit("SIGINT");
    await settle();
    expect(exit).not.toHaveBeenCalled();

    process.emit("SIGINT");
    await settle();
    expect(exit).toHaveBeenCalledWith(0);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does nothing after unregister", () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    registerWatchSignalHandlers(stop, exit)();

    process.emit("SIGINT");

    expect(stop).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("runCapture --watch", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const fn of Object.values(loggerInstance)) {
      if (typeof fn === "function") {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }

    getConfigMock.mockClear();
    getConfigMock.mockResolvedValue({ outputDir: "screenshots" });
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    delete process.env.CI;
  });

  const settle = (times = 4) =>
    Array.from({ length: times }).reduce<Promise<void>>(
      (promise) =>
        promise.then(() => new Promise((resolve) => setImmediate(resolve))),
      Promise.resolve(),
    );

  it("refuses --watch with --server, because a host cannot see local files", async () => {
    await runCapture({ watch: true, server: "http://host:3000" });

    expect(loggerInstance.error).toHaveBeenCalledWith(
      expect.stringContaining("--watch cannot be combined with --server"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    // Not even the config is read for an invocation that cannot work.
    expect(getConfigMock).not.toHaveBeenCalled();
  });

  it("refuses --watch with --ci", async () => {
    await runCapture({ watch: true, ci: true });

    expect(loggerInstance.error).toHaveBeenCalledWith(
      expect.stringContaining("--watch cannot be combined with --ci"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("captures once, then watches with the same filter", async () => {
    const engine = makeWatchingEngine({});
    engineRef.current = engine;

    const capture = runCapture({ watch: true, filter: "Button/*" });
    await settle();

    expect(engine.startRun).toHaveBeenCalledWith({
      filter: "Button/*",
      clearActual: true,
    });
    expect(engine.startWatch).toHaveBeenCalledWith({ filter: "Button/*" });
    // The engine — and its warm browser — has to outlive the first run.
    expect(engine.close).not.toHaveBeenCalled();

    process.emit("SIGINT");
    await capture;

    expect(engine.stopWatch).toHaveBeenCalledOnce();
    expect(engine.close).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("renders each iteration and its summary", async () => {
    const engine = makeWatchingEngine({
      detail: { totalTasks: 1, completedTasks: 1 } as Partial<RunDetail>,
    });
    engineRef.current = engine;

    const capture = runCapture({ watch: true });
    await settle();

    engine.emitWatch(
      watchEvent("watch:change", {
        files: ["src/Button.stories.tsx"],
        scope: "tasks",
        taskIds: ["button--primary"],
        runId: "run-2",
      }),
    );
    await settle();

    expect(loggerInstance.info).toHaveBeenCalledWith(
      "↻ 1 task · src/Button.stories.tsx changed",
    );
    expect(loggerInstance.info).toHaveBeenCalledWith(
      expect.stringContaining("1/1 captured, all passing"),
    );

    process.emit("SIGINT");
    await capture;
  });

  it("reports a run it could not start, and keeps watching", async () => {
    const engine = makeWatchingEngine({});
    engineRef.current = engine;

    const capture = runCapture({ watch: true });
    await settle();

    engine.emitWatch(
      watchEvent("watch:change", {
        files: ["a.tsx"],
        scope: "all",
        error: "A capture run is already in progress (run-9)",
      }),
    );
    await settle();

    expect(loggerInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not start a run"),
    );
    expect(exitSpy).not.toHaveBeenCalledWith(1);

    process.emit("SIGINT");
    await capture;
  });

  it("does not exit 1 on a failing screenshot while watching", async () => {
    const engine = makeWatchingEngine({
      detail: {
        failures: [
          {
            pluginName: "pages",
            taskId: "home",
            result: { success: false, filepath: "home.png" },
          },
        ] as never,
      },
    });
    engineRef.current = engine;

    const capture = runCapture({ watch: true });
    await settle();

    // The failure is the thing being worked on, not a reason to quit.
    expect(loggerInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining("One or more screenshots failed"),
    );
    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(engine.startWatch).toHaveBeenCalled();

    process.emit("SIGINT");
    await capture;
  });

  it("says so when the engine cannot watch at all", async () => {
    const engine = makeFakeEngine({});
    engineRef.current = engine;

    await runCapture({ watch: true });

    expect(loggerInstance.error).toHaveBeenCalledWith(
      "This engine cannot watch files.",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(engine.close).toHaveBeenCalled();
  });
});
