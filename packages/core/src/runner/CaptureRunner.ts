import { randomUUID } from "node:crypto";
import { ScreenshotFileSystem } from "../filesystem";
import { mapWithConcurrency } from "../mapWithConcurrency";
import type { PluginTask } from "../plugin";
import type ScreenshotTool from "../screenshot";
import {
  didScreenshotFail,
  filterTasks,
  getDeletedScreenshots,
  selectTasks,
  toTaskStatus,
} from "./tasks";
import type {
  EmittableRunEvent,
  PluginCaptureResult,
  RunDetail,
  RunEvent,
  RunEventListener,
  RunLogLevel,
  RunnablePlugin,
  RunState,
  RunSummary,
  StartRunRequest,
  Target,
  TaskFailure,
  TaskRecord,
} from "./types";
import { toSerializedError } from "./types";

export type CaptureRunnerOptions = {
  /**
   * An **already initialised** `ScreenshotTool`. The runner never calls `init()`
   * or `close()` — browser lifetime belongs to the caller, so a long-lived
   * server can keep one browser warm across many runs while the CLI can keep
   * its init/close-per-run shape.
   */
  screenshotTool: ScreenshotTool;
  plugins: RunnablePlugin[];
  /** Defaults to the screenshot tool's output directory. */
  outputDir?: string;
  /**
   * Filesystem used to clear `actual/` and `diff/`. Defaults to the screenshot
   * tool's own instance, falling back to one built from `outputDir`.
   */
  fileSystem?: ScreenshotFileSystem;
  /** Stable run id. Generated when omitted. */
  id?: string;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
};

/**
 * Orchestrates a single capture run: discover → filter → execute, emitting
 * typed events as it goes.
 *
 * Deliberately free of any presentation or process concerns — no logger calls,
 * no `chalk`, no `process.exit`. Consumers render the events however they like:
 * the CLI writes them to the terminal, the server streams them over SSE.
 *
 * One instance represents one run. Create a new one per run.
 */
export class CaptureRunner {
  readonly id: string;

  private readonly screenshotTool: ScreenshotTool;
  private readonly plugins: RunnablePlugin[];
  private readonly outputDir: string;
  private readonly fileSystem: ScreenshotFileSystem;
  private readonly now: () => number;
  private readonly listeners = new Set<RunEventListener>();
  private readonly controller = new AbortController();

  private seq = 0;
  private state: RunState = "idle";
  private request: StartRunRequest = {};
  private startedAt = 0;
  private finishedAt: number | undefined;
  private error: unknown;
  private anyTasksRan = false;
  private deletedScreenshots: string[] = [];
  private readonly taskRecords = new Map<string, TaskRecord>();
  private readonly failures: TaskFailure[] = [];
  private started = false;

  constructor(options: CaptureRunnerOptions) {
    this.screenshotTool = options.screenshotTool;
    this.plugins = options.plugins;
    this.outputDir = options.outputDir ?? options.screenshotTool.outputDir;
    this.fileSystem =
      options.fileSystem ??
      options.screenshotTool.filesystem ??
      new ScreenshotFileSystem(this.outputDir);
    this.id = options.id ?? randomUUID();
    this.now = options.now ?? (() => Date.now());
  }

