import path from "node:path";
import type { PluginTask } from "../plugin";
import type {
  RunnablePlugin,
  RunSummary,
  StartRunRequest,
} from "../runner/types";
import type {
  EmittableWatchEvent,
  WatchChange,
  WatchScope,
  WatchStatus,
} from "./types";

/**
 * The slice of a file watcher this session uses.
 *
 * Structural rather than chokidar's own type, so a test can drive a session
 * with a stand-in instead of real filesystem events — which are slow, ordered
 * by the OS rather than by the test, and different on every platform.
 */
export interface FileWatcher {
  on(
    event: "all",
    listener: (event: string, changedPath: string) => void,
  ): unknown;
  on(event: "ready", listener: () => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
  close(): Promise<void>;
}

export type CreateFileWatcher = (
  roots: string[],
  options: { cwd: string; ignored: (candidate: string) => boolean },
) => FileWatcher | Promise<FileWatcher>;

/**
 * Directories no watch should ever descend into.
 *
 * `outputDir` is not here because it is not a fixed name — the engine passes it
 * in. Missing it would be fatal rather than merely noisy: a capture writes PNGs
 * into it, every write is a change, and the session would trigger itself
 * forever.
 */
export const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  ".cache",
  ".next",
  ".nuxt",
  ".output",
  ".parcel-cache",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "storybook-static",
]);

/** Watch-mode defaults, exported so the CLI and docs can quote one source. */
export const DEFAULT_DEBOUNCE_MS = 300;
export const DEFAULT_MAX_TASKS = 200;
/** How long `start()` waits for the initial filesystem scan before giving up on it. */
const READY_TIMEOUT_MS = 10_000;

export type WatchSessionOptions = {
  plugins: RunnablePlugin[];
  /** Discovered tasks per plugin name. Called once per settled batch. */
  discover: () => Promise<Map<string, PluginTask[]>>;
  /** Start a run. Resolves as soon as the run is registered. */
  startRun: (request: StartRunRequest) => Promise<RunSummary>;
  /** Resolve when the given run reaches a terminal event. */
  waitForRun: (runId: string) => Promise<void>;
  emit?: (event: EmittableWatchEvent) => void;
  cwd?: string;
  /** Roots to watch, relative to `cwd`. @default ["."] */
  paths?: string[];
  /** Absolute or `cwd`-relative paths never to watch (the output directory). */
  ignoredPaths?: string[];
  filter?: string;
  debounceMs?: number;
  maxTasks?: number;
  createWatcher?: CreateFileWatcher;
  now?: () => number;
};

/** What a settled batch of changes resolved to. */
type WatchResolution = {
  scope: WatchScope;
  taskIds?: string[];
  request: StartRunRequest;
};

/**
 * chokidar, loaded on first use.
 *
 * Imported lazily so that requiring `@cappa/core` — which the CLI does for
 * every command, and a plugin does just to get types — never starts a file
 * watcher's dependency tree for a process that will not watch anything.
 */
const defaultCreateWatcher: CreateFileWatcher = async (roots, options) => {
  const { watch } = await import("chokidar");

  return watch(roots, {
    cwd: options.cwd,
    ignoreInitial: true,
    ignored: (candidate: string) => options.ignored(candidate),
  }) as unknown as FileWatcher;
};

/**
 * Re-captures affected tasks when files change.
 *
 * A scheduler for runs, deliberately not a second orchestrator: every iteration
 * goes through the engine's ordinary `startRun`, so watch-triggered captures
 * emit the same events, land in the same run store and honour the same
 * one-run-at-a-time rule as a capture somebody clicked.
 *
 * Two behaviours matter more than they look:
 *
 * - **`clearActual` is always false.** Clearing on every save would delete the
 *   diffs the user is looking at for tasks they did not touch.
 * - **Changes during a run are queued, never rejected.** The engine's single-run
 *   rule stays intact, and the user gets the run they expect rather than a
 *   conflict error they did not cause.
 */
export class WatchSession {
  private readonly options: WatchSessionOptions;
  private readonly cwd: string;
  private readonly roots: string[];
  private readonly ignoredRoots: string[];
  private readonly debounceMs: number;
  private readonly maxTasks: number;
  private readonly now: () => number;

  private watcher: FileWatcher | null = null;
  private readonly pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draining = false;
  private stopped = false;
  private startedAt: number | undefined;
  private lastChange: WatchChange | undefined;

  constructor(options: WatchSessionOptions) {
    this.options = options;
    this.cwd = options.cwd ?? process.cwd();
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.maxTasks = options.maxTasks ?? DEFAULT_MAX_TASKS;
    this.now = options.now ?? (() => Date.now());

    this.roots = resolveRoots(options.paths, options.plugins);
    this.ignoredRoots = (options.ignoredPaths ?? []).map((entry) =>
      path.resolve(this.cwd, entry),
    );
  }

