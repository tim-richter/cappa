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
} from "@cappa/core";
import { LocalEngine } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import chalk from "chalk";
import type { Command } from "commander";
import { DEFAULT_MAX_REGIONS, describeChanges } from "../utils/describeChanges";
import { parseMaxRegions } from "../utils/parseMaxRegions";

async function executeOnFailCallback(
  config: Awaited<ReturnType<typeof getConfig>>,
  groupedScreenshots: Screenshot[],
): Promise<void> {
  const logger = getLogger();

  if (!config.onFail) {
    return;
  }

  const failingScreenshots: FailedScreenshot[] = groupedScreenshots
    .filter((screenshot) => screenshot.category !== "passed")
    .map((screenshot) => ({
      ...screenshot,
      absoluteActualPath:
        "actualPath" in screenshot && screenshot.actualPath
          ? path.resolve(config.outputDir, screenshot.actualPath)
          : undefined,
      absoluteExpectedPath:
        "expectedPath" in screenshot && screenshot.expectedPath
          ? path.resolve(config.outputDir, screenshot.expectedPath)
          : undefined,
      absoluteDiffPath:
        "diffPath" in screenshot && screenshot.diffPath
          ? path.resolve(config.outputDir, screenshot.diffPath)
          : undefined,
    }));

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
};

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
): () => void {
  const handleSignal = async () => {
    await closeable.close();
    exitFn(130);
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

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
  engine: CaptureEngine,
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

export const runCapture = async (
  options: CaptureOptions = {},
): Promise<void> => {
  const logger = getLogger();
  const captureStart = performance.now();

  const config = await getConfig();

  const engine = new LocalEngine({
    ...configToEngineOptions(config),
    // A one-shot capture has no next run to keep a browser warm for, so hand it
    // back as soon as the run ends rather than leaving an idle Chromium around
    // for the rest of the process's life.
    browserIdleTimeoutMs: 0,
  });

  const unregisterSignalHandlers = registerSignalHandlers(engine);

  const isCi = options.ci || process.env.CI === "true";

  let detail: RunDetail | undefined;
  // Read the diff metadata sidecars once and reuse them for both the onFail
  // callback and the changed-screenshot report below.
  let groupedScreenshots: Screenshot[] = [];

  try {
    const run = await engine.startRun({
      filter: options.filter,
      clearActual: true,
    });

    await renderRunToCompletion(engine, run.id, renderRunEvent);

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
    await engine.close();
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
    await executeOnFailCallback(config, groupedScreenshots);
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

    logger.error(
      `One or more screenshots failed in ${duration}. See report above for details.`,
    );
    process.exit(1);
  } else {
    logger.success(`All plugins completed successfully in ${duration}`);
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
    .action(async (options: CaptureOptions) => {
      await runCapture(options);
    });
};