  /** Subscribe to run events. Returns an unsubscribe function. */
  on(listener: RunEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Request cancellation. In-flight tasks finish (Playwright gives us no safe
   * mid-screenshot abort), but no further tasks are started.
   */
  abort(): void {
    if (this.state === "completed" || this.state === "failed") {
      return;
    }
    this.controller.abort();
  }

  getSummary(): RunSummary {
    const tasks = [...this.taskRecords.values()];
    const completedTasks = tasks.filter(
      (task) => task.status !== "pending" && task.status !== "running",
    ).length;

    return {
      id: this.id,
      state: this.state,
      request: this.request,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs:
        this.finishedAt === undefined
          ? undefined
          : this.finishedAt - this.startedAt,
      totalTasks: tasks.length,
      completedTasks,
      failedTasks: this.failures.length,
      deletedScreenshots: this.deletedScreenshots,
      anyTasksRan: this.anyTasksRan,
      error:
        this.error === undefined ? undefined : toSerializedError(this.error),
    };
  }

  getDetail(): RunDetail {
    return {
      ...this.getSummary(),
      tasks: [...this.taskRecords.values()],
      failures: [...this.failures],
    };
  }

  /**
   * Whether the run produced at least one failing screenshot or detected a
   * deleted baseline — the condition the CLI exits non-zero on.
   */
  get hasScreenshotFailure(): boolean {
    return this.failures.length > 0 || this.deletedScreenshots.length > 0;
  }

  private emit(event: EmittableRunEvent): void {
    this.seq += 1;
    const full = {
      ...event,
      seq: this.seq,
      runId: this.id,
      at: this.now(),
    } as RunEvent;

    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch {
        // A misbehaving observer must never take down the run.
      }
    }
  }

  private log(level: RunLogLevel, message: string, ...args: unknown[]): void {
    this.emit({ type: "log", level, message, args });
  }

  /**
   * Run the capture. Resolves with the final detail; rejects if a plugin threw,
   * after emitting `run:error`.
   */
  async run(request: StartRunRequest = {}): Promise<RunDetail> {
    if (this.started) {
      throw new Error(`Run ${this.id} has already been started`);
    }
    this.started = true;

    this.request = request;
    this.startedAt = this.now();
    this.emit({ type: "run:start", request });

    // For the duration of the run, the tool's own output becomes part of the
    // event stream rather than going straight to whatever logger this process
    // happens to have. That is what lets a client watching a remote run see
    // "Screenshot saved" and the retry warnings at all.
    this.attachToolLogSink();

    try {
      try {
        if (request.clearActual ?? true) {
          this.log("debug", `Cleaning output directory: ${this.outputDir}`);
          this.fileSystem.clearActual();
          this.fileSystem.clearDiff();
        }

        const pluginTasks = await this.discover(request);

        if (!this.controller.signal.aborted) {
          await this.execute(pluginTasks);
        }
      } catch (error) {
        this.error = error;
        this.state = "failed";
        this.finishedAt = this.now();
        this.emit({ type: "run:error", error: toSerializedError(error) });
        throw error;
      }

      await this.collectDeleted();

      this.finishedAt = this.now();
      this.state = this.controller.signal.aborted ? "cancelled" : "completed";

      if (this.state === "cancelled") {
        this.emit({ type: "run:cancelled" });
      }

      const summary = this.getSummary();
      this.emit({ type: "run:complete", summary });

      return this.getDetail();
    } finally {
      this.detachToolLogSink();
    }
  }

  /**
   * Route `ScreenshotTool`'s log output through this run's events.
   *
   * Guarded rather than called outright: tests inject minimal stand-ins for the
   * tool, and a fake without the method should not fail a run.
   */
  private attachToolLogSink(): void {
    this.screenshotTool.setLogSink?.((level, message, ...args) => {
      this.log(level, message, ...args);
    });
  }

  private detachToolLogSink(): void {
    this.screenshotTool.setLogSink?.(null);
  }

