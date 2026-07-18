import type { ScreenshotTool } from "@cappa/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  didScreenshotFail,
  filterTasks,
  formatDuration,
  formatProgress,
  getDeletedScreenshots,
  registerSignalHandlers,
} from "./capture";

vi.mock("node:fs/promises", () => ({
  glob: vi.fn(),
}));

import { glob } from "node:fs/promises";

describe("didScreenshotFail", () => {
  it("returns false for a non-object result", () => {
    expect(didScreenshotFail(null)).toBe(false);
    expect(didScreenshotFail("string")).toBe(false);
    expect(didScreenshotFail(42)).toBe(false);
  });

  it("returns true when result has a non-null error", () => {
    expect(didScreenshotFail({ error: "oops" })).toBe(true);
    expect(didScreenshotFail({ error: new Error("boom") })).toBe(true);
  });

  it("returns false when error is null/undefined", () => {
    expect(didScreenshotFail({ error: null })).toBe(false);
    expect(didScreenshotFail({ error: undefined })).toBe(false);
  });

  it("returns true when success is explicitly false", () => {
    expect(didScreenshotFail({ success: false })).toBe(true);
  });

  it("returns false when success is true (comparison passed)", () => {
    expect(
      didScreenshotFail({ success: true, filepath: "/some/path.png" }),
    ).toBe(false);
  });

  it("returns true when filepath is missing and not skipped (new screenshot with failed capture)", () => {
    expect(didScreenshotFail({ filepath: undefined, skipped: false })).toBe(
      true,
    );
  });

  it("returns false when skipped is true even without filepath", () => {
    expect(didScreenshotFail({ filepath: undefined, skipped: true })).toBe(
      false,
    );
  });
});

describe("getDeletedScreenshots", () => {
  it("returns empty array when no expected screenshots exist", async () => {
    vi.mocked(glob).mockImplementation(async function* () {} as any);
    expect(await getDeletedScreenshots("/output")).toEqual([]);
  });

  it("returns empty array when all expected screenshots have a matching actual", async () => {
    vi.mocked(glob).mockImplementation(async function* (
      pattern: string | readonly string[],
    ) {
      if ((pattern as string).includes("actual")) {
        yield "/output/actual/button.png";
      } else {
        yield "/output/expected/button.png";
      }
    } as any);
    expect(await getDeletedScreenshots("/output")).toEqual([]);
  });

  it("returns the deleted relative path when an expected screenshot has no matching actual", async () => {
    vi.mocked(glob).mockImplementation(async function* (
      pattern: string | readonly string[],
    ) {
      if ((pattern as string).includes("actual")) {
        // no actual screenshots
      } else {
        yield "/output/expected/button.png";
      }
    } as any);
    expect(await getDeletedScreenshots("/output")).toEqual(["button.png"]);
  });

  it("returns only the missing paths when some expected screenshots are absent from actual", async () => {
    vi.mocked(glob).mockImplementation(async function* (
      pattern: string | readonly string[],
    ) {
      if ((pattern as string).includes("actual")) {
        yield "/output/actual/button.png";
      } else {
        yield "/output/expected/button.png";
        yield "/output/expected/card.png";
      }
    } as any);
    expect(await getDeletedScreenshots("/output")).toEqual(["card.png"]);
  });
});

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

describe("filterTasks", () => {
  const tasks = [
    { id: "button--primary", url: "http://localhost:6006" },
    { id: "button--secondary", url: "http://localhost:6006" },
    { id: "card--default", url: "http://localhost:6006" },
    { id: "card--with-image", url: "http://localhost:6006" },
    { id: "header--logged-in", url: "http://localhost:6006" },
  ];

  it("filters tasks matching a glob pattern with wildcard", () => {
    const result = filterTasks(tasks, "button*");
    expect(result.map((t) => t.id)).toEqual([
      "button--primary",
      "button--secondary",
    ]);
  });

  it("filters tasks matching an exact id", () => {
    const result = filterTasks(tasks, "card--default");
    expect(result.map((t) => t.id)).toEqual(["card--default"]);
  });

  it("returns empty array when no tasks match", () => {
    const result = filterTasks(tasks, "footer*");
    expect(result).toEqual([]);
  });

  it("returns all tasks when pattern matches everything", () => {
    const result = filterTasks(tasks, "*");
    expect(result).toHaveLength(5);
  });

  it("supports character class patterns", () => {
    const result = filterTasks(tasks, "card--*image");
    expect(result.map((t) => t.id)).toEqual(["card--with-image"]);
  });
});
