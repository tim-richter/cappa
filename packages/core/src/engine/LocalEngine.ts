import { ScreenshotFileSystem } from "../filesystem";
import type { PluginTask } from "../plugin";
import { CaptureRunner } from "../runner/CaptureRunner";
import type {
  RunDetail,
  RunEvent,
  RunnablePlugin,
  RunSummary,
  StartRunRequest,
  Target,
} from "../runner/types";
import ScreenshotTool from "../screenshot";
import { collectScreenshots } from "../screenshots/collectScreenshots";
import type { DiffOptions, Screenshot, Viewport } from "../types";
import { RunStore, type RunStoreOptions } from "./RunStore";
import {
  type ApproveResult,
  type CaptureEngine,
  type EmittableWatchEvent,
  type ListTargetsOptions,
  type PluginInfo,
  RunInProgressError,
  type ScreenshotQuery,
  type StartWatchRequest,
  type SubscribeOptions,
  UnknownTargetsError,
  type WatchEvent,
  WatchInProgressError,
  type WatchStatus,
} from "./types";
import { WarmBrowser } from "./WarmBrowser";
import {
  type CreateFileWatcher,
  DEFAULT_DEBOUNCE_MS,
  WatchSession,
} from "./WatchSession";

export type LocalEngineOptions = {
  outputDir: string;
  plugins: RunnablePlugin[];
  diff?: DiffOptions;
  retries?: number;
  concurrency?: number;
  logConsoleEvents?: boolean;
  fullPage?: boolean;
  viewport?: Viewport;
  connectionTimeout?: number;
  /**
   * How long the browser stays warm between runs.
   * @default 300_000 (5 minutes)
   */
  browserIdleTimeoutMs?: number;
  runStore?: RunStoreOptions;
  /** Overrides the screenshot tool factory. Tests use this. */
  createScreenshotTool?: () => ScreenshotTool;
  /** Working directory a watch session watches. @default process.cwd() */
  cwd?: string;
  /** Overrides the file watcher factory. Tests use this. */
  createWatcher?: CreateFileWatcher;
  /** Watch events buffered for replay to a (re)connecting subscriber. @default 200 */
  maxWatchEvents?: number;
};

/**
 * `CaptureEngine` backed by an in-process Playwright browser.
 *
 * Holds the config's live plugin objects, so it must live in the process that
 * loaded `cappa.config.ts`. The server takes one of these by injection rather
 * than building it, which is what keeps `@cappa/server` free of config loading
 * and makes a remote engine a drop-in alternative.
 *
 * One run at a time. Queuing is deliberately not implemented: the browser pool
 * is the real constraint, and a second concurrent run would fight it.
 */
export class LocalEngine implements CaptureEngine {
  private readonly options: LocalEngineOptions;
  private readonly plugins: RunnablePlugin[];
  private readonly fileSystem: ScreenshotFileSystem;
  private readonly browser: WarmBrowser;
  private readonly runs: RunStore;

  /**
   * Set synchronously the moment a run is claimed, before any `await`, so two
   * concurrent `startRun` calls cannot both pass the check and then fight over
   * the browser. Covers the window between claiming and the run finishing.
   */
  private busy = false;
  private activeRunId: string | null = null;
  private targetsCache: Target[] | null = null;
  /**
   * The tasks behind `targetsCache`, kept whole.
   *
   * A `Target` is what crosses the wire; a plugin's `watch.resolve` needs the
   * task it came from, `data` included — that is where a story's `importPath`
   * lives. Same discovery, two shapes, one cache lifetime.
   */
  private taskCache: Map<string, PluginTask[]> | null = null;
  private closed = false;

  private watchSession: WatchSession | null = null;
  private releaseBrowserHold: (() => void) | null = null;
  private readonly watchListeners = new Set<(event: WatchEvent) => void>();
  private watchEvents: WatchEvent[] = [];
  private watchSeq = 0;

  constructor(options: LocalEngineOptions) {
    this.options = options;
    this.plugins = options.plugins;
    this.fileSystem = new ScreenshotFileSystem(options.outputDir);
    this.runs = new RunStore(options.runStore);
    this.browser = new WarmBrowser({
      create: options.createScreenshotTool ?? (() => this.buildTool()),
      idleTimeoutMs: options.browserIdleTimeoutMs,
    });
  }

  private buildTool(): ScreenshotTool {
    return new ScreenshotTool({
      outputDir: this.options.outputDir,
      diff: this.options.diff,
      retries: this.options.retries,
      concurrency: this.options.concurrency,
      logConsoleEvents: this.options.logConsoleEvents,
      fullPage: this.options.fullPage ?? true,
      viewport: this.options.viewport ?? { width: 1920, height: 1080 },
      connectionTimeout: this.options.connectionTimeout,
    });
  }

  async listPlugins(): Promise<PluginInfo[]> {
    return this.plugins.map((plugin) => ({
      name: plugin.name,
      description: plugin.description,
    }));
  }

