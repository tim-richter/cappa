import type {
  RunEvent,
  RunLogLevel,
  RunState,
  RunSummary,
  RunTrigger,
  SerializedError,
  TaskStatus,
} from "@cappa/protocol";

/** Newest-last log lines kept for the run pane. */
export const MAX_LOG_LINES = 500;

export type RunLogLine = {
  seq: number;
  level: RunLogLevel;
  message: string;
};

export type RunTask = {
  id: string;
  plugin: string;
  url: string;
  status: TaskStatus;
  durationMs?: number;
};

export type RunViewState = {
  state: RunState;
  /** Plugin names discovery is running for, in order. */
  plugins: string[];
  tasks: RunTask[];
  completed: number;
  total: number;
  logs: RunLogLine[];
  summary?: RunSummary;
  error?: SerializedError;
  /** What started this run, when a person did not — a watch session, today. */
  trigger?: RunTrigger;
  /** Highest sequence number seen — the resume point for a dropped stream. */
  lastSeq: number;
};

export const initialRunState: RunViewState = {
  state: "idle",
  plugins: [],
  tasks: [],
  completed: 0,
  total: 0,
  logs: [],
  lastSeq: 0,
};

const upsertTask = (
  tasks: RunTask[],
  id: string,
  patch: Partial<RunTask> & Pick<RunTask, "plugin" | "url">,
): RunTask[] => {
  const index = tasks.findIndex((task) => task.id === id);

  if (index === -1) {
    return [...tasks, { id, status: "pending", ...patch }];
  }

  const next = [...tasks];
  next[index] = { ...next[index], ...patch } as RunTask;
  return next;
};

const appendLog = (
  logs: RunLogLine[],
  line: RunLogLine | undefined,
): RunLogLine[] => {
  if (!line) {
    return logs;
  }

  const next = [...logs, line];
  return next.length > MAX_LOG_LINES
    ? next.slice(next.length - MAX_LOG_LINES)
    : next;
};

/** Clears the view when the panel switches to a different run. */
export type ResetAction = { type: "reset" };

export type RunAction = RunEvent | ResetAction;

/**
 * Fold a run's event stream into what the UI renders.
 *
 * Pure and order-independent enough to survive replay: the same event applied
 * twice leaves the same state, so a reconnecting stream that re-sends a couple
 * of events cannot corrupt the view.
 */
export const runStateReducer = (
  state: RunViewState,
  event: RunAction,
): RunViewState => {
  if (event.type === "reset") {
    return initialRunState;
  }

  const base = { ...state, lastSeq: Math.max(state.lastSeq, event.seq) };

  switch (event.type) {
    case "run:start":
      return {
        ...base,
        state: "discovering",
        trigger: event.request.trigger,
      };

    case "discover:start":
      return { ...base, state: "discovering", plugins: event.plugins };

    case "discover:complete":
      return {
        ...base,
        total: event.totalTasks,
        tasks: event.targets.map((target) => ({
          id: target.id,
          plugin: target.plugin,
          url: target.url,
          status: "pending" as const,
        })),
      };

    case "filter:applied": {
      // Selection narrows what will actually run; drop everything else so the
      // task list shows the real workload rather than the whole catalogue.
      const selected = new Set(event.taskIds ?? []);
      const tasks = event.taskIds
        ? base.tasks.filter((task) => selected.has(task.id))
        : base.tasks;

      return {
        ...base,
        tasks,
        total: event.plugins.reduce((sum, entry) => sum + entry.after, 0),
      };
    }

    case "plugin:start":
      return { ...base, state: "running" };

    case "task:start":
      return {
        ...base,
        state: "running",
        tasks: upsertTask(base.tasks, event.taskId, {
          plugin: event.plugin,
          url: event.url,
          status: "running",
        }),
      };

    case "task:complete":
      return {
        ...base,
        state: "running",
        completed: Math.max(base.completed, event.completed),
        total: base.total || event.total,
        tasks: upsertTask(base.tasks, event.taskId, {
          plugin: event.plugin,
          url: event.url,
          status: event.status,
          durationMs: event.durationMs,
        }),
      };

    case "log":
      return {
        ...base,
        logs: appendLog(base.logs, {
          seq: event.seq,
          level: event.level,
          message: event.message,
        }),
      };

    case "run:cancelled":
      return { ...base, state: "cancelled" };

    case "run:complete":
      return {
        ...base,
        // A cancelled run still emits run:complete; keep the more specific state.
        state: base.state === "cancelled" ? "cancelled" : event.summary.state,
        summary: event.summary,
        completed: event.summary.completedTasks || base.completed,
        total: event.summary.totalTasks || base.total,
      };

    case "run:error":
      return { ...base, state: "failed", error: event.error };

    default:
      return base;
  }
};

/** Terminal states — nothing more will arrive on the stream. */
export const isRunFinished = (state: RunState): boolean =>
  state === "completed" || state === "failed" || state === "cancelled";

export const runProgress = (state: RunViewState): number => {
  if (state.total === 0) {
    return 0;
  }
  return Math.min(100, Math.round((state.completed / state.total) * 100));
};

/** Counts per terminal status, for the run summary line. */
export const countByStatus = (
  tasks: RunTask[],
): Partial<Record<TaskStatus, number>> => {
  const counts: Partial<Record<TaskStatus, number>> = {};
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }
  return counts;
};