  /** Begin watching. Resolves once the initial scan has settled. */
  async start(): Promise<WatchStatus> {
    if (this.watcher) {
      return this.getStatus();
    }

    const create = this.options.createWatcher ?? defaultCreateWatcher;
    const watcher = await create(this.roots, {
      cwd: this.cwd,
      ignored: (candidate) => this.isIgnored(candidate),
    });

    // `stop()` can land while the watcher is still being built; closing it here
    // is what stops that race leaving a watcher nobody holds a handle to.
    if (this.stopped) {
      await watcher.close();
      return this.getStatus();
    }

    this.watcher = watcher;

    watcher.on("all", (event, changedPath) => {
      // Directory events say nothing about what a screenshot would look like;
      // the file events inside them do.
      if (event !== "add" && event !== "change" && event !== "unlink") {
        return;
      }
      this.onFileChanged(changedPath);
    });

    // Swallowed on purpose: a watcher that reports an unreadable directory has
    // not stopped watching everything else, and taking the session down over it
    // would be worse than the noise.
    watcher.on("error", () => {});

    await this.waitForReady(watcher);

    this.startedAt = this.now();
    this.emit({
      type: "watch:start",
      paths: this.roots,
      filter: this.options.filter,
      debounceMs: this.debounceMs,
    });

    return this.getStatus();
  }

  /**
   * Stop watching.
   *
   * Deliberately does not cancel a run already in flight: that run is the
   * answer to a save the user made, and killing it half-way leaves `actual/`
   * holding a partial capture.
   */
  async stop(
    reason: "requested" | "engine-closed" = "requested",
  ): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();

    const watcher = this.watcher;
    this.watcher = null;

