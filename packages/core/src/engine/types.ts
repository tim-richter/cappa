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
