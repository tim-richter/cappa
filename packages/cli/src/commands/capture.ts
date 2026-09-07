import path from "node:path";
import { configToEngineOptions, getConfig } from "@cappa/config";
import type {
  CaptureEngine,
  FailedScreenshot,
  RunDetail,
  RunEvent,
  Screenshot,
  SerializedError,
  TaskFailure,
  WatchEvent,
} from "@cappa/core";
import { LocalEngine } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import chalk from "chalk";
import type { Command } from "commander";
import {
  DEFAULT_MAX_REGIONS,
  describeChanges,
  type ReportableScreenshot,
} from "../utils/describeChanges";
import { parseMaxRegions } from "../utils/parseMaxRegions";
import {
  type CaptureCliEngine,
  connectToServer,
  isRunInProgress,
  RemoteServerError,
} from "../utils/remoteEngine";
import { resolveToken } from "../utils/server";

async function executeOnFailCallback(
  config: Awaited<ReturnType<typeof getConfig>>,
  groupedScreenshots: ReportableScreenshot[],
  { remote = false }: { remote?: boolean } = {},
): Promise<void> {
  const logger = getLogger();

  if (!config.onFail) {
    return;
  }

  // The screenshots are on the host, not here, so resolving them against the
  // local `outputDir` would hand the callback paths to files that do not exist.
  // An upload of nothing is the one outcome worth ruling out, so the absolute
  // fields are left undefined and the callback is told why — once, not per
  // screenshot.
  if (remote && groupedScreenshots.length > 0) {
    logger.warn(
      "Capturing against a remote server: onFail receives relative paths only, " +
        "because the screenshot files live on the host rather than this machine.",
    );
  }

  const resolveLocal = (relative: string | undefined) =>
    !remote && relative ? path.resolve(config.outputDir, relative) : undefined;

  // `interpretation` arrives opaque from a remote host, and `FailedScreenshot`
  // types it as the diff engine's `InterpretResult`. The runtime shape is
  // whatever the host's diff engine produced either way; a consumer that reads
  // it should narrow, exactly as the changed-screenshot reporter does.
  const failingScreenshots = (groupedScreenshots as Screenshot[])
    .filter((screenshot) => screenshot.category !== "passed")
    .map(
      (screenshot): FailedScreenshot => ({
        ...screenshot,
        absoluteActualPath: resolveLocal(
          "actualPath" in screenshot ? screenshot.actualPath : undefined,
        ),
        absoluteExpectedPath: resolveLocal(
          "expectedPath" in screenshot ? screenshot.expectedPath : undefined,
        ),
        absoluteDiffPath: resolveLocal(
          "diffPath" in screenshot ? screenshot.diffPath : undefined,
        ),
      }),
    );

  if (failingScreenshots.length > 0) {
    logger.debug(
      `Executing onFail callback with ${failingScreenshots.length} failing screenshot(s)`,
    );

    try {
      await config.onFail(failingScreenshots);
    } catch (error) {
      logger.error("Error executing onFail callback:", error);
    }
  }
}