    try {
      await watcher?.close();
    } finally {
      this.emit({ type: "watch:stop", reason });
    }
  }

  getStatus(): WatchStatus {
    return {
      active: this.watcher !== null && !this.stopped,
      paths: this.roots,
      filter: this.options.filter,
      debounceMs: this.debounceMs,
      startedAt: this.startedAt,
      lastChange: this.lastChange,
    };
  }

  private emit(event: EmittableWatchEvent): void {
    this.options.emit?.(event);
  }

  private async waitForReady(watcher: FileWatcher): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      // Bounded: a large tree can take a while to scan, but a `ready` that
      // never arrives must not leave `startWatch` hanging forever. Events flow
      // during the scan either way, so proceeding early costs nothing.
      const timer = setTimeout(finish, READY_TIMEOUT_MS);
      timer.unref?.();

      watcher.on("ready", finish);
      watcher.on("error", finish);
    });
  }

  private onFileChanged(changedPath: string): void {
    if (this.stopped) {
      return;
    }

    this.pending.add(toRelative(this.cwd, changedPath));

    if (this.timer) {
      clearTimeout(this.timer);
    }

    const timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, this.debounceMs);
    timer.unref?.();
    this.timer = timer;
  }

  /**
   * Capture for everything pending, one batch at a time.
   *
   * The loop re-reads `pending` after each iteration, which is what turns a
   * save arriving mid-run into the next iteration rather than into a `409`.
   */
  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;

    try {
      while (this.pending.size > 0 && !this.stopped) {
        const files = [...this.pending].sort();
        this.pending.clear();
        await this.captureFor(files);
      }
    } finally {
      this.draining = false;
    }
  }

  private async captureFor(files: string[]): Promise<void> {
    const resolution = await this.resolveFiles(files);

    if (resolution.scope === "none") {
      this.record({ files, scope: "none", taskIds: [], at: this.now() });
      return;
    }

    let runId: string | undefined;
    let error: string | undefined;

    try {
      const summary = await this.options.startRun(resolution.request);
      runId = summary.id;
    } catch (cause) {
      // Most likely a run somebody else started — the CLI in another terminal,
      // or the review UI. Say so and wait for the next save rather than
      // retrying into the same conflict.
      error = cause instanceof Error ? cause.message : String(cause);
    }

    this.record({
      files,
      scope: resolution.scope,
      taskIds: resolution.taskIds,
      runId,
      error,
      at: this.now(),
    });

    if (runId) {
      await this.options.waitForRun(runId);
    }
  }

  private record(change: WatchChange): void {
    this.lastChange = change;
    const { at: _at, ...rest } = change;
    this.emit({ type: "watch:change", ...rest });
  }

  /**
   * Ask every plugin what the changed files affect, and turn the answers into
   * one run request.
   */
  private async resolveFiles(files: string[]): Promise<WatchResolution> {
    const trigger = { source: "watch" as const, files };
    const everything: WatchResolution = {
      scope: "all",
      request: {
        filter: this.options.filter,
        clearActual: false,
        trigger,
      },
    };

    let tasksByPlugin: Map<string, PluginTask[]>;
    try {
      tasksByPlugin = await this.options.discover();
    } catch {
      // Discovery failing — a dev server mid-restart, most likely — is not a
      // reason to capture nothing. Run everything and let the run report it.
      return everything;
    }

    const fullPlugins = new Set<string>();
    const taskIds = new Set<string>();

    for (const plugin of this.options.plugins) {
      const tasks = tasksByPlugin.get(plugin.name) ?? [];

      if (!plugin.watch) {
        fullPlugins.add(plugin.name);
        continue;
      }

      for (const file of files) {
        let resolved: string[] | null;
        try {
          resolved = plugin.watch.resolve(file, tasks);
        } catch {
          // A plugin that throws is a plugin that cannot tell.
          resolved = null;
        }

        if (resolved === null) {
          fullPlugins.add(plugin.name);
          break;
        }

        for (const id of resolved) {
          taskIds.add(id);
        }
      }
    }

    if (fullPlugins.size === 0) {
      if (taskIds.size === 0) {
        return { scope: "none", request: {} };
      }
      return this.byTaskIds([...taskIds], trigger, everything);
    }

    if (taskIds.size === 0) {
      return {
        scope: "plugins",
        request: {
          plugins: [...fullPlugins],
          filter: this.options.filter,
          clearActual: false,
          trigger,
        },
      };
    }

    // Mixed: some plugins named tasks, others need everything they own. A
    // request cannot express that directly — `plugins` and `taskIds` compose as
    // "and" — so the full plugins are expanded to the ids discovery just
    // produced. The one thing this misses is a task created since that
    // discovery, which the next iteration picks up.
    const expanded = new Set(taskIds);
    for (const name of fullPlugins) {
      for (const task of tasksByPlugin.get(name) ?? []) {
        expanded.add(task.id);
      }
    }

    return this.byTaskIds([...expanded], trigger, everything);
  }

  /**
   * A run of explicit ids, unless there are so many that naming them is
   * pointless — a branch switch or a formatter pass resolves half the project,
   * and a filtered full run is both cheaper to express and easier to read.
   */
  private byTaskIds(
    taskIds: string[],
    trigger: { source: "watch"; files: string[] },
    everything: WatchResolution,
  ): WatchResolution {
    if (taskIds.length > this.maxTasks) {
      return everything;
    }

    return {
      scope: "tasks",
      taskIds,
      request: {
        taskIds,
        filter: this.options.filter,
        clearActual: false,
        trigger,
      },
    };
  }

  private isIgnored(candidate: string): boolean {
    const absolute = path.resolve(this.cwd, candidate);
    const relative = path.relative(this.cwd, absolute);

    // Outside the working directory: nothing here can be attributed to a task.
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return true;
    }

    for (const ignored of this.ignoredRoots) {
      if (
        absolute === ignored ||
        absolute.startsWith(`${ignored}${path.sep}`)
      ) {
        return true;
      }
    }

    return relative
      .split(path.sep)
      .some((segment) => DEFAULT_IGNORED_DIRS.has(segment));
  }
}

/** The part of a glob before its first magic character — the directory to watch. */
export const globRoot = (pattern: string): string => {
  const segments = pattern.split("/");
  const staticSegments: string[] = [];

  for (const segment of segments) {
    if (/[*?[\]{}!+@(]/.test(segment)) {
      break;
    }
    staticSegments.push(segment);
  }

  // Drop the last static segment only when it is the file itself; a pattern
  // with no magic at all is a literal path and stays as it is.
  const root = staticSegments.join("/");
  return root === "" ? "." : root;
};

/**
 * What to hand the watcher.
 *
 * The project root by default, plus the roots of whatever globs the plugins
 * declared. Plugin globs can only widen the set: a plugin that maps story files
 * precisely still has to be told about the component those stories render, and
 * that component is not in its globs.
 */
const resolveRoots = (
  paths: string[] | undefined,
  plugins: RunnablePlugin[],
): string[] => {
  const roots = new Set(paths && paths.length > 0 ? paths : ["."]);

  for (const plugin of plugins) {
    for (const pattern of plugin.watch?.paths ?? []) {
      roots.add(globRoot(pattern));
    }
  }

  // "." subsumes everything else.
  if (roots.has(".")) {
    return ["."];
  }

  return [...roots];
};

const toRelative = (cwd: string, changedPath: string): string => {
  if (!path.isAbsolute(changedPath)) {
    return changedPath.split(path.sep).join("/");
  }
  return path.relative(cwd, changedPath).split(path.sep).join("/");
};
