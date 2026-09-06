import path from "node:path";
import { getConfig } from "@cappa/config";
import type {
  FailedScreenshot,
  RunEvent,
  RunnablePlugin,
  Screenshot,
  TaskFailure,
} from "@cappa/core";
import {
  CaptureRunner,
  collectScreenshots,
  ScreenshotFileSystem,
  ScreenshotTool,
} from "@cappa/core";
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

export function registerSignalHandlers(
  screenshotTool: ScreenshotTool,
  exitFn: (code: number) => void = process.exit,
): () => void {
  const handleSignal = async () => {
    await screenshotTool.close();
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

const runCapture = async (options: CaptureOptions = {}): Promise<void> => {
  const logger = getLogger();
  const captureStart = performance.now();

  const config = await getConfig();

  const screenshotTool = new ScreenshotTool({
    outputDir: config.outputDir,
    diff: config.diff,
    retries: config.retries,
    concurrency: config.concurrency,
    logConsoleEvents: config.logConsoleEvents,
    fullPage: config.screenshot?.fullPage ?? true,
    viewport: config.screenshot?.viewport ?? { width: 1920, height: 1080 },
    connectionTimeout: config.connectionTimeout,
  });

  const runner = new CaptureRunner({
    screenshotTool,
    plugins: (config.plugins || []) as unknown as RunnablePlugin[],
    outputDir: config.outputDir,
    fileSystem: new ScreenshotFileSystem(config.outputDir),
  });

  const unsubscribe = runner.on(renderRunEvent);
  const unregisterSignalHandlers = registerSignalHandlers(screenshotTool);

  let captureError: unknown;

  try {
    await screenshotTool.init();

    await runner.run({
      filter: options.filter,
      clearActual: true,
    });
  } catch (error) {
    captureError = error;
    throw error;
  } finally {
    unregisterSignalHandlers();
    unsubscribe();
    await screenshotTool.close();
  }

  const { failures, deletedScreenshots } = runner.getDetail();
  const hasScreenshotFailure = runner.hasScreenshotFailure;

  const isCi = options.ci || process.env.CI === "true";

  // Read back the diff metadata sidecars once and reuse them for both the
  // onFail callback and the changed-screenshot report below.
  let groupedScreenshots: Screenshot[] = [];
  if (!captureError && (isCi || hasScreenshotFailure)) {
    try {
      groupedScreenshots = await collectScreenshots(config.outputDir);
    } catch (err) {
      logger.warn("Could not collect screenshot results:", err);
    }
  }

  if (!captureError && isCi) {
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
