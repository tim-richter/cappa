import type { Plugin, ScreenshotOptions } from "@cappa/core";
import chalk from "chalk";
import { buildFilename, freezeUI, waitForVisualIdle } from "./util";

export interface StorybookStory {
  id: string;
  name: string;
  title: string;
  kind: string;
  story: string;
  type: "story" | "docs";
}

interface StorybookStoriesResponse {
  entries: Record<string, StorybookStory>;
}

interface StorybookPluginOptions {
  storybookUrl: string;
  includeStories?: string[];
  excludeStories?: string[];
  defaultViewport?: { width: number; height: number };
  waitForSelector?: string;
  waitForTimeout?: number;
}

/**
 * Create a latch for a Promise. A latch is a Promise that can be resolved from outside.
 * @param T - The type of the Promise
 * @returns A latch for a Promise
 */
function createLatch<T>() {
  let resolve!: (v: T) => void;
  // biome-ignore lint/suspicious/noAssignInExpressions: explicitly setting resolve
  const p = new Promise<T>((r) => (resolve = r));
  return { p, resolve };
}

/**
 * Storybook Plugin for Cappa
 * Fetches stories from a running Storybook server and takes screenshots of each story
 */
export const cappaPluginStorybook: Plugin<StorybookPluginOptions> = (
  options,
) => {
  return {
    name: "StorybookPlugin",
    description:
      "Takes screenshots of Storybook stories with configurable options",
    version: "1.0.0",
    execute: async (screenshotTool, logger) => {
      if (!options) {
        throw new Error("Storybook plugin options are required");
      }
      if (!options.storybookUrl) {
        throw new Error("storybookUrl is required");
      }

      const {
        storybookUrl,
        includeStories = [],
        excludeStories = [],
      } = options;

      const storiesUrl = `${storybookUrl}/index.json`;
      console.log(`Fetching stories from: ${storiesUrl}`);

      try {
        // Fetch stories from Storybook
        const response = await fetch(storiesUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch stories: ${response.status} ${response.statusText}`,
          );
        }

        const data = (await response.json()) as StorybookStoriesResponse;
        const stories = Object.values(data.entries);

        // Filter stories based on include/exclude patterns
        let filteredStories = stories;

        if (includeStories.length > 0) {
          filteredStories = filteredStories.filter((story) =>
            includeStories.some(
              (pattern) =>
                story.title.includes(pattern) || story.name.includes(pattern),
            ),
          );
        }

        if (excludeStories.length > 0) {
          filteredStories = filteredStories.filter(
            (story) =>
              !excludeStories.some(
                (pattern) =>
                  story.title.includes(pattern) || story.name.includes(pattern),
              ),
          );
        }

        // Filter docs etc
        filteredStories = filteredStories.filter(
          (story) => story.type === "story",
        );

        console.log(`Found ${filteredStories.length} stories to screenshot`);

        const results: Array<{
          storyId: string;
          storyName: string;
          filepath?: string;
          success?: boolean;
          error?: string;
          skipped?: boolean;
        }> = [];

        await screenshotTool.init();

        let currentLatch = createLatch<ScreenshotOptions>();

        await screenshotTool.page?.exposeFunction(
          "__cappa_parameters",
          async (payload: ScreenshotOptions) => {
            currentLatch.resolve(payload);
          },
        );

        // Take screenshots of each story
        for (const story of filteredStories) {
          try {
            const storyUrl = `${storybookUrl}/iframe.html?id=${story.id}&viewMode=story`;

            const page = screenshotTool.page;
            if (!page) {
              throw new Error("Page not initialized");
            }

            page.on("console", (message) => {
              logger.debug("console", message.text());
            });
            page.on("pageerror", (error) => {
              logger.debug("pageerror", error);
            });

            await page.goto(storyUrl);

            const options = await currentLatch.p;
            currentLatch = createLatch<ScreenshotOptions>();

            if (options.skip) {
              logger.log(`Skipping story ${story.title} - ${story.name}`);
              results.push({
                storyId: story.id,
                storyName: `${story.title} - ${story.name}`,
                skipped: true,
              });
              continue;
            }

            if (options && Object.keys(options).length > 0) {
              logger.debug("Taking screenshot with options", options);
            }

            await freezeUI(page);
            await waitForVisualIdle(page);

            if (options.delay) {
              await page.waitForTimeout(options.delay);
            }

            // Take screenshot with story-specific filename
            const filename = buildFilename(story);
            const expectedExists = screenshotTool.hasExpectedImage(filename);

            let actualFilepath: string | undefined;
            if (expectedExists) {
              const { screenshotPath, comparisonResult } =
                await screenshotTool.takeScreenshotWithComparison(
                  page,
                  filename,
                  screenshotTool.getExpectedImageBuffer(filename),
                  {
                    fullPage: options.fullPage,
                    mask: options.mask?.map((selector) =>
                      page.locator(selector),
                    ),
                    omitBackground: options.omitBackground,
                    saveDiffImage: true,
                  },
                );

              actualFilepath = screenshotPath;
              if (comparisonResult.passed) {
                logger.log(
                  `Story ${story.title} - ${story.name} passed visual comparison`,
                );
              } else {
                logger.log(
                  `Story ${story.title} - ${story.name} failed visual comparison`,
                );
              }

              results.push({
                storyId: story.id,
                storyName: `${story.title} - ${story.name}`,
                filepath: actualFilepath,
                success: comparisonResult.passed,
              });
            } else {
              logger.info(
                `Expected image not found for story ${story.title} - ${story.name}, taking screenshot`,
              );
              actualFilepath = await screenshotTool.takeScreenshot(
                page,
                filename,
                {
                  fullPage: options.fullPage,
                  mask: options.mask?.map((selector) => page.locator(selector)),
                  omitBackground: options.omitBackground,
                },
              );

              results.push({
                storyId: story.id,
                storyName: `${story.title} - ${story.name}`,
                filepath: actualFilepath,
                success: true,
              });
            }
          } catch (error) {
            console.error(
              `Error taking screenshot of story ${story.title} - ${story.name}:`,
              (error as Error).message,
            );
            results.push({
              storyId: story.id,
              storyName: `${story.title} - ${story.name}`,
              error: (error as Error)?.message ?? "Unknown error",
            });
          }
        }

        // Print error report if there are any errors
        if (results.some((r) => r.error)) {
          console.log(
            `Error report: \n${results
              .filter((r) => r.error)
              .map((r) => `${r.storyName}: ${r.error}`)
              .join("\n")}`,
          );
        }

        // Print skipped stories if there are any
        if (results.some((r) => r.skipped)) {
          console.log(
            `Skipped stories: \n${results
              .filter((r) => r.skipped)
              .map((r) => `${r.storyName}`)
              .join("\n")}`,
          );
        }

        const skipped = results.filter((r) => r.skipped);
        const failed = results.filter(
          (r) => r.error || (!r.skipped && !r.success),
        );
        const successful = results.filter((r) => r.success);

        const output = [
          `${chalk.yellow("Skipped stories:")} ${skipped.length}`,
          `${chalk.red("Failed stories:")} ${failed.length}`,
          `${chalk.green("Successful stories:")} ${successful.length}`,
          `${chalk.blue("Total stories:")} ${results.length}`,
        ];

        logger.box({
          title: "Storybook Report",
          message: output.join("\n"),
        });

        return results;
      } catch (error) {
        console.error("Error in Storybook plugin:", (error as Error).message);
        throw error;
      }
    },
  };
};