export function formatProgress(
  completed: number,
  total: number,
  taskId: string,
): string {
  return `[${completed}/${total}] captured ${taskId}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function generateFailureReportMessage(
  failedScreenshots: TaskFailure[],
  deletedScreenshots: string[],
): string {
  const total = failedScreenshots.length + deletedScreenshots.length;
  if (total === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`${chalk.red(`Total failures: ${total}`)}\n`);

  // Group by plugin
  const byPlugin = new Map<string, TaskFailure[]>();
  for (const failed of failedScreenshots) {
    const pluginFailures = byPlugin.get(failed.pluginName);
    if (pluginFailures) {
      pluginFailures.push(failed);
    } else {
      byPlugin.set(failed.pluginName, [failed]);
    }
  }

  for (const [pluginName, failures] of byPlugin.entries()) {
    lines.push(`\n${chalk.bold(`Plugin: ${pluginName}`)}`);

    for (const failed of failures) {
      lines.push(`\n  ${chalk.dim("Task ID:")} ${failed.taskId}`);

      const result = failed.result;
      if (result.storyName) {
        lines.push(`  ${chalk.dim("Story:")} ${result.storyName}`);
      }
      if (result.error) {
        const errorMsg =
          typeof result.error === "string"
            ? result.error
            : result.error instanceof Error
              ? result.error.message
              : String(result.error);
        lines.push(`  ${chalk.red("Error:")} ${errorMsg}`);
      }
      if (result.success === false) {
        if (result.isNew) {
          lines.push(
            `  ${chalk.yellow("Status:")} New screenshot (no baseline — run 'cappa approve' to accept)`,
          );
        } else {
          lines.push(`  ${chalk.red("Status:")} Failed (comparison failed)`);
        }
      }
      if (!result.filepath && result.skipped !== true) {
        lines.push(`  ${chalk.red("Status:")} Failed (no filepath generated)`);
      }
    }
  }

  if (deletedScreenshots.length > 0) {
    lines.push(`\n${chalk.bold("Deleted baselines:")}`);
    for (const screenshotPath of deletedScreenshots) {
      lines.push(
        `  ${chalk.dim("Name:")} ${screenshotPath.replace(/\.png$/, "")}`,
      );
    }
  }

  return lines.join("\n");
}

type CaptureOptions = {
  ci?: boolean;
  filter?: string;
  maxRegions?: number;
  server?: string;
  token?: string;
  watch?: boolean;
};

/**
 * An engine that can watch the filesystem.
 *
 * Feature-detected rather than assumed: the watch methods are optional on
 * `CaptureEngine` because only an engine that can see the files is able to
 * offer them, and `--watch` has to say so plainly instead of failing on an
 * undefined call.
 */
export type WatchCapableEngine = CaptureCliEngine &
  Required<Pick<CaptureEngine, "startWatch" | "stopWatch" | "subscribeWatch">>;

export const supportsWatch = (
  engine: CaptureCliEngine,
): engine is WatchCapableEngine =>
  typeof engine.startWatch === "function" &&
  typeof engine.stopWatch === "function" &&
  typeof engine.subscribeWatch === "function";

/**
 * Close `closeable` and exit 130 on SIGINT/SIGTERM.
 *
 * Typed structurally rather than against a concrete class so it can be handed
 * whatever owns the browser — that is the engine now, and a remote engine
 * later, neither of which the CLI should have to special-case here.
 */
export function registerSignalHandlers(
  closeable: { close(): Promise<void> },
  exitFn: (code: number) => void = process.exit,
  onSignal?: () => Promise<void>,
): () => void {
  let handling = false;

  const handleSignal = async () => {
    // A second signal means the first teardown is taking too long — most likely
    // waiting on a remote run to acknowledge cancellation. Leave immediately
    // rather than making the user reach for `kill -9`, but say what that costs.
    if (handling) {
      getLogger().warn(
        "Interrupted again — exiting now. The remote run may still be going.",
      );
      exitFn(130);
      return;
    }
    handling = true;

    await onSignal?.();
    await closeable.close();
    exitFn(130);
  };

  // `on`, not `once`: a second Ctrl-C must reach the handler to force the exit.
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  return () => {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  };
}

/**
 * Render a runner event to the terminal.
 *
 * All terminal presentation lives here — the runner itself is silent — so the
 * server can consume the exact same event stream without inheriting CLI output.
 */
export function renderRunEvent(event: RunEvent): void {
  const logger = getLogger();

  switch (event.type) {
    case "log":
      logger[event.level](event.message, ...event.args);
      break;

    case "discover:plugin":
      logger.info(`Found ${event.taskCount} tasks for ${event.plugin}`);
      break;

    case "filter:applied": {
      if (event.filter === undefined) {
        break;
      }

      logger.box({
        title: "Filter Active",
        message: `Only capturing tasks matching: ${chalk.cyan(event.filter)}`,
      });

      for (const entry of event.plugins) {
        logger.info(
          `${entry.plugin}: ${entry.after}/${entry.before} tasks match filter`,
        );
      }
      break;
    }

    case "task:start":
      logger.debug(`Executing task: ${event.taskId}`);
      break;

    case "task:complete":
      logger.info(formatProgress(event.completed, event.total, event.taskId));
      break;

    case "plugin:complete":
      if (event.failed) {
        logger.error(
          `Plugin ${event.plugin} completed with failures: ${event.resultCount} results`,
        );
      } else {
        logger.success(
          `Plugin ${event.plugin} completed: ${event.resultCount} results`,
        );
      }
      break;

    case "run:error":
      logger.error("Error during plugin execution:", event.error.message);
      break;

    default:
      break;
  }
}

/**
 * One line for a settled batch of changes.
 *
 * Terse on purpose: this is the inner loop of somebody fixing a regression, and
 * a paragraph per save is noise. It still says *why* the iteration is the size
 * it is, because "3 tasks" and "everything" have very different causes.
 */
export function describeWatchChange(
  event: Extract<WatchEvent, { type: "watch:change" }>,
): string {
  const files =
    event.files.length === 1
      ? (event.files[0] ?? "")
      : `${event.files.length} files`;

  const what = (() => {
    switch (event.scope) {
      case "tasks": {
        const count = event.taskIds?.length ?? 0;
        return `${count} task${count === 1 ? "" : "s"}`;
      }
      case "plugins":
        return "every task of the affected plugin(s)";
      case "all":
        return "everything";
      default:
        return "nothing";
    }
  })();

  return `${chalk.cyan("↻")} ${what} · ${files} changed`;
}

/** The one-line result of a watch iteration. */
export function summarizeRunDetail(
  detail: RunDetail | undefined,
  duration: string,
): string {
  if (!detail) {
    return `Run finished in ${duration}`;
  }

  const failures = detail.failures.length + detail.deletedScreenshots.length;
  const captured = `${detail.completedTasks}/${detail.totalTasks} captured`;

  if (failures > 0) {
    return chalk.yellow(`${captured}, ${failures} to review — ${duration}`);
  }

  return chalk.green(`${captured}, all passing — ${duration}`);
}

/**
 * A watch iteration's run output.
 *
 * Only what changed: a passing task in watch mode is the absence of news, and
 * printing every one of them buries the two lines that matter.
 */
export function renderWatchRunEvent(event: RunEvent): void {
  const logger = getLogger();

  switch (event.type) {
    case "log":
      if (event.level === "warn" || event.level === "error") {
        logger[event.level](event.message, ...event.args);
      }
      break;

    case "task:complete":
      if (event.status !== "passed" && event.status !== "skipped") {
        logger.info(`  ${chalk.dim(event.status)} ${event.taskId}`);
      }
      break;

    case "run:error":
      logger.error("Error during plugin execution:", event.error.message);
      break;

    default:
      break;
  }
}

/**
 * Stop watching and exit 0 on SIGINT/SIGTERM.
 *
 * Zero, not 130: quitting a watch session is how it is meant to end, and a
 * non-zero exit would make `cappa capture --watch` fail every shell script and
 * task runner that wraps it.
 */
export function registerWatchSignalHandlers(
  stop: () => Promise<void>,
  exitFn: (code: number) => void = process.exit,
): () => void {
  let handling = false;

  const handleSignal = async () => {
    // A second signal while the first teardown is still going: leave now rather
    // than making the user reach for `kill -9`.
    if (handling) {
      exitFn(0);
      return;
    }
    handling = true;

    getLogger().info("Stopping watch…");
    await stop();
    exitFn(0);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  return () => {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  };
}

export type WatchCaptureOptions = {
  filter?: string;
};

/**
 * Watch for changes and re-capture, until interrupted.
 *
 * Resolves only when a signal stops the session, so the caller keeps the
 * process — and the warm browser — alive for as long as the user is editing.
 */
export async function watchCapture(
  engine: WatchCapableEngine,
  options: WatchCaptureOptions = {},
  exitFn: (code: number) => void = process.exit,
): Promise<void> {
  const logger = getLogger();

  let release: (() => void) | undefined;
  const finished = new Promise<void>((resolve) => {
    release = resolve;
  });

  const stop = async () => {
    try {
      await engine.stopWatch();
      await engine.close();
    } finally {
      release?.();
    }
  };

  const unregisterSignalHandlers = registerWatchSignalHandlers(stop, exitFn);

  // Iterations are rendered one at a time: the session starts the next run only
  // after the previous one ends, and the output should read the same way.
  let rendering: Promise<void> = Promise.resolve();

  const unsubscribe = engine.subscribeWatch((event) => {
    switch (event.type) {
      case "watch:start":
        logger.info(
          `Watching ${event.paths.join(", ")}${
            event.filter ? ` (filter: ${event.filter})` : ""
          } — press Ctrl-C to stop.`,
        );
        break;

      case "watch:change": {
        logger.info(describeWatchChange(event));

        if (event.error) {
          logger.warn(`Could not start a run: ${event.error}`);
          break;
        }

        const runId = event.runId;
        if (runId) {
          rendering = rendering.then(() =>
            renderWatchIteration(engine, runId).catch((error) => {
              logger.error("Error rendering the run:", error);
            }),
          );
        }
        break;
      }

      default:
        break;
    }
  });

  try {
    await engine.startWatch({ filter: options.filter });
    await finished;
  } finally {
    unsubscribe();
    unregisterSignalHandlers();
  }
}

async function renderWatchIteration(
  engine: WatchCapableEngine,
  runId: string,
): Promise<void> {
  const logger = getLogger();
  const start = performance.now();

  await renderRunToCompletion(engine, runId, renderWatchRunEvent);

  const detail = await engine.getRun(runId);
  const duration = formatDuration(performance.now() - start);

  // A failing screenshot in watch mode is the thing being worked on, not a
  // reason to quit: it is reported and the session keeps going.
  logger.info(summarizeRunDetail(detail, duration));
}

/**
 * Rebuild a throwable error from the run's serialized one.
 *
 * The engine flattens the error a plugin threw so it can cross a network
 * boundary, but `capture` has always failed by letting that error escape — the
 * stack is the only debugging signal for a plugin that blew up. Reinstating
 * name, message and stack keeps that output intact.
 */
function toThrowable(error: SerializedError): Error {
  const rebuilt = new Error(error.message);
  rebuilt.name = error.name;
  if (error.stack) {
    rebuilt.stack = error.stack;
  }
  return rebuilt;
}

/**
 * Subscribe to a run, render every event, and resolve when it terminates.
 *
 * Events buffered between `startRun` and this subscription are replayed
 * synchronously, so nothing emitted during start-up is lost.
 */
async function renderRunToCompletion(
  engine: CaptureCliEngine,
  runId: string,
  onEvent: (event: RunEvent) => void,
): Promise<void> {
  let unsubscribe: (() => void) | undefined;

  try {
    await new Promise<void>((resolve) => {
      unsubscribe = engine.subscribeRun(runId, (event) => {
        onEvent(event);

        if (event.type === "run:complete" || event.type === "run:error") {
          resolve();
        }
      });
    });
  } finally {
    unsubscribe?.();
  }
}

/** How long a `SIGINT` waits for a remote host to acknowledge cancellation. */
const REMOTE_CANCEL_TIMEOUT_MS = 5000;

export const runCapture = async (
  options: CaptureOptions = {},
): Promise<void> => {
  const logger = getLogger();
  const captureStart = performance.now();

  // Checked before the config is even loaded: a conflicting invocation is a
  // mistake to name, not something to half-do.
  if (options.watch && options.server) {
    logger.error(
      "--watch cannot be combined with --server: a remote host cannot see the files on this machine.",
    );
    process.exit(1);
    return;
  }

  if (options.watch && options.ci) {
    logger.error(
      "--watch cannot be combined with --ci: CI captures once and exits.",
    );
    process.exit(1);
    return;
  }

  const config = await getConfig();

  const remote = options.server !== undefined;

  let engine: CaptureCliEngine;

  // `--token` authenticates against a host. Without one it does nothing, and
  // silently ignoring it is how a user ends up believing a capture was
  // authenticated when it was never remote in the first place.
  if (options.token && !options.server) {
    logger.error("--token only applies with --server.");
    process.exit(1);
    return;
  }

  if (options.server) {
    // The host loads its own `cappa.config.ts`: plugins are live closures and
    // cannot be sent anywhere. Every capture setting in the local config —
    // plugins, outputDir, diff, concurrency — belongs to the host instead, and
    // a user who does not know that will wonder why theirs had no effect.
    logger.info(
      `Capturing on ${options.server}, which uses its own cappa.config.ts. Local capture settings do not apply.`,
    );

    try {
      engine = await connectToServer({
        server: options.server,
        token: resolveToken(options.token),
      });
    } catch (error) {
      if (error instanceof RemoteServerError) {
        logger.error(error.message);
        process.exit(1);
        return;
      }
      throw error;
    }
  } else {
    engine = new LocalEngine({
      ...configToEngineOptions(config),
      // A one-shot capture has no next run to keep a browser warm for, so hand
      // it back as soon as the run ends rather than leaving an idle Chromium
      // around for the rest of the process's life.
      //
      // Watch mode has the opposite need. Its session holds an eviction lease
      // once started, but the gap between the first run finishing and the
      // watcher starting is not covered by it — with a zero timeout the browser
      // would be gone before the first save, which is exactly the cost watch
      // mode exists to avoid.
      browserIdleTimeoutMs: options.watch
        ? config.review?.browserIdleTimeout
        : 0,
    });
  }

  const isCi = options.ci || process.env.CI === "true";

  let detail: RunDetail | undefined;
  // Read the diff metadata sidecars once and reuse them for both the onFail
  // callback and the changed-screenshot report below.
  let groupedScreenshots: ReportableScreenshot[] = [];
  let activeRunId: string | undefined;
  let runCompleted: Promise<void> | undefined;

  // Ctrl-C locally does not stop a run on another machine, so ask the host to
  // cancel and wait for it to say it has.
  //
  // Waiting for the *terminal event* rather than for `cancelRun` to return is
  // the point: closing the engine aborts the event stream, so returning early
  // would tear down the connection while the host is still winding the run
  // down — and the CLI would never learn whether it stopped. Bounded, because
  // a wedged host must not hold the terminal hostage; a second signal skips
  // the wait entirely.
  const cancelRemoteRun = async () => {
    if (!remote || !activeRunId) {
      return;
    }

    logger.info("Cancelling the remote run…");

    try {
      await engine.cancelRun(activeRunId);

      await Promise.race([
        runCompleted?.catch(() => undefined) ?? Promise.resolve(),
        new Promise((resolve) => {
          setTimeout(resolve, REMOTE_CANCEL_TIMEOUT_MS).unref?.();
        }),
      ]);
    } catch (error) {
      logger.debug("Error cancelling the remote run:", error);
    }
  };

  const unregisterSignalHandlers = registerSignalHandlers(
    engine,
    process.exit,
    cancelRemoteRun,
  );

  try {
    let run: Awaited<ReturnType<CaptureCliEngine["startRun"]>>;

    try {
      run = await engine.startRun({
        filter: options.filter,
        clearActual: true,
      });
    } catch (error) {
      // One run at a time is the host's deliberate design, not a fault, so it
      // gets a sentence rather than a stack trace.
      if (isRunInProgress(error)) {
        const active = error.activeRunId ? ` (run ${error.activeRunId})` : "";
        logger.error(
          `${options.server} is already running a capture${active}. Wait for it to finish, or cancel it, and try again.`,
        );
        process.exit(1);
        return;
      }
      throw error;
    }

    activeRunId = run.id;

    runCompleted = renderRunToCompletion(engine, run.id, renderRunEvent);
    await runCompleted;

    detail = await engine.getRun(run.id);

    const failedDuringRun = detail?.error !== undefined;
    const hasFailure =
      (detail?.failures.length ?? 0) > 0 ||
      (detail?.deletedScreenshots.length ?? 0) > 0;

    if (!failedDuringRun && (isCi || hasFailure)) {
      try {
        groupedScreenshots = await engine.listScreenshots();
      } catch (err) {
        logger.warn("Could not collect screenshot results:", err);
      }
    }
  } finally {
    unregisterSignalHandlers();
    // Watch mode keeps this engine — and its warm browser — for the rest of the
    // session; `watchCapture` closes it when the user stops.
    if (!options.watch) {
      await engine.close();
    }
  }

  // A plugin that threw has always escaped this command rather than being
  // summarised, and the browser is closed by the time it does.
  if (detail?.error) {
    throw toThrowable(detail.error);
  }

  const failures = detail?.failures ?? [];
  const deletedScreenshots = detail?.deletedScreenshots ?? [];
  const hasScreenshotFailure =
    failures.length > 0 || deletedScreenshots.length > 0;

  if (isCi) {
    await executeOnFailCallback(config, groupedScreenshots, { remote });
  }

  const duration = formatDuration(performance.now() - captureStart);

  if (hasScreenshotFailure) {
    const reportMessage = generateFailureReportMessage(
      failures,
      deletedScreenshots,
    );
    logger.box({
      title: "Failed Screenshots",
      message: reportMessage,
    });

    // Surface the diff stats and, when `diff.interpret` is enabled, what
    // changed and where — this is often the only debugging signal on CI.
    const changeLines = describeChanges(groupedScreenshots, {
      maxRegions: options.maxRegions,
    });
    if (changeLines.length > 0) {
      logger.box({
        title: "Changed Screenshots",
        message: changeLines.join("\n"),
      });
    }

    if (options.watch) {
      // Not an exit: a failing screenshot is what the user is here to fix.
      logger.warn(`One or more screenshots failed in ${duration}.`);
    } else {
      logger.error(
        `One or more screenshots failed in ${duration}. See report above for details.`,
      );
      process.exit(1);
    }
  } else {
    logger.success(`All plugins completed successfully in ${duration}`);
  }

  if (options.watch) {
    if (!supportsWatch(engine)) {
      logger.error("This engine cannot watch files.");
      await engine.close();
      process.exit(1);
      return;
    }

    await watchCapture(engine, { filter: options.filter });
  }
};

export const registerCaptureCommand = (program: Command): void => {
  program
    .command("capture")
    .description("Capture screenshots")
    .option("--ci", "run capture in CI mode and execute onFail callback")
    .option(
      "-f, --filter <pattern>",
      "only capture tasks whose id matches the given glob pattern",
    )
    .option(
      "--max-regions <count>",
      "maximum number of interpreted diff regions listed per changed screenshot (0 to disable)",
      parseMaxRegions,
      DEFAULT_MAX_REGIONS,
    )
    .option(
      "--server <url>",
      "capture against a `cappa serve` host instead of a local browser",
    )
    .option(
      "--token <token>",
      "access token for --server (falls back to CAPPA_TOKEN)",
    )
    .option(
      "-w, --watch",
      "capture once, then re-capture affected tasks whenever files change",
    )
    .action(async (options: CaptureOptions) => {
      await runCapture(options);
    });
};
