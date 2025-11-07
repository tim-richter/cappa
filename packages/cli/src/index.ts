import fs from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";
import {
  type FailedScreenshot,
  imagesMatch,
  ScreenshotFileSystem,
  ScreenshotTool,
} from "@cappa/core";
import { getLogger, initLogger } from "@cappa/logger";
import { createServer } from "@cappa/server";
import chalk from "chalk";
import { Command } from "commander";
import { version } from "../package.json";
import { getConfig } from "./features/config";
import { defaultConfig } from "./features/config/default";
import { groupScreenshots } from "./utils/groupScreenshots";

type PluginCaptureResult = {
  success?: boolean;
  skipped?: boolean;
  error?: unknown;
  filepath?: string;
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

  const groupedScreenshots = await groupScreenshots(
    await Array.fromAsync(actualScreenshots),
    await Array.fromAsync(expectedScreenshots),
    await Array.fromAsync(diffScreenshots),
    config.outputDir,
  );

  const failingScreenshots: FailedScreenshot[] = groupedScreenshots
    .filter((screenshot) => screenshot.category !== "passed")
    .map((screenshot) => ({
      ...screenshot,
      absoluteActualPath: screenshot.actualPath
        ? path.resolve(config.outputDir, screenshot.actualPath)
        : undefined,
      absoluteExpectedPath: screenshot.expectedPath
        ? path.resolve(config.outputDir, screenshot.expectedPath)
        : undefined,
      absoluteDiffPath: screenshot.diffPath
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

async function runCapture(runOnFail: boolean): Promise<void> {
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

  try {
    await screenshotTool.init();

    let hasScreenshotFailure = false;

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
          const chunkResults = [];
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
            chunkResults.push(result);

            if (didScreenshotFail(result)) {
              pluginHasFailure = true;
              hasScreenshotFailure = true;
            }
          }

          return chunkResults;
        }),
      );

      const results = allResults.flat();
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

    if (hasScreenshotFailure) {
      logger.error(
        "One or more screenshots failed. See logs above for details.",
      );
      process.exitCode = 1;
    } else {
      logger.success("All plugins completed successfully");
    }
  } catch (error) {
    logger.error("Error during plugin execution:", error);
    captureError = error;
    throw error;
  } finally {
    // Always close the browser to ensure the process exits
    await screenshotTool.close();
  }

  if (!captureError && runOnFail) {
    await executeOnFailCallback(config);
  }
}

const program = new Command();

program
  .name("cappa")
  .description("Cappa CLI")
  .version(version)
  .option(
    "-l, --log-level <level>",
    "set log level (0: fatal and error, 1: warn, 2: log, 3: info, 4: debug, 5: trace)",
    "3",
  )
  .hook("preAction", (thisCommand) => {
    const logLevel = parseInt(thisCommand.opts().logLevel, 10);
    const logger = initLogger(logLevel);
    logger.debug(`Log level set to: ${logLevel}`);
  });

program
  .command("capture")
  .description("Capture screenshots")
  .action(async () => {
    await runCapture(false);
  });

program
  .command("ci")
  .description(
    "Capture screenshots and run onFail callback for failed screenshots",
  )
  .action(async () => {
    await runCapture(true);
  });

program
  .command("review")
  .description("Review screenshots")
  .action(async () => {
    const logger = getLogger();

    const config = await getConfig();

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
    );

    const server = await createServer({
      isProd: true,
      outputDir: path.resolve(config.outputDir),
      screenshots: groupedScreenshots,
      logger: getLogger().level >= 4,
    });

    logger.success("Review UI available at http://localhost:3000");
    await server.listen({ port: 3000 });
  });