  /**
   * Discovery needs a browser (plugins query the app under test through it), so
   * this warms the browser on a cache miss.
   *
   * While a run holds the browser, only the cache can be served: discovering
   * would recycle the very contexts the run is capturing with.
   */
  async listTargets(options: ListTargetsOptions = {}): Promise<Target[]> {
    this.assertOpen();

    if (this.targetsCache && !options.refresh) {
      return this.targetsCache;
    }

    if (this.busy) {
      if (this.targetsCache) {
        return this.targetsCache;
      }
      throw new RunInProgressError(this.activeRunId ?? "starting");
    }

    return this.discoverTargets();
  }

  async startRun(request: StartRunRequest = {}): Promise<RunSummary> {
    this.assertOpen();

    if (this.busy) {
      throw new RunInProgressError(this.activeRunId ?? "starting");
    }

    // Claim before the first await — see the `busy` field comment.
    this.busy = true;

    try {
      await this.validateTaskIds(request);

      const tool = await this.browser.acquire();

      const runner = new CaptureRunner({
        screenshotTool: tool,
        plugins: this.plugins,
        outputDir: this.options.outputDir,
        fileSystem: this.fileSystem,
      });

      const finish = () => {
        if (this.activeRunId !== runner.id) {
          return;
        }

        // Discovery results may be stale after a run changed what exists.
        this.targetsCache = null;
        this.taskCache = null;
        this.runs.finalize(runner.id);
        this.activeRunId = null;
        this.busy = false;
        this.browser.release();
      };

      // Registered *before* the run store, so cleanup completes inside the same
      // synchronous emit as the terminal event and therefore before any
      // subscriber observes it. Without this, the obvious client behaviour —
      // "the run finished, start the next one" — races the engine's own
      // teardown and is rejected as though a run were still in progress.
      runner.on((event) => {
        if (event.type === "run:complete" || event.type === "run:error") {
          finish();
        }
      });

      this.runs.add(runner);
      this.activeRunId = runner.id;

      // Deliberately not awaited: the caller gets the run id immediately and
      // follows progress through `subscribeRun`.
      void runner
        .run(request)
        .catch(() => {
          // The failure is already on the event stream as `run:error`, and is
          // readable via `getRun`. Swallow it so it is not an unhandled
          // rejection.
        })
        // Belt and braces: `finish` is idempotent, and this covers any terminal
        // path that somehow did not emit an event.
        .finally(finish);

      return runner.getSummary();
    } catch (error) {
      this.busy = false;
      this.activeRunId = null;
      throw error;
    }
  }

  async getRun(id: string): Promise<RunDetail | undefined> {
    return this.runs.get(id);
  }

  async listRuns(): Promise<RunSummary[]> {
    return this.runs.list();
  }

  async cancelRun(id: string): Promise<void> {
    this.runs.getRunner(id)?.abort();
  }

  subscribeRun(
    id: string,
    onEvent: (event: RunEvent) => void,
    options: SubscribeOptions = {},
  ): () => void {
    return this.runs.subscribe(id, onEvent, options);
  }

  /**
   * Read the screenshot index from disk.
   *
   * Always a fresh read rather than a cached snapshot — anything can write to
   * `outputDir` while the server is up, including a CLI run in another terminal.
   */
  async listScreenshots(query: ScreenshotQuery = {}): Promise<Screenshot[]> {
    let screenshots = await collectScreenshots(this.options.outputDir);

    if (query.category) {
      screenshots = screenshots.filter(
        (screenshot) => screenshot.category === query.category,
      );
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      screenshots = screenshots.filter((screenshot) =>
        screenshot.name.toLowerCase().includes(term),
      );
    }

    return screenshots;
  }

  async approve(names: string[]): Promise<ApproveResult> {
    const screenshots = await this.listScreenshots();
    const approved: string[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const name of names) {
      const screenshot = screenshots.find((entry) => entry.name === name);
      if (!screenshot) {
        errors.push({ name, error: "Screenshot not found" });
        continue;
      }

      try {
        await this.fileSystem.approveScreenshots(
          [screenshot],
          this.options.diff ?? { type: "pixel" },
        );
        approved.push(name);
      } catch (error) {
        errors.push({
          name,
          error: error instanceof Error ? error.message : "Approval failed",
        });
      }
    }

    return { approved, errors };
  }

  /**
   * Re-capture affected tasks on file change until `stopWatch`.
   *
   * Every iteration goes through `startRun`, so a watch-triggered capture is an
   * ordinary run: same events, same run store, same single-run rule, visible in
   * `listRuns` and in the UI. Watch is a scheduler, not a second orchestrator.
   */
  async startWatch(request: StartWatchRequest = {}): Promise<WatchStatus> {
    this.assertOpen();

    if (this.watchSession) {
      throw new WatchInProgressError();
    }

    // Held for the session's whole life: without it the idle timer closes the
    // browser between saves, and the next save pays a cold start — the exact
    // cost watch mode exists to avoid.
    const release = this.browser.hold();

    const session = new WatchSession({
      plugins: this.plugins,
      cwd: this.options.cwd,
      paths: request.paths,
      // Captures write into `outputDir`. Watching it would make every run
      // trigger the next one, forever.
      ignoredPaths: [this.options.outputDir],
      filter: request.filter,
      debounceMs: request.debounceMs,
      maxTasks: request.maxTasks,
      createWatcher: this.options.createWatcher,
      discover: () => this.discoverTasks(),
      startRun: (runRequest) => this.startRun(runRequest),
      waitForRun: (runId) => this.waitForRun(runId),
      emit: (event) => this.emitWatchEvent(event),
    });

    this.watchSession = session;
    this.releaseBrowserHold = release;

    try {
      return await session.start();
    } catch (error) {
      this.watchSession = null;
      this.releaseBrowserHold = null;
      release();
      throw error;
    }
  }

