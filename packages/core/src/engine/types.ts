import type {
  RunDetail,
  RunEvent,
  RunSummary,
  StartRunRequest,
  Target,
} from "../runner/types";
import type { Screenshot } from "../types";

export type PluginInfo = {
  name: string;
  description?: string;
};

export type ScreenshotQuery = {
  search?: string;
  category?: Screenshot["category"];
};

export type ApproveResult = {
  approved: string[];
  errors: { name: string; error: string }[];
};

export type ListTargetsOptions = {
  /** Re-run plugin discovery instead of serving the cached target list. */
  refresh?: boolean;
};

export type SubscribeOptions = {
  /**
   * Replay buffered events with `seq > sinceSeq` before streaming live ones.
   * This is what makes a dropped SSE connection invisible to the client.
   */
  sinceSeq?: number;
};

/**
 * How a watch iteration decided what to capture.
 *
 * - `tasks` — an explicit set of task ids, resolved by the plugins.
 * - `plugins` — every task of one or more plugins, because at least one could
 *   not attribute the change (or ships no `watch` at all).
 * - `all` — everything under the session's filter: the resolved set was larger
 *   than the cap, or discovery itself failed.
 * - `none` — nothing to capture.
 */
export type WatchScope = "tasks" | "plugins" | "all" | "none";

/** What one settled batch of file changes led to. */
export type WatchChange = {
  /** Changed files, relative to the watch root. */
  files: string[];
  scope: WatchScope;
  /** Resolved task ids, when the scope is `tasks`. */
  taskIds?: string[];
  /** The run the change started, absent when none could be started. */
  runId?: string;
  /** Why no run was started, when that is what happened. */
  error?: string;
  at: number;
};

type WatchEventBase = {
  /** Monotonic, 1-based, per engine. Used for replay, like run events. */
  seq: number;
  at: number;
};

/**
 * The watch event stream.
 *
 * Separate from `RunEvent` because these events belong to a session that
 * outlives any single run — a watch session is a scheduler for runs, and the
 * runs it starts report themselves through the ordinary run stream.
 */
export type WatchEvent =
  | (WatchEventBase & {
      type: "watch:start";
      paths: string[];
      filter?: string;
      debounceMs: number;
    })
  | (WatchEventBase & { type: "watch:change" } & Omit<WatchChange, "at">)
  | (WatchEventBase & {
      type: "watch:stop";
      reason: "requested" | "engine-closed";
    });

