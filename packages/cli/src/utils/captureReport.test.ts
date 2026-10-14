import type { RunDetail } from "@cappa/core";
import { describe, expect, it } from "vitest";
import { buildCaptureJsonReport } from "./captureReport";

const detail = (overrides: Partial<RunDetail>): RunDetail =>
  ({
    id: "run-1",
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    failures: [],
    deletedScreenshots: [],
    ...overrides,
  }) as RunDetail;

const failure = (taskId: string, result: Record<string, unknown>) =>
  ({ taskId, taskUrl: "", pluginName: "pages", result }) as never;

describe("buildCaptureJsonReport", () => {
  it("is ok with no detail and nothing captured", () => {
    expect(
      buildCaptureJsonReport({
        detail: undefined,
        screenshots: [],
        durationMs: 12.6,
      }),
    ).toEqual({
      ok: true,
      durationMs: 13,
      tasks: { total: 0, completed: 0, failed: 0 },
      screenshots: { total: 0, passed: 0, changed: 0, new: 0, deleted: 0 },
      errors: [],
      results: [],
    });
  });

  it("reports string errors and missing output, but not diffs or skips", () => {
    const report = buildCaptureJsonReport({
      detail: detail({
        failures: [
          failure("a", { error: "timeout" }),
          failure("b", { success: false }),
          failure("c", { skipped: true }),
          failure("d", { success: false, isNew: true, filepath: "d.png" }),
        ],
      }),
      screenshots: [],
      durationMs: 0,
    });

    expect(report.errors).toEqual([
      { taskId: "a", plugin: "pages", error: "timeout" },
      { taskId: "b", plugin: "pages", error: "no screenshot was produced" },
    ]);
    expect(report.ok).toBe(false);
  });

  it("is not ok when a baseline lost its capture", () => {
    const report = buildCaptureJsonReport({
      detail: detail({ deletedScreenshots: ["gone.png"] }),
      screenshots: [
        { name: "gone", category: "deleted" },
        { name: "fresh", category: "new" },
      ],
      durationMs: 0,
    });

    expect(report.ok).toBe(false);
    expect(report.screenshots).toMatchObject({ deleted: 1, new: 1 });
    expect(report.results).toEqual([
      { name: "gone", category: "deleted" },
      { name: "fresh", category: "new" },
    ]);
    expect(report.next).toBe("cappa agent check --json");
  });
});