program
  .command("approve")
  .description("Approve screenshots")
  .option(
    "-f, --filter <filter...>",
    "only approve screenshots whose name includes the provided filter value(s)",
  )
  .action(async (options) => {
    const logger = getLogger();

    const config = await getConfig();

    const actualScreenshotsPromise = glob(
      path.resolve(config.outputDir, "actual", "**/*.png"),
    );

    const globs = await actualScreenshotsPromise;
    const actualScreenshots = await Array.fromAsync(globs);

    let screenshotsToApprove = actualScreenshots;

    if (options.filter?.length) {
      const filters = options.filter.map((filter: string) =>
        filter.toLowerCase(),
      );
      logger.debug(
        `Filtering actual screenshots by filter: ${filters.join(", ")}`,
      );

      screenshotsToApprove = actualScreenshots.filter((screenshot) => {
        const screenshotName = path.basename(screenshot).toLowerCase();
        const screenshotPath = screenshot.toLowerCase();

        return filters.some(
          (filter: string) =>
            screenshotName.includes(filter) || screenshotPath.includes(filter),
        );
      });

      if (screenshotsToApprove.length === 0) {
        logger.warn("No screenshots matched the provided filter(s)");
        return;
      }
    }

    const fileSystem = new ScreenshotFileSystem(config.outputDir);
    const actualDir = path.resolve(config.outputDir, "actual");
    const expectedDir = path.resolve(config.outputDir, "expected");
    const diffDir = path.resolve(config.outputDir, "diff");

    // copy actual screenshots to expected directory when they differ
    for (const screenshot of screenshotsToApprove) {
      const actualAbsolute = path.isAbsolute(screenshot)
        ? screenshot
        : path.resolve(actualDir, screenshot);
      const relativePath = path.relative(actualDir, actualAbsolute);

      if (relativePath.startsWith("..")) {
        throw new Error(
          `Cannot approve screenshot outside of actual directory: ${screenshot}`,
        );
      }

      const expectedPath = path.resolve(expectedDir, relativePath);
      const diffPath = path.resolve(diffDir, relativePath);

      let shouldCopy = true;

      if (fs.existsSync(expectedPath)) {
        try {
          const matches = await imagesMatch(
            actualAbsolute,
            expectedPath,
            config.diff,
          );

          if (matches) {
            shouldCopy = false;

            if (fs.existsSync(diffPath)) {
              fs.unlinkSync(diffPath);
            }
          }
        } catch (error) {
          logger.warn(
            `Failed to compare screenshot ${relativePath}: ${(error as Error).message}`,
          );
        }
      }

      if (shouldCopy) {
        fileSystem.approveFromActualPath(actualAbsolute);
      }
    }

    if (screenshotsToApprove.length === actualScreenshots.length) {
      logger.success("All screenshots approved");
    } else {
      logger.success(
        `${screenshotsToApprove.length} screenshot(s) approved (filtered)`,
      );
    }
  });

program
  .command("status")
  .description("Get status of screenshots")
  .action(async () => {
    const logger = getLogger();

    const config = await getConfig();

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
    );

    logger.debug(
      "All screenshot information:",
      JSON.stringify(groupedScreenshots, null, 2),
    );

    logger.box({
      title: "Screenshot Status",
      message: `${chalk.yellow("New screenshots:")} ${groupedScreenshots.filter((r) => r.category === "new").length}\n${chalk.red("Deleted screenshots:")} ${groupedScreenshots.filter((r) => r.category === "deleted").length}\n${chalk.green("Changed screenshots:")} ${groupedScreenshots.filter((r) => r.category === "changed").length}\n${chalk.blue("Passed screenshots:")} ${groupedScreenshots.filter((r) => r.category === "passed").length}`,
    });
  });

program
  .command("init")
  .description("Initialize Cappa in the current directory")
  .action(async () => {
    const logger = getLogger();

    const configPath = path.resolve(process.cwd(), "cappa.config.ts");
    const packageJsonPath = path.resolve(process.cwd(), "package.json");

    // Create cappa.config.ts
    if (fs.existsSync(configPath)) {
      logger.warn("cappa.config.ts already exists, skipping...");
    } else {
      fs.writeFileSync(configPath, defaultConfig);
      logger.success("Created cappa.config.ts");
    }

    // Add scripts to package.json
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8"),
        );

        if (!packageJson.scripts) {
          packageJson.scripts = {};
        }

        if (packageJson.scripts.cappa) {
          logger.warn(
            "'cappa' script already exists in package.json, skipping...",
          );
        } else {
          packageJson.scripts.cappa = "cappa capture";
        }

        if (packageJson.scripts["cappa:review"]) {
          logger.warn(
            "'cappa:review' script already exists in package.json, skipping...",
          );
        } else {
          packageJson.scripts["cappa:review"] = "cappa review";
        }

        fs.writeFileSync(
          packageJsonPath,
          `${JSON.stringify(packageJson, null, 2)}\n`,
        );
        logger.success("Added 'cappa' scripts to package.json");
      } catch (error) {
        logger.error("Failed to update package.json:", error);
      }
    } else {
      logger.warn("package.json not found, skipping script addition");
    }

    logger.success("Cappa initialization complete!");
    logger.warn(
      "cappa relies on playwright to capture screenshots. Please install playwright and browsers before running cappa.",
    );
  });

export async function run(): Promise<void> {
  await program.parseAsync();
}