export type WatchEventType = WatchEvent["type"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A watch event before the engine stamps it with `seq` and `at`. */
export type EmittableWatchEvent = DistributiveOmit<WatchEvent, "seq" | "at">;

/** What a watch session is doing, readable at any time. */
export type WatchStatus = {
  active: boolean;
  /** Roots being watched, relative to the working directory. */
  paths: string[];
  filter?: string;
  debounceMs: number;
  startedAt?: number;
  /** The most recent settled batch of changes, when there has been one. */
  lastChange?: WatchChange;
};

/** Options for `startWatch`. */
export type StartWatchRequest = {
  /**
   * Directories to watch, relative to the working directory.
   * @default ["."]
   */
  paths?: string[];
  /** Glob every watch-triggered run is restricted to (`path.matchesGlob`). */
  filter?: string;
  /**
   * How long changes must settle before a run starts.
   * @default 300
   */
  debounceMs?: number;
  /**
   * Above this many resolved task ids, capture everything under `filter`
   * instead. A branch switch is what this guards against.
   * @default 200
   */
  maxTasks?: number;
};

/**
 * Everything a UI needs to drive and observe captures.
 *
 * There are two implementations: `LocalEngine` runs the browser in-process, and
 * (later) a remote engine speaks HTTP + SSE to a server that does. The UI only
 * ever holds this interface, so moving the browser to another machine is a
 * different implementation rather than a rewrite.
 *
 * That is only true if the interface stays serializable: **no `Page`, `Browser`,
 * or plugin object may cross it** — arguments and return values must survive a
 * JSON round-trip. Plugins are live closures from `cappa.config.ts` and cannot
 * be sent anywhere; whichever process holds the engine is the one that loaded
 * the config.
 */
export interface CaptureEngine {
  /** Plugins this engine can run. */
  listPlugins(): Promise<PluginInfo[]>;

  /** Discovered, runnable tasks. Cached until `refresh` is requested. */
  listTargets(options?: ListTargetsOptions): Promise<Target[]>;

  /**
   * Start a capture. Resolves as soon as the run is registered — progress
   * arrives through `subscribeRun`.
   *
   * @throws {RunInProgressError} when a run is already active.
   */
  startRun(request?: StartRunRequest): Promise<RunSummary>;

  getRun(id: string): Promise<RunDetail | undefined>;

  /** Newest first. */
  listRuns(): Promise<RunSummary[]>;

  cancelRun(id: string): Promise<void>;

  /**
   * Observe a run. Returns an unsubscribe function.
   *
   * Buffered events are replayed synchronously before live delivery begins, so
   * a subscriber that attaches after `startRun` still sees the whole run.
   */
  subscribeRun(
    id: string,
    onEvent: (event: RunEvent) => void,
    options?: SubscribeOptions,
  ): () => void;

  listScreenshots(query?: ScreenshotQuery): Promise<Screenshot[]>;

  approve(names: string[]): Promise<ApproveResult>;

  /**
   * Re-capture on file change until `stopWatch`.
   *
   * Optional, because only an engine that can see the files is able to do it:
   * a remote engine drives the watcher on the *host*, and an engine with no
   * local filesystem at all has nothing to offer. Callers must feature-detect
   * rather than assume.
   *
   * @throws {WatchInProgressError} when a session is already active.
   */
  startWatch?(request?: StartWatchRequest): Promise<WatchStatus>;

  /** Stop the active watch session. A no-op when there is none. */
  stopWatch?(): Promise<void>;

  /** What the watch session is doing, or an inactive status when there is none. */
  getWatchStatus?(): Promise<WatchStatus>;

  /**
   * Observe the watch event stream. Returns an unsubscribe function.
   *
   * Buffered events are replayed synchronously before live delivery, exactly
   * as `subscribeRun` does.
   */
  subscribeWatch?(
    onEvent: (event: WatchEvent) => void,
    options?: SubscribeOptions,
  ): () => void;

  /** Release resources (browser, timers). Safe to call more than once. */
  close(): Promise<void>;
}

/**
 * Stable discriminators for engine errors.
 *
 * These exist because `instanceof` is not reliable across the package
 * boundary. `@cappa/core` ships dual ESM/CJS builds, so a CJS consumer (the
 * CLI binary) and an ESM one (the server) each load their own copy of these
 * classes: an error thrown by one is not an `instanceof` the other's class,
 * and the check silently fails — turning a 409 into a 500. Callers must use
 * the guards below rather than `instanceof`.
 */
export const ENGINE_ERROR_CODES = {
  runInProgress: "CAPPA_RUN_IN_PROGRESS",
  unknownTargets: "CAPPA_UNKNOWN_TARGETS",
  watchInProgress: "CAPPA_WATCH_IN_PROGRESS",
} as const;

/** Thrown by `startRun` when the engine is already running something. */
export class RunInProgressError extends Error {
  readonly code = ENGINE_ERROR_CODES.runInProgress;
  readonly activeRunId: string;

  constructor(activeRunId: string) {
    super(`A capture run is already in progress (${activeRunId})`);
    this.name = "RunInProgressError";
    this.activeRunId = activeRunId;
  }
}

/** Thrown by `startRun` when `taskIds` names tasks that were never discovered. */
export class UnknownTargetsError extends Error {
  readonly code = ENGINE_ERROR_CODES.unknownTargets;
  readonly taskIds: string[];

  constructor(taskIds: string[]) {
    super(`Unknown task ids: ${taskIds.join(", ")}`);
    this.name = "UnknownTargetsError";
    this.taskIds = taskIds;
  }
}

/** Thrown by `startWatch` when a watch session is already running. */
export class WatchInProgressError extends Error {
  readonly code = ENGINE_ERROR_CODES.watchInProgress;

  constructor() {
    super("A watch session is already running");
    this.name = "WatchInProgressError";
  }
}

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && (error as { code?: unknown }).code === code;

/**
 * Identity-independent check for `RunInProgressError`.
 *
 * Prefer this over `instanceof` — see `ENGINE_ERROR_CODES`.
 */
export const isRunInProgressError = (
  error: unknown,
): error is RunInProgressError =>
  hasCode(error, ENGINE_ERROR_CODES.runInProgress);

/** Identity-independent check for `UnknownTargetsError`. */
export const isUnknownTargetsError = (
  error: unknown,
): error is UnknownTargetsError =>
  hasCode(error, ENGINE_ERROR_CODES.unknownTargets);

/** Identity-independent check for `WatchInProgressError`. */
export const isWatchInProgressError = (
  error: unknown,
): error is WatchInProgressError =>
  hasCode(error, ENGINE_ERROR_CODES.watchInProgress);
