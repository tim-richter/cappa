import fs from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";
import {
  type FailedScreenshot,
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
    });

    let captureError: unknown;

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
            }

            return chunkResults;
          }),
        );

        const results = allResults.flat();
        logger.success(
          `Plugin ${plugin.name} completed: ${results.length} results`,
        );
      }

      logger.success("All plugins completed successfully");
    } catch (error) {
      logger.error("Error during plugin execution:", error);
      captureError = error;
      throw error;
    } finally {
      // Always close the browser to ensure the process exits
      await screenshotTool.close();
    }

    if (!captureError && config.onFail) {
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

    // copy actual screenshots to expected directory
    for (const screenshot of screenshotsToApprove) {
      fileSystem.approveFromActualPath(screenshot);
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
