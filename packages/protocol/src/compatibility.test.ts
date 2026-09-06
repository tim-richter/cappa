import type * as core from "@cappa/core";
import { ENGINE_ERROR_CODES } from "@cappa/core";
import { describe, expect, it } from "vitest";
import type * as protocol from "./index";
import {
  ERROR_CODES,
  runEventSchema,
  runSummarySchema,
  screenshotSchema,
} from "./index";

/**
 * `@cappa/protocol` declares the wire shapes independently of `@cappa/core` so
 * that a browser client never has to install `playwright-core` or native diff
 * bindings. The cost of that independence is drift.
 *
 * These assertions are the guard: every type the server serializes from core
 * must be assignable to its protocol counterpart. They are compile-time only —
 * `pnpm tsc` fails if the two definitions diverge — with a couple of runtime
 * round-trips below to catch schema/type mismatches the compiler cannot see.
 */
type AssertAssignable<Target, Source extends Target> = [Target, Source];

// The runner surface: what CaptureRunner emits, the server must be able to send.
export type _RunEvent = AssertAssignable<protocol.RunEvent, core.RunEvent>;
export type _RunSummary = AssertAssignable<
  protocol.RunSummary,
  core.RunSummary
>;
export type _RunDetail = AssertAssignable<protocol.RunDetail, core.RunDetail>;
export type _RunState = AssertAssignable<protocol.RunState, core.RunState>;
export type _TaskStatus = AssertAssignable<
  protocol.TaskStatus,
  core.TaskStatus
>;
export type _TaskRecord = AssertAssignable<
  protocol.TaskRecord,
  core.TaskRecord
>;
export type _TaskFailure = AssertAssignable<
  protocol.TaskFailure,
  core.TaskFailure
>;
export type _Target = AssertAssignable<protocol.Target, core.Target>;
export type _SerializedError = AssertAssignable<
  protocol.SerializedError,
  core.SerializedError
>;
export type _PluginCaptureResult = AssertAssignable<
  protocol.PluginCaptureResult,
  core.PluginCaptureResult
>;

// Requests travel the other way: what a client sends must satisfy core's input.
export type _StartRunRequest = AssertAssignable<
  core.StartRunRequest,
  protocol.StartRunRequest
>;

// Screenshots, in both directions — the review UI reads them, the server writes them.
export type _Screenshot = AssertAssignable<
  protocol.Screenshot,
  core.Screenshot
>;
export type _DiffMetadata = AssertAssignable<
  protocol.DiffMetadata,
  core.DiffMetadata
>;

describe("protocol schemas accept what core produces", () => {
  it("round-trips a run event", () => {
    const event: core.RunEvent = {
      type: "task:complete",
      seq: 7,
      runId: "run-1",
      at: 1_700_000_000_000,
      plugin: "storybook",
      taskId: "button--primary",
      url: "http://localhost:6006/?id=button--primary",
      status: "changed",
      completed: 3,
      total: 9,
      durationMs: 412,
      result: { success: false, filepath: "/out/actual/button.png" },
    };

    expect(runEventSchema.parse(event)).toMatchObject({
      type: "task:complete",
      status: "changed",
      seq: 7,
    });
  });

  it("keeps unknown keys on a plugin result", () => {
    const parsed = runEventSchema.parse({
      type: "task:complete",
      seq: 1,
      runId: "r",
      at: 0,
      plugin: "p",
      taskId: "t",
      url: "u",
      status: "passed",
      completed: 1,
      total: 1,
      durationMs: 1,
      result: { success: true, storyId: "s", customPluginField: 42 },
    });

    expect(parsed).toMatchObject({
      result: { customPluginField: 42, storyId: "s" },
    });
  });

  it("round-trips a run summary", () => {
    const summary: core.RunSummary = {
      id: "run-1",
      state: "completed",
      request: { filter: "button*", clearActual: true },
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1,
      totalTasks: 3,
      completedTasks: 3,
      failedTasks: 1,
      deletedScreenshots: ["gone.png"],
      anyTasksRan: true,
    };

    expect(runSummarySchema.parse(summary)).toEqual(summary);
  });

  it("round-trips each screenshot category", () => {
    const screenshots: core.Screenshot[] = [
      { id: "1", name: "a", category: "new", actualPath: "actual/a.png" },
      {
        id: "2",
        name: "b",
        category: "deleted",
        expectedPath: "expected/b.png",
      },
      {
        id: "3",
        name: "c",
        category: "changed",
        actualPath: "actual/c.png",
        expectedPath: "expected/c.png",
        diffPath: "diff/c.png",
        diffMeta: { numDiffPixels: 10, percentDifference: 1.5 },
      },
      {
        id: "4",
        name: "d",
        category: "passed",
        actualPath: "actual/d.png",
        expectedPath: "expected/d.png",
      },
    ];

    for (const screenshot of screenshots) {
      expect(screenshotSchema.parse(screenshot)).toEqual(screenshot);
    }
  });

  it("carries the diff interpretation through untouched", () => {
    const interpretation = {
      summary: "text moved",
      diffCount: 12,
      totalRegions: 1,
      regions: [{ bbox: { x: 0, y: 0, width: 4, height: 4 } }],
      severity: "low",
      diffPercentage: 0.4,
      width: 100,
      height: 100,
    };

    const parsed = screenshotSchema.parse({
      id: "3",
      name: "c",
      category: "changed",
      actualPath: "actual/c.png",
      expectedPath: "expected/c.png",
      diffPath: "diff/c.png",
      diffMeta: {
        numDiffPixels: 12,
        percentDifference: 0.4,
        interpretation,
      },
    });

    expect(parsed).toMatchObject({
      diffMeta: { interpretation },
    });
  });
});

describe("protocol schemas reject malformed input", () => {
  it("rejects an unknown event type", () => {
    expect(
      runEventSchema.safeParse({
        type: "not:a:thing",
        seq: 1,
        runId: "r",
        at: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown screenshot category", () => {
    expect(
      screenshotSchema.safeParse({
        id: "1",
        name: "a",
        category: "sideways",
        actualPath: "actual/a.png",
      }).success,
    ).toBe(false);
  });

  it("rejects a changed screenshot missing its diff path", () => {
    expect(
      screenshotSchema.safeParse({
        id: "1",
        name: "a",
        category: "changed",
        actualPath: "actual/a.png",
        expectedPath: "expected/a.png",
      }).success,
    ).toBe(false);
  });
});

describe("error codes stay in sync with the engine", () => {
  it("matches @cappa/core's ENGINE_ERROR_CODES", () => {
    // The client maps HTTP responses onto these codes without installing the
    // engine, so the two definitions must not drift.
    expect(ERROR_CODES).toEqual(ENGINE_ERROR_CODES);
  });
});
