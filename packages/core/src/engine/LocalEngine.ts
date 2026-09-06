import { ScreenshotFileSystem } from "../filesystem";
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
  type ListTargetsOptions,
  type PluginInfo,
  RunInProgressError,
  type ScreenshotQuery,
  type SubscribeOptions,
  UnknownTargetsError,
} from "./types";
import { WarmBrowser } from "./WarmBrowser";

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
  private closed = false;

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

  async close(): Promise<void> {
    this.closed = true;

    const runner = this.activeRunId
      ? this.runs.getRunner(this.activeRunId)
      : undefined;
    runner?.abort();

    await this.browser.close();
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

  private async discoverTargets(): Promise<Target[]> {
    const tool = await this.browser.acquire();

    try {
      const discovered = await Promise.all(
        this.plugins.map(async (plugin) => {
          const tasks = await plugin.discover(tool);
          return tasks.map((task) => ({
            id: task.id,
            url: task.url,
            plugin: plugin.name,
          }));
        }),
      );

      this.targetsCache = discovered.flat();
      return this.targetsCache;
    } finally {
      this.browser.release();
    }
  }
}
