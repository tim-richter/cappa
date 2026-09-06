import type { RunEvent } from "@cappa/protocol";
import { describe, expect, it } from "vitest";
import {
  countByStatus,
  initialRunState,
  isRunFinished,
  MAX_LOG_LINES,
  type RunViewState,
  runProgress,
  runStateReducer,
} from "./runState";

const event = (partial: Partial<RunEvent> & { seq: number; type: string }) =>
  ({ runId: "run-1", at: 0, ...partial }) as unknown as RunEvent;

const apply = (events: RunEvent[], from = initialRunState): RunViewState =>
  events.reduce(runStateReducer, from);

const target = (id: string, plugin = "demo") => ({
  id,
  url: `http://x/${id}`,
  plugin,
});

describe("runStateReducer lifecycle", () => {
  it("moves from idle to discovering on run:start", () => {
    const state = apply([event({ seq: 1, type: "run:start", request: {} })]);

    expect(state.state).toBe("discovering");
  });

  it("records the tasks discovery found", () => {
    const state = apply([
      event({
        seq: 1,
        type: "discover:complete",
        targets: [target("a"), target("b")],
        totalTasks: 2,
      }),
    ]);

    expect(state.total).toBe(2);
    expect(state.tasks).toEqual([
      { id: "a", url: "http://x/a", plugin: "demo", status: "pending" },
      { id: "b", url: "http://x/b", plugin: "demo", status: "pending" },
    ]);
  });

  it("marks a task running then terminal", () => {
    const state = apply([
      event({
        seq: 1,
        type: "discover:complete",
        targets: [target("a")],
        totalTasks: 1,
      }),
      event({
        seq: 2,
        type: "task:start",
        plugin: "demo",
        taskId: "a",
        url: "http://x/a",
      }),
    ]);

    expect(state.tasks[0]?.status).toBe("running");

    const done = runStateReducer(
      state,
      event({
        seq: 3,
        type: "task:complete",
        plugin: "demo",
        taskId: "a",
        url: "http://x/a",
        status: "changed",
        completed: 1,
        total: 1,
        durationMs: 42,
      }),
    );

    expect(done.tasks[0]).toMatchObject({ status: "changed", durationMs: 42 });
    expect(done.completed).toBe(1);
  });

  it("adds a task the stream mentions but discovery did not", () => {
    const state = apply([
      event({
        seq: 1,
        type: "task:start",
        plugin: "demo",
        taskId: "surprise",
        url: "http://x/s",
      }),
    ]);

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.id).toBe("surprise");
  });

  it("narrows the task list when a selection is applied", () => {
    const state = apply([
      event({
        seq: 1,
        type: "discover:complete",
        targets: [target("a"), target("b"), target("c")],
        totalTasks: 3,
      }),
      event({
        seq: 2,
        type: "filter:applied",
        taskIds: ["b"],
        plugins: [{ plugin: "demo", before: 3, after: 1 }],
      }),
    ]);

    expect(state.tasks.map((task) => task.id)).toEqual(["b"]);
    expect(state.total).toBe(1);
  });

  it("keeps every task when only a glob filter was applied", () => {
    const state = apply([
      event({
        seq: 1,
        type: "discover:complete",
        targets: [target("a"), target("b")],
        totalTasks: 2,
      }),
      event({
        seq: 2,
        type: "filter:applied",
        filter: "a*",
        plugins: [{ plugin: "demo", before: 2, after: 1 }],
      }),
    ]);

    expect(state.tasks).toHaveLength(2);
    expect(state.total).toBe(1);
  });

  it("finishes on run:complete", () => {
    const state = apply([
      event({
        seq: 1,
        type: "run:complete",
        summary: {
          id: "run-1",
          state: "completed",
          request: {},
          startedAt: 0,
          totalTasks: 2,
          completedTasks: 2,
          failedTasks: 0,
          deletedScreenshots: [],
          anyTasksRan: true,
          durationMs: 500,
        },
      }),
    ]);

    expect(state.state).toBe("completed");
    expect(state.summary?.durationMs).toBe(500);
    expect(state.completed).toBe(2);
  });

  it("keeps the cancelled state through the trailing run:complete", () => {
    const state = apply([
      event({ seq: 1, type: "run:cancelled" }),
      event({
        seq: 2,
        type: "run:complete",
        summary: {
          id: "run-1",
          state: "cancelled",
          request: {},
          startedAt: 0,
          totalTasks: 2,
          completedTasks: 1,
          failedTasks: 0,
          deletedScreenshots: [],
          anyTasksRan: true,
        },
      }),
    ]);

    expect(state.state).toBe("cancelled");
  });

  it("records a run error", () => {
    const state = apply([
      event({
        seq: 1,
        type: "run:error",
        error: { name: "Error", message: "boom" },
      }),
    ]);

    expect(state.state).toBe("failed");
    expect(state.error?.message).toBe("boom");
  });
});

