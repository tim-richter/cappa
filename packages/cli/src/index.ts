import fs from "node:fs";
import path from "node:path";
import { ScreenshotTool } from "@cappa/core";
import { createServer } from "@cappa/server";
import chalk from "chalk";
import { Command } from "commander";
import { glob } from "glob";
import { version } from "../package.json";
import { initLogger } from "./logger";
import { getConfig } from "./utils/getConfig";
import { getCosmiConfig } from "./utils/getCosmiConfig";
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
  );

program
  .command("capture")
  .description("Capture screenshots")
  .option("-c, --clean", "clean output directory before running", false)
  .action(async (options) => {
    // Initialize logger with the specified log level
    const logLevel = parseInt(program.opts().logLevel, 10);
    const logger = initLogger(logLevel);

    logger.info("Cappa CLI starting...");
    logger.debug(`Log level set to: ${logLevel}`);

    const result = await getCosmiConfig("cappa");
    const config = await getConfig(result);

    logger.debug("Configuration loaded:", JSON.stringify(config, null, 2));

    const screenshotTool = new ScreenshotTool({
      outputDir: config.outputDir,
    });

    if (options.clean) {
      logger.debug(`Cleaning output directory: ${config.outputDir}`);
      if (fs.existsSync(config.outputDir)) {
        fs.rmSync(config.outputDir, { recursive: true, force: true });
      }
    }

    try {
      // Wait for all plugins to complete
      for (const plugin of config.plugins) {
        logger.debug(`Executing plugin: ${plugin.name || "unnamed"}`);
        await plugin.execute(screenshotTool, logger);
      }
      logger.success("All plugins completed successfully");
    } catch (error) {
      logger.error("Error during plugin execution:", error);
      throw error;
    } finally {
      // Always close the browser to ensure the process exits
      logger.debug("Closing screenshot tool...");
      await screenshotTool.close();
      logger.info("Cappa CLI finished");
    }
  });

program
  .command("review")
  .description("Review screenshots")
  .action(async () => {
    // Initialize logger with the specified log level
    const logLevel = parseInt(program.opts().logLevel, 10);
    const logger = initLogger(logLevel);

    logger.info("Cappa CLI starting...");
    logger.debug(`Log level set to: ${logLevel}`);

    const result = await getCosmiConfig("cappa");
    const config = await getConfig(result);

    logger.debug("Configuration loaded:", JSON.stringify(config, null, 2));

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
      actualScreenshots,
      expectedScreenshots,
      diffScreenshots,
      config.outputDir,
    );

    const server = await createServer({
      isProd: true,
      outputDir: path.resolve(config.outputDir),
      screenshots: groupedScreenshots,
    });

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
    // Initialize logger with the specified log level
    const logLevel = parseInt(program.opts().logLevel, 10);
    const logger = initLogger(logLevel);

    logger.info("Cappa CLI starting...");
    logger.debug(`Log level set to: ${logLevel}`);

    const result = await getCosmiConfig("cappa");
    const config = await getConfig(result);

    logger.debug("Configuration loaded:", JSON.stringify(config, null, 2));

    const actualScreenshotsPromise = glob(
      path.resolve(config.outputDir, "actual", "**/*.png"),
    );

    const [actualScreenshots] = await Promise.all([actualScreenshotsPromise]);

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

    // copy actual screenshots to expected directory
    for (const screenshot of screenshotsToApprove) {
      const destPath = path.resolve(
        config.outputDir,
        "expected",
        path.relative(`${config.outputDir}/actual`, screenshot),
      );
      const destDir = path.dirname(destPath);

      // Create destination directory if it doesn't exist
      fs.mkdirSync(destDir, { recursive: true });

      fs.copyFileSync(screenshot, destPath);

      const diffPath = path.resolve(
        config.outputDir,
        "diff",
        path.relative(`${config.outputDir}/actual`, screenshot),
      );

      if (fs.existsSync(diffPath)) {
        fs.unlinkSync(diffPath);
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
    // Initialize logger with the specified log level
    const logLevel = parseInt(program.opts().logLevel, 10);
    const logger = initLogger(logLevel);

    logger.debug(`Log level set to: ${logLevel}`);

    const result = await getCosmiConfig("cappa");
    const config = await getConfig(result);

    logger.debug("Configuration loaded:", JSON.stringify(config, null, 2));

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
      actualScreenshots,
      expectedScreenshots,
      diffScreenshots,
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
    const logLevel = parseInt(program.opts().logLevel, 10);
    const logger = initLogger(logLevel);

    logger.info("Initializing Cappa...");

    const configPath = path.resolve(process.cwd(), "cappa.config.ts");
    const packageJsonPath = path.resolve(process.cwd(), "package.json");

    // Create cappa.config.ts
    if (fs.existsSync(configPath)) {
      logger.warn("cappa.config.ts already exists, skipping...");
    } else {
      const configContent = `import { defineConfig } from "@cappa/core";

export default defineConfig({
  outputDir: "./screenshots",
  plugins: [],
});
`;

      fs.writeFileSync(configPath, configContent);
      logger.success("Created cappa.config.ts");
    }

    // Add script to package.json
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

        if (packageJson.scripts["cappa:approve"]) {
          logger.warn(
            "'cappa:approve' script already exists in package.json, skipping...",
          );
        } else {
          packageJson.scripts["cappa:approve"] = "cappa approve";
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
    logger.info("Run 'npm run cappa' or 'pnpm cappa' to capture screenshots");
  });

export async function run(): Promise<void> {
  await program.parseAsync();
}
