import type { PluginTask } from "../plugin";

/**
 * Lifecycle of a single capture run.
 *
 * ```
 * idle → discovering → running → (completed | failed | cancelled)
 * ```
 */
export type RunState =
  | "idle"
  | "discovering"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Terminal state of an individual capture task.
 *
 * `passed` / `changed` / `new` mirror the screenshot categories; `failed` means
 * the plugin reported a failure (see `didScreenshotFail`); `skipped` means the
 * plugin deliberately skipped the task.
 */
export type TaskStatus =
  | "pending"
  | "running"
  | "passed"
  | "changed"
  | "new"
  | "failed"
  | "skipped";

/** A discovered, runnable capture task together with the plugin that owns it. */
export type Target = {
  id: string;
  url: string;
  plugin: string;
};

/**
 * Describes which subset of the discovered tasks a run should capture.
 *
 * `filter` and `taskIds` compose: a task must satisfy both when both are given.
 */
export type StartRunRequest = {
  /** Restrict the run to these plugin names. Omit to run every plugin. */
  plugins?: string[];
  /** Glob matched against task ids (`path.matchesGlob` semantics). */
  filter?: string;
  /** Explicit task ids to capture. Ids not discovered are ignored. */
  taskIds?: string[];
  /**
   * Clear `actual/` and `diff/` before capturing.
   *
   * Always `true` for a full CLI run. A UI re-capturing a single screenshot must
   * pass `false`, otherwise the rest of the run's output is destroyed.
   * @default true
   */
  clearActual?: boolean;
};

/** An error flattened into something that survives a structured-clone or JSON. */
export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

export const toSerializedError = (error: unknown): SerializedError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { name: "Error", message: String(error) };
};

/**
 * The shape plugins return from `execute`. Every field is optional because
 * plugins are free to return whatever they want — only these keys are
 * interpreted (by `didScreenshotFail`) and surfaced in failure reports.
 */
export type PluginCaptureResult = {
  success?: boolean;
  skipped?: boolean;
  isNew?: boolean;
  error?: unknown;
  filepath?: string;
  storyId?: string;
  storyName?: string;
  [key: string]: unknown;
};

/** A task that did not produce a passing screenshot. */
export type TaskFailure = {
  taskId: string;
  taskUrl: string;
  pluginName: string;
  result: PluginCaptureResult;
};

/** Per-task record kept for the lifetime of a run. */
export type TaskRecord = {
  id: string;
  url: string;
  plugin: string;
  status: TaskStatus;
  durationMs?: number;
  result?: PluginCaptureResult;
};

/** Coarse, serializable view of a run — enough to render a list row. */
export type RunSummary = {
  id: string;
  state: RunState;
  request: StartRunRequest;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  /** Baselines in `expected/` with no matching `actual/` after the run. */
  deletedScreenshots: string[];
  /** `false` when discovery produced nothing (or everything was filtered out). */
  anyTasksRan: boolean;
  error?: SerializedError;
};

/** Full run view, including every task and failure. */
export type RunDetail = RunSummary & {
  tasks: TaskRecord[];
  failures: TaskFailure[];
};

/**
 * Levels the run event stream can carry.
 *
 * `success` is here because `ScreenshotTool` uses it — "Screenshot saved",
 * "Screenshot passed visual comparison" — and those lines have to reach a
 * remote client, not just the host's own terminal. Adding a level is a wire
 * change: this one lands before `PROTOCOL_VERSION` 1 has ever been published,
 * so it is part of what v1 will be. A later addition needs a version bump.
 */
export type RunLogLevel = "debug" | "info" | "warn" | "error" | "success";

type RunEventBase = {
  /** Monotonic, 1-based, per run. Used for SSE `Last-Event-ID` replay. */
  seq: number;
  runId: string;
  at: number;
};

/**
 * Everything an observer needs to follow a run. Emitted synchronously, so a
 * consumer forwarding these to a logger keeps ordering with logs written
 * directly by `ScreenshotTool`.
 */
export type RunEvent =
  | (RunEventBase & { type: "run:start"; request: StartRunRequest })
  | (RunEventBase & { type: "discover:start"; plugins: string[] })
  | (RunEventBase & {
      type: "discover:plugin";
      plugin: string;
      taskCount: number;
    })
  | (RunEventBase & {
      type: "discover:complete";
      targets: Target[];
      totalTasks: number;
    })
  | (RunEventBase & {
      type: "filter:applied";
      filter?: string;
      taskIds?: string[];
      plugins: { plugin: string; before: number; after: number }[];
    })
  | (RunEventBase & {
      type: "plugin:start";
      plugin: string;
      taskCount: number;
    })
  | (RunEventBase & {
      type: "task:start";
      plugin: string;
      taskId: string;
      url: string;
    })
  | (RunEventBase & {
      type: "task:complete";
      plugin: string;
      taskId: string;
      url: string;
      status: TaskStatus;
      completed: number;
      total: number;
      durationMs: number;
      result?: PluginCaptureResult;
    })
  | (RunEventBase & {
      type: "plugin:complete";
      plugin: string;
      resultCount: number;
      failed: boolean;
    })
  | (RunEventBase & {
      type: "log";
      level: RunLogLevel;
      message: string;
      args: unknown[];
    })
  | (RunEventBase & { type: "run:complete"; summary: RunSummary })
  | (RunEventBase & { type: "run:error"; error: SerializedError })
  | (RunEventBase & { type: "run:cancelled" });

export type RunEventType = RunEvent["type"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * A run event before the runner stamps it with `seq`, `runId` and `at`.
 *
 * `Omit` must distribute over the union here — a plain `Omit<RunEvent, …>`
 * collapses to the keys every member shares, which is just `type`.
 */
export type EmittableRunEvent = DistributiveOmit<
  RunEvent,
  "seq" | "runId" | "at"
>;

export type RunEventListener = (event: RunEvent) => void;

/** Plugin shape the runner needs. Kept structural so tests can pass fakes. */
export type RunnablePlugin = {
  name: string;
  description?: string;
  discover: (screenshotTool: any) => Promise<PluginTask[]>;
  execute: (
    task: PluginTask,
    page: any,
    screenshotTool: any,
    context: any,
  ) => Promise<unknown>;
  initPage?: (page: any, screenshotTool: any) => Promise<unknown>;
};
