import { glob } from "node:fs/promises";
import path from "node:path";
import type { PluginTask } from "@cappa/core";
import {
  type FailedScreenshot,
  mapWithConcurrency,
  ScreenshotFileSystem,
  ScreenshotTool,
} from "@cappa/core";
import { getLogger } from "@cappa/logger";
import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../features/config";
import { groupScreenshots } from "../utils/groupScreenshots";

type PluginCaptureResult = {
  success?: boolean;
  skipped?: boolean;
  isNew?: boolean;
  error?: unknown;
  filepath?: string;
  storyId?: string;
  storyName?: string;
  [key: string]: unknown;
};

type FailedScreenshotInfo = {
  taskId: string;
  taskUrl: string;
  result: PluginCaptureResult;
  pluginName: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const didScreenshotFail = (result: unknown): boolean => {
  if (!isObject(result)) {
    return false;
  }

  if ("error" in result && result.error != null) {
    return true;
  }

  if ("success" in result) {
    const { success } = result as PluginCaptureResult;
    if (success === false) {
      return true;
    }
  }

  if ("filepath" in result) {
    const { filepath, skipped } = result as PluginCaptureResult;
    if (!filepath && skipped !== true) {
      return true;
    }
  }

  return false;
};

async function executeOnFailCallback(
  config: Awaited<ReturnType<typeof getConfig>>,
  filter?: string,
): Promise<void> {
  const logger = getLogger();

  if (!config.onFail) {
    return;
  }

  const actualScreenshotsPromise = glob(
    path.resolve(config.outputDir, "actual", "**/*.png"),
  );
  const expectedScreenshotsPromise = glob(
    path.resolve(config.outputDir, "expected", "**/*.png"),
  );
  const diffScreenshotsPromise = glob(
    path.resolve(config.outputDir, "diff", "**/*.png"),
  );

  const [actualScreenshots, expectedScreenshots, diffScreenshots] =
    await Promise.all([
      actualScreenshotsPromise,
      expectedScreenshotsPromise,
      diffScreenshotsPromise,
    ]);

  const groupedScreenshots = await groupScreenshots(
    await Array.fromAsync(actualScreenshots),
    await Array.fromAsync(expectedScreenshots),
    await Array.fromAsync(diffScreenshots),
    config.outputDir,
    { filter },
  );

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
  failedScreenshots: FailedScreenshotInfo[],
  deletedScreenshots: string[],
): string {
  const total = failedScreenshots.length + deletedScreenshots.length;
  if (total === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`${chalk.red(`Total failures: ${total}`)}\n`);

  // Group by plugin
  const byPlugin = new Map<string, FailedScreenshotInfo[]>();
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

export async function getDeletedScreenshots(
  outputDir: string,
  filter?: string,
): Promise<string[]> {
  const actualDir = path.resolve(outputDir, "actual");
  const expectedDir = path.resolve(outputDir, "expected");

  const [actualFiles, expectedFiles] = await Promise.all([
    Array.fromAsync(glob(path.join(actualDir, "**/*.png"))),
    Array.fromAsync(glob(path.join(expectedDir, "**/*.png"))),
  ]);

  const actualRelative = new Set(
    actualFiles.map((p) => path.relative(actualDir, p)),
  );

  return expectedFiles
    .map((p) => path.relative(expectedDir, p))
    .filter((rel) => {
      if (actualRelative.has(rel)) return false;
      // When a filter is active, only report screenshots within the filter's
      // scope as deleted — screenshots outside the filter were intentionally
      // not captured.
      if (filter) {
        const name = rel.replace(/\.png$/, "");
        if (!path.matchesGlob(name, filter)) return false;
      }
      return true;
    });
}

type CaptureOptions = {
  ci?: boolean;
  filter?: string;
};

export function filterTasks(tasks: PluginTask[], filter: string): PluginTask[] {
  return tasks.filter((task) => path.matchesGlob(task.id, filter));
}

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

const runCapture = async (options: CaptureOptions = {}): Promise<void> => {
  const logger = getLogger();
  const captureStart = performance.now();

  const config = await getConfig();

  logger.debug(`Cleaning output directory: ${config.outputDir}`);
  const fileSystem = new ScreenshotFileSystem(config.outputDir);
  fileSystem.clearActual();
  fileSystem.clearDiff();

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

  const unregisterSignalHandlers = registerSignalHandlers(screenshotTool);

  let captureError: unknown;
  let hasScreenshotFailure = false;
  let anyTasksRan = false;
  const failedScreenshots: FailedScreenshotInfo[] = [];

  try {
    await screenshotTool.init();

    const plugins = (config.plugins || []) as any[];

    // Phase 1: Discover all tasks in parallel across plugins
    const pluginTasks = await Promise.all(
      plugins.map(async (plugin) => {
        logger.debug(`Discovering tasks for plugin: ${plugin.name}`);
        const tasks = await plugin.discover(screenshotTool);
        logger.info(`Found ${tasks.length} tasks for ${plugin.name}`);
        return { plugin, tasks };
      }),
    );

    if (options.filter) {
      logger.box({
        title: "Filter Active",
        message: `Only capturing tasks matching: ${chalk.cyan(options.filter)}`,
      });

      for (const entry of pluginTasks) {
        const before = entry.tasks.length;
        entry.tasks = filterTasks(entry.tasks, options.filter);
        logger.info(
          `${entry.plugin.name}: ${entry.tasks.length}/${before} tasks match filter`,
        );
      }
    }

    for (const { plugin, tasks } of pluginTasks) {
      if (tasks.length === 0) {
        continue;
      }

      anyTasksRan = true;
      let pluginHasFailure = false;

      logger.debug(
        `Processing ${tasks.length} tasks with concurrency ${screenshotTool.concurrency}`,
      );

      let completedTasks = 0;
      const pageContexts = new Map<number, any>();

      const allResults = await mapWithConcurrency(
        screenshotTool.concurrency,
        tasks,
        async (task: any, workerIndex) => {
          const page = screenshotTool.getPageFromPool(workerIndex);

          if (!pageContexts.has(workerIndex) && plugin.initPage) {
            pageContexts.set(
              workerIndex,
              await plugin.initPage(page, screenshotTool),
            );
          }
          const context = pageContexts.get(workerIndex);

          logger.debug(`Executing task: ${task.id}`);
          const result = await plugin.execute(
            task,
            page,
            screenshotTool,
            context,
          );

          completedTasks++;
          logger.info(formatProgress(completedTasks, tasks.length, task.id));

          if (didScreenshotFail(result)) {
            pluginHasFailure = true;
            hasScreenshotFailure = true;
            failedScreenshots.push({
              taskId: task.id,
              taskUrl: task.url,
              result: result as PluginCaptureResult,
              pluginName: plugin.name,
            });
          }

          return result;
        },
      );

      const results = allResults;
      if (pluginHasFailure) {
        logger.error(
          `Plugin ${plugin.name} completed with failures: ${results.length} results`,
        );
      } else {
        logger.success(
          `Plugin ${plugin.name} completed: ${results.length} results`,
        );
      }
    }
  } catch (error) {
    logger.error("Error during plugin execution:", error);
    captureError = error;
    throw error;
  } finally {
    unregisterSignalHandlers();
    await screenshotTool.close();
  }

  let deletedScreenshots: string[] = [];
  if (anyTasksRan) {
    try {
      deletedScreenshots = await getDeletedScreenshots(
        config.outputDir,
        options.filter,
      );
      if (deletedScreenshots.length > 0) {
        hasScreenshotFailure = true;
      }
    } catch (err) {
      logger.warn("Could not check for deleted screenshots:", err);
    }
  }

  const isCi = options.ci || process.env.CI === "true";

  if (!captureError && isCi) {
    await executeOnFailCallback(config, options.filter);
  }

  const duration = formatDuration(performance.now() - captureStart);

  if (hasScreenshotFailure) {
    const reportMessage = generateFailureReportMessage(
      failedScreenshots,
      deletedScreenshots,
    );
    logger.box({
      title: "Failed Screenshots",
      message: reportMessage,
    });
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
    .action(async (options: CaptureOptions) => {
      await runCapture(options);
    });
};