  private async discover(
    request: StartRunRequest,
  ): Promise<{ plugin: RunnablePlugin; tasks: PluginTask[] }[]> {
    this.state = "discovering";

    const wanted = request.plugins ? new Set(request.plugins) : undefined;
    const plugins = wanted
      ? this.plugins.filter((plugin) => wanted.has(plugin.name))
      : this.plugins;

    this.emit({
      type: "discover:start",
      plugins: plugins.map((plugin) => plugin.name),
    });

    const pluginTasks = await Promise.all(
      plugins.map(async (plugin) => {
        this.log("debug", `Discovering tasks for plugin: ${plugin.name}`);
        const tasks = await plugin.discover(this.screenshotTool);
        this.emit({
          type: "discover:plugin",
          plugin: plugin.name,
          taskCount: tasks.length,
        });
        return { plugin, tasks };
      }),
    );

    const targets: Target[] = pluginTasks.flatMap(({ plugin, tasks }) =>
      tasks.map((task) => ({
        id: task.id,
        url: task.url,
        plugin: plugin.name,
      })),
    );

    this.emit({
      type: "discover:complete",
      targets,
      totalTasks: targets.length,
    });

    if (request.filter === undefined && request.taskIds === undefined) {
      return pluginTasks;
    }

    const applied: { plugin: string; before: number; after: number }[] = [];

    for (const entry of pluginTasks) {
      const before = entry.tasks.length;
      let tasks = entry.tasks;

      if (request.filter !== undefined) {
        tasks = filterTasks(tasks, request.filter);
      }
      if (request.taskIds !== undefined) {
        tasks = selectTasks(tasks, request.taskIds);
      }

      entry.tasks = tasks;
      applied.push({ plugin: entry.plugin.name, before, after: tasks.length });
    }

    this.emit({
      type: "filter:applied",
      filter: request.filter,
      taskIds: request.taskIds,
      plugins: applied,
    });

    return pluginTasks;
  }

  private async execute(
    pluginTasks: { plugin: RunnablePlugin; tasks: PluginTask[] }[],
  ): Promise<void> {
    this.state = "running";

    for (const { plugin, tasks } of pluginTasks) {
      if (tasks.length === 0) {
        continue;
      }

      if (this.controller.signal.aborted) {
        return;
      }

      this.anyTasksRan = true;
      let pluginHasFailure = false;

      for (const task of tasks) {
        this.taskRecords.set(task.id, {
          id: task.id,
          url: task.url,
          plugin: plugin.name,
          status: "pending",
        });
      }

      this.emit({
        type: "plugin:start",
        plugin: plugin.name,
        taskCount: tasks.length,
      });

      this.log(
        "debug",
        `Processing ${tasks.length} tasks with concurrency ${this.screenshotTool.concurrency}`,
      );

      let completedTasks = 0;
      const pageContexts = new Map<number, unknown>();

      const results = await mapWithConcurrency(
        this.screenshotTool.concurrency,
        tasks,
        async (task, workerIndex) => {
          if (this.controller.signal.aborted) {
            return undefined;
          }

          const page = this.screenshotTool.getPageFromPool(workerIndex);

          if (!pageContexts.has(workerIndex) && plugin.initPage) {
            pageContexts.set(
              workerIndex,
              await plugin.initPage(page, this.screenshotTool),
            );
          }
          const context = pageContexts.get(workerIndex);

          const record = this.taskRecords.get(task.id);
          if (record) {
            record.status = "running";
          }

          this.emit({
            type: "task:start",
            plugin: plugin.name,
            taskId: task.id,
            url: task.url,
          });

          const taskStart = this.now();
          const result = await plugin.execute(
            task,
            page,
            this.screenshotTool,
            context,
          );
          const durationMs = this.now() - taskStart;

          completedTasks++;

          const failed = didScreenshotFail(result);
          const status = toTaskStatus(result);
          const typedResult = result as PluginCaptureResult | undefined;

          if (record) {
            record.status = status;
            record.durationMs = durationMs;
            record.result = typedResult;
          }

          if (failed) {
            pluginHasFailure = true;
            this.failures.push({
              taskId: task.id,
              taskUrl: task.url,
              result: typedResult ?? {},
              pluginName: plugin.name,
            });
          }

          this.emit({
            type: "task:complete",
            plugin: plugin.name,
            taskId: task.id,
            url: task.url,
            status,
            completed: completedTasks,
            total: tasks.length,
            durationMs,
            result: typedResult,
          });

          return result;
        },
      );

      this.emit({
        type: "plugin:complete",
        plugin: plugin.name,
        resultCount: results.length,
        failed: pluginHasFailure,
      });
    }
  }

  private async collectDeleted(): Promise<void> {
    if (!this.anyTasksRan) {
      return;
    }

    try {
      this.deletedScreenshots = await getDeletedScreenshots(this.outputDir);
    } catch (error) {
      this.log("warn", "Could not check for deleted screenshots:", error);
    }
  }
}

export type { TaskRecord };
