import { glob } from "node:fs/promises";
import path from "node:path";
import {
  type FailedScreenshot,
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

const didScreenshotFail = (result: unknown): boolean => {
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

  const groupedScreenshots = groupScreenshots(
    await Array.fromAsync(actualScreenshots),
    await Array.fromAsync(expectedScreenshots),
    await Array.fromAsync(diffScreenshots),
    config.outputDir,
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

function generateFailureReportMessage(
  failedScreenshots: FailedScreenshotInfo[],
): string {
  if (failedScreenshots.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`${chalk.red(`Total failures: ${failedScreenshots.length}`)}\n`);

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
        lines.push(`  ${chalk.red("Status:")} Failed (success: false)`);
      }
      if (!result.filepath && result.skipped !== true) {
        lines.push(`  ${chalk.red("Status:")} Failed (no filepath generated)`);
      }
    }
  }

  return lines.join("\n");
}

type CaptureOptions = {
  ci?: boolean;
};

const runCapture = async (options: CaptureOptions = {}): Promise<void> => {
  const logger = getLogger();

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
  });

  let captureError: unknown;
  let hasScreenshotFailure = false;
  const failedScreenshots: FailedScreenshotInfo[] = [];

  try {
    await screenshotTool.init();

    for (const plugin of (config.plugins || []) as any[]) {
      logger.debug(`Discovering tasks for plugin: ${plugin.name}`);

      // Phase 1: Discover all tasks
      const tasks = await plugin.discover(screenshotTool);
      logger.info(`Found ${tasks.length} tasks for ${plugin.name}`);

      if (tasks.length === 0) {
        continue;
      }

      let pluginHasFailure = false;
      // Phase 2: Execute tasks in parallel chunks
      // Use the minimum of concurrency and actual number of tasks to avoid empty chunks
      const effectiveConcurrency = Math.min(
        tasks.length,
        screenshotTool.concurrency,
      );
      const chunkSize = Math.ceil(tasks.length / effectiveConcurrency);
      const chunks: (typeof tasks)[] = [];

      for (let i = 0; i < tasks.length; i += chunkSize) {
        chunks.push(tasks.slice(i, i + chunkSize));
      }

      logger.debug(
        `Processing ${tasks.length} tasks with ${effectiveConcurrency} contexts in ${chunks.length} chunks`,
      );

      const allResults = await Promise.all(
        chunks.map(async (chunk, chunkIndex) => {
          const page = screenshotTool.getPageFromPool(chunkIndex);
          const chunkResults: Array<{
            result: PluginCaptureResult;
            task: (typeof tasks)[number];
          }> = [];
          let context: any;

          // Initialize page if plugin has initPage method
          if (plugin.initPage) {
            context = await plugin.initPage(page, screenshotTool);
          }

          for (const task of chunk) {
            logger.debug(`Executing task: ${task.id}`);
            const result = await plugin.execute(
              task,
              page,
              screenshotTool,
              context,
            );
            chunkResults.push({ result, task });

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
          }

          return chunkResults;
        }),
      );

      const results = allResults.flat().map((r) => r.result);
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
    // Always close the browser to ensure the process exits
    await screenshotTool.close();
  }

  const isCi = options.ci || process.env.CI === "true";

  if (!captureError && isCi) {
    await executeOnFailCallback(config);
  }

  if (hasScreenshotFailure) {
    const reportMessage = generateFailureReportMessage(failedScreenshots);
    logger.box({
      title: "Failed Screenshots",
      message: reportMessage,
    });
    logger.error(
      "One or more screenshots failed. See report above for details.",
    );
    process.exit(1);
  } else {
    logger.success("All plugins completed successfully");
  }
};

export const registerCaptureCommand = (program: Command): void => {
  program
    .command("capture")
    .description("Capture screenshots")
    .option("--ci", "run capture in CI mode and execute onFail callback")
    .action(async (options: CaptureOptions) => {
      await runCapture(options);
    });
};