describe("runStateReducer logs", () => {
  it("collects log lines with their level", () => {
    const state = apply([
      event({
        seq: 1,
        type: "log",
        level: "warn",
        message: "careful",
        args: [],
      }),
    ]);

    expect(state.logs).toEqual([{ seq: 1, level: "warn", message: "careful" }]);
  });

  it("caps the log buffer", () => {
    const events = Array.from({ length: MAX_LOG_LINES + 50 }, (_, index) =>
      event({
        seq: index + 1,
        type: "log",
        level: "info",
        message: `line ${index}`,
        args: [],
      }),
    );

    const state = apply(events);

    expect(state.logs).toHaveLength(MAX_LOG_LINES);
    // The newest lines survive, not the oldest.
    expect(state.logs.at(-1)?.message).toBe(`line ${MAX_LOG_LINES + 49}`);
  });
});

describe("runStateReducer resilience", () => {
  it("tracks the highest sequence number as the resume point", () => {
    const state = apply([
      event({ seq: 1, type: "run:start", request: {} }),
      event({ seq: 7, type: "run:cancelled" }),
    ]);

    expect(state.lastSeq).toBe(7);
  });

  it("is idempotent when a reconnect replays an event", () => {
    const complete = event({
      seq: 3,
      type: "task:complete",
      plugin: "demo",
      taskId: "a",
      url: "http://x/a",
      status: "passed",
      completed: 1,
      total: 2,
      durationMs: 10,
    });

    const once = apply([complete]);
    const twice = apply([complete, complete]);

    expect(twice).toEqual(once);
  });

  it("never lets progress go backwards on a replayed event", () => {
    const state = apply([
      event({
        seq: 2,
        type: "task:complete",
        plugin: "demo",
        taskId: "b",
        url: "http://x/b",
        status: "passed",
        completed: 2,
        total: 2,
        durationMs: 10,
      }),
      event({
        seq: 1,
        type: "task:complete",
        plugin: "demo",
        taskId: "a",
        url: "http://x/a",
        status: "passed",
        completed: 1,
        total: 2,
        durationMs: 10,
      }),
    ]);

    expect(state.completed).toBe(2);
  });

  it("clears everything on reset", () => {
    const state = apply([event({ seq: 1, type: "run:start", request: {} })]);

    expect(runStateReducer(state, { type: "reset" })).toEqual(initialRunState);
  });

  it("ignores events it does not model", () => {
    const state = apply([
      event({ seq: 1, type: "discover:plugin", plugin: "demo", taskCount: 2 }),
    ]);

    expect(state.state).toBe("idle");
    expect(state.lastSeq).toBe(1);
  });
});

describe("run selectors", () => {
  it("reports progress as a percentage", () => {
    expect(runProgress({ ...initialRunState, completed: 1, total: 4 })).toBe(
      25,
    );
  });

  it("reports zero progress before discovery", () => {
    expect(runProgress(initialRunState)).toBe(0);
  });

  it("clamps progress at 100", () => {
    expect(runProgress({ ...initialRunState, completed: 9, total: 4 })).toBe(
      100,
    );
  });

  it("identifies terminal states", () => {
    expect(isRunFinished("completed")).toBe(true);
    expect(isRunFinished("failed")).toBe(true);
    expect(isRunFinished("cancelled")).toBe(true);
    expect(isRunFinished("running")).toBe(false);
    expect(isRunFinished("discovering")).toBe(false);
  });

  it("counts tasks by status", () => {
    expect(
      countByStatus([
        { id: "a", plugin: "p", url: "u", status: "passed" },
        { id: "b", plugin: "p", url: "u", status: "passed" },
        { id: "c", plugin: "p", url: "u", status: "changed" },
      ]),
    ).toEqual({ passed: 2, changed: 1 });
  });
});
