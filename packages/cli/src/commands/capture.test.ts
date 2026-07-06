import type { ScreenshotTool } from "@cappa/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDuration, registerSignalHandlers } from "./capture";

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