  async stopWatch(): Promise<void> {
    await this.endWatch("requested");
  }

  async getWatchStatus(): Promise<WatchStatus> {
    return (
      this.watchSession?.getStatus() ?? {
        active: false,
        paths: [],
        debounceMs: DEFAULT_DEBOUNCE_MS,
      }
    );
  }

  subscribeWatch(
    onEvent: (event: WatchEvent) => void,
    options: SubscribeOptions = {},
  ): () => void {
    const sinceSeq = options.sinceSeq ?? 0;
    for (const event of this.watchEvents) {
      if (event.seq > sinceSeq) {
        onEvent(event);
      }
    }

    this.watchListeners.add(onEvent);
    return () => {
      this.watchListeners.delete(onEvent);
    };
  }

  async close(): Promise<void> {
    this.closed = true;

    await this.endWatch("engine-closed");

    const runner = this.activeRunId
      ? this.runs.getRunner(this.activeRunId)
      : undefined;
    runner?.abort();

    await this.browser.close();
  }

  private async endWatch(reason: "requested" | "engine-closed"): Promise<void> {
    const session = this.watchSession;
    const release = this.releaseBrowserHold;
    this.watchSession = null;
    this.releaseBrowserHold = null;

    try {
      await session?.stop(reason);
    } finally {
      release?.();
    }
  }

  private emitWatchEvent(event: EmittableWatchEvent): void {
    this.watchSeq += 1;
    const full = { ...event, seq: this.watchSeq, at: Date.now() } as WatchEvent;

    this.watchEvents.push(full);
    const max = this.options.maxWatchEvents ?? 200;
    if (this.watchEvents.length > max) {
      this.watchEvents = this.watchEvents.slice(-max);
    }

    for (const listener of this.watchListeners) {
      try {
        listener(full);
      } catch {
        // A failing subscriber must not stop the watch session.
      }
    }
  }

  /** Resolve once a run reaches a terminal event. */
  private waitForRun(id: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let unsubscribe: (() => void) | undefined;
      let finished = false;

      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        unsubscribe?.();
        resolve();
      };

      unsubscribe = this.runs.subscribe(id, (event) => {
        if (event.type === "run:complete" || event.type === "run:error") {
          finish();
        }
      });

      // Buffered events replay synchronously, so a run that is already over
      // finished before `unsubscribe` existed.
      if (finished) {
        unsubscribe();
      }
    });
  }

  /** True while a browser process is alive. Exposed for tests and diagnostics. */
  get isWarm(): boolean {
    return this.browser.isWarm;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("Engine has been closed");
    }
  }

  /**
   * A client may only ask for tasks that discovery produced.
   *
   * This is a security boundary as much as a correctness one: it is what stops
   * a request from steering the browser to an arbitrary URL.
   */
  private async validateTaskIds(request: StartRunRequest): Promise<void> {
    if (!request.taskIds || request.taskIds.length === 0) {
      return;
    }

    // Bypasses the public `listTargets` busy guard on purpose: this runs after
    // the run is claimed but before the browser is acquired, so discovery here
    // cannot disturb an in-flight capture.
    const targets = this.targetsCache ?? (await this.discoverTargets());
    const known = new Set(targets.map((target) => target.id));
    const unknown = request.taskIds.filter((id) => !known.has(id));

    if (unknown.length > 0) {
      throw new UnknownTargetsError(unknown);
    }
  }

  /** Discovered tasks per plugin, whole. Cached with `targetsCache`. */
  private async discoverTasks(): Promise<Map<string, PluginTask[]>> {
    if (this.taskCache) {
      return this.taskCache;
    }

    await this.discoverTargets();
    return this.taskCache ?? new Map();
  }

  private async discoverTargets(): Promise<Target[]> {
    const tool = await this.browser.acquire();

    try {
      const discovered = await Promise.all(
        this.plugins.map(async (plugin) => {
          const tasks = await plugin.discover(tool);
          return { plugin: plugin.name, tasks };
        }),
      );

      this.taskCache = new Map(
        discovered.map(({ plugin, tasks }) => [plugin, tasks]),
      );

      this.targetsCache = discovered.flatMap(({ plugin, tasks }) =>
        tasks.map((task) => ({
          id: task.id,
          url: task.url,
          plugin,
        })),
      );
      return this.targetsCache;
    } finally {
      this.browser.release();
    }
  }
}
