import fs from "node:fs";
import { ScreenshotTool } from "@cappa/core";
import { Command } from "commander";
import { version } from "../package.json";
import { initLogger } from "./logger";
import { getConfig } from "./utils/getConfig";
import { getCosmiConfig } from "./utils/getCosmiConfig";
import { createServer } from "@cappa/server";
import path from "node:path";
import { glob } from "glob";

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
  const logLevel = parseInt(options.logLevel, 10);
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
  .action(async (options) => {
    // Initialize logger with the specified log level
  const logLevel = parseInt(options.logLevel, 10);
  const logger = initLogger(logLevel);

  logger.info("Cappa CLI starting...");
  logger.debug(`Log level set to: ${logLevel}`);

  const result = await getCosmiConfig("cappa");
  const config = await getConfig(result);

  logger.debug("Configuration loaded:", JSON.stringify(config, null, 2));

  const actualScreenshotsPromise = glob(path.resolve(config.outputDir, "actual", "**/*.png"));
  const expectedScreenshotsPromise = glob(path.resolve(config.outputDir, "expected", "**/*.png"));
  const diffScreenshotsPromise = glob(path.resolve(config.outputDir, "diff", "**/*.png"));

  const [actualScreenshots, expectedScreenshots, diffScreenshots] = await Promise.all([actualScreenshotsPromise, expectedScreenshotsPromise, diffScreenshotsPromise]);

  const server = await createServer({ 
    isProd: true, 
    outputDir: path.resolve(config.outputDir),
    screenshotPaths: {
      actual: actualScreenshots,
      expected: expectedScreenshots,
      diff: diffScreenshots
    }
  });

  await server.listen({ port: 3000 });
});

export async function run(): Promise<void> {
  await program.parseAsync();
}
