import type { RunEvent, ScreenshotTool } from "@cappa/core";
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
    default: { cyan: identity, red: identity, bold: identity, dim: identity },
  };
});

import {
  formatDuration,
  formatProgress,
  registerSignalHandlers,
  renderRunEvent,
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

  it("calls close() then exit(130) on SIGINT", async () => {
    const { mockClose, mockExit, mockTool } = makeMocks();
    unregister = registerSignalHandlers(mockTool, mockExit);

    process.emit("SIGINT");

    expect(mockClose).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(mockExit).toHaveBeenCalledWith(130);
  });

  it("calls close() then exit(130) on SIGTERM", async () => {
    const { mockClose, mockExit, mockTool } = makeMocks();
    unregister = registerSignalHandlers(mockTool, mockExit);

    process.emit("SIGTERM");

    expect(mockClose).toHaveBeenCalledOnce();
    await Promise.resolve();
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
