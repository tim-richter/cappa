import type {
  Plugin,
  ScreenshotCaptureExtras,
  ScreenshotOptions,
  ScreenshotVariant,
} from "@cappa/core";
import { getLogger } from "@cappa/logger";
import chalk from "chalk";
import type {
  ScreenshotOptionsStorybook,
  StorybookRenderOptions,
} from "../types";
import { buildStorybookIframeUrl } from "./storybook-url";
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
  storybook?: StorybookRenderOptions;
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
    execute: async (screenshotTool) => {
      if (!options) {
        throw new Error("Storybook plugin options are required");
      }
      if (!options.storybookUrl) {
        throw new Error("storybookUrl is required");
      }

      const logger = getLogger();

      const {
        storybookUrl,
        includeStories = [],
        excludeStories = [],
        defaultViewport,
        storybook: defaultStorybookOptions,
      } = options;

      const storiesUrl = `${storybookUrl}/index.json`;
      logger.debug(`Fetching stories from: ${storiesUrl}`);

      // Fetch stories from Storybook
      const response = await fetch(storiesUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch stories: ${response.status} ${response.statusText}`,
        );
      }

      try {
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

        logger.start(
          `Found ${filteredStories.length} stories to screenshot...`,
        );

        const results: Array<{
          storyId: string;
          storyName: string;
          filepath?: string;
          success?: boolean;
          error?: string;
          skipped?: boolean;
        }> = [];

        await screenshotTool.init();

        let currentLatch = createLatch<ScreenshotOptionsStorybook>();

        await screenshotTool.page?.exposeFunction(
          "__cappa_parameters",
          async (payload: ScreenshotOptionsStorybook) => {
            currentLatch.resolve(payload);
          },
        );

        // Take screenshots of each story
        for (const story of filteredStories) {
          let storyParameters: ScreenshotOptionsStorybook | undefined;
          try {
            const storybookOverrides = storyParameters?.storybook;
            const mergedArgs = {
              ...(defaultStorybookOptions?.args ?? {}),
              ...(storybookOverrides?.args ?? {}),
            };
            const mergedGlobals = {
              ...(defaultStorybookOptions?.globals ?? {}),
              ...(storybookOverrides?.globals ?? {}),
            };
            const mergedQuery = {
              ...(defaultStorybookOptions?.query ?? {}),
              ...(storybookOverrides?.query ?? {}),
            };
            const hasArgs = Object.keys(mergedArgs).length > 0;
            const hasGlobals = Object.keys(mergedGlobals).length > 0;
            const hasQuery = Object.keys(mergedQuery).length > 0;
            const storyUrl = buildStorybookIframeUrl({
              baseUrl: storybookUrl,
              storyId: story.id,
              viewMode:
                storybookOverrides?.viewMode ??
                defaultStorybookOptions?.viewMode,
              args: hasArgs ? mergedArgs : undefined,
              globals: hasGlobals ? mergedGlobals : undefined,
              query: hasQuery ? mergedQuery : undefined,
              fullscreen:
                storybookOverrides?.fullscreen ??
                defaultStorybookOptions?.fullscreen,
              singleStory:
                storybookOverrides?.singleStory ??
                defaultStorybookOptions?.singleStory,
            });

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

            storyParameters = await currentLatch.p;
            currentLatch = createLatch<ScreenshotOptionsStorybook>();

            const variantParameters = storyParameters?.variants ?? [];

            if (storyParameters?.skip) {
              logger.warn(`Skipping story ${story.title} - ${story.name}`);
              results.push({
                storyId: story.id,
                storyName: `${story.title} - ${story.name}`,
                skipped: true,
              });
              for (const variant of variantParameters) {
                results.push({
                  storyId: `${story.id}__${variant.id}`,
                  storyName: `${story.title} - ${story.name} [${variant.label ?? variant.id}]`,
                  skipped: true,
                });
              }
              continue;
            }

            if (storyParameters && Object.keys(storyParameters).length > 0) {
              logger.debug("Taking screenshot with options", storyParameters);
            }

            const resolvedViewport =
              storyParameters?.viewport ??
              defaultViewport ??
              screenshotTool.viewport;

            await page.setViewportSize(resolvedViewport);

            await freezeUI(page);
            await waitForVisualIdle(page);

            const toLocatorMask = (mask?: string[]) =>
              mask?.map((selector) => page.locator(selector));

            const screenshotVariants: ScreenshotVariant[] =
              variantParameters.map((variant) => ({
                id: variant.id,
                label: variant.label,
                filename: variant.filename,
                options: variant.options
                  ? {
                      ...variant.options,
                      mask: toLocatorMask(variant.options.mask),
                    }
                  : undefined,
              }));

            const screenshotOptions: ScreenshotOptions = {
              fullPage: storyParameters?.fullPage,
              delay: storyParameters?.delay,
              omitBackground: storyParameters?.omitBackground,
              skip: storyParameters?.skip,
              viewport: storyParameters?.viewport ?? defaultViewport,
              mask: toLocatorMask(storyParameters?.mask),
              variants: screenshotVariants.length
                ? screenshotVariants
                : undefined,
            };

            const filename = buildFilename(story);
            const expectedExists = screenshotTool.hasExpectedImage(filename);
            if (!expectedExists) {
              logger.info(
                `Expected image not found for story ${story.title} - ${story.name}, taking screenshot`,
              );
            }

            const variantFilenameMap = new Map<string, string>();
            for (const variant of screenshotVariants) {
              const variantFilename = screenshotTool.getVariantFilename(
                filename,
                variant,
              );
              variantFilenameMap.set(variant.id, variantFilename);

              if (!screenshotTool.hasExpectedImage(variantFilename)) {
                logger.info(
                  `Expected image not found for variant ${story.title} - ${story.name} [${variant.label ?? variant.id}], taking screenshot`,
                );
              }
            }

            const variantExtrasEntries = screenshotVariants.map(
              (variant) =>
                [
                  variant.id,
                  {
                    saveDiffImage: true,
                    diffImageFilename:
                      variantFilenameMap.get(variant.id) ?? filename,
                  },
                ] as const,
            );

            const captureExtras: ScreenshotCaptureExtras = {
              saveDiffImage: true,
              diffImageFilename: filename,
              variants: variantExtrasEntries.length
                ? Object.fromEntries(variantExtrasEntries)
                : undefined,
            };

            const captureResult = await screenshotTool.capture(
              page,
              filename,
              screenshotOptions,
              captureExtras,
            );

            results.push({
              storyId: story.id,
              storyName: `${story.title} - ${story.name}`,
              filepath: captureResult.base.filepath,
              success: captureResult.base.skipped
                ? undefined
                : captureResult.base.comparisonResult
                  ? captureResult.base.comparisonResult.passed
                  : Boolean(captureResult.base.filepath),
              skipped: captureResult.base.skipped,
            });

            for (const variantResult of captureResult.variants) {
              results.push({
                storyId: `${story.id}__${variantResult.id}`,
                storyName: `${story.title} - ${story.name} [${variantResult.label ?? variantResult.id}]`,
                filepath: variantResult.filepath,
                success: variantResult.skipped
                  ? undefined
                  : variantResult.comparisonResult
                    ? variantResult.comparisonResult.passed
                    : Boolean(variantResult.filepath),
                skipped: variantResult.skipped,
              });
            }
          } catch (error) {
            logger.error(
              `Error taking screenshot of story ${story.title} - ${story.name}:`,
              (error as Error).message,
            );
            results.push({
              storyId: story.id,
              storyName: `${story.title} - ${story.name}`,
              error: (error as Error)?.message ?? "Unknown error",
            });
            for (const variant of storyParameters?.variants ?? []) {
              results.push({
                storyId: `${story.id}__${variant.id}`,
                storyName: `${story.title} - ${story.name} [${variant.label ?? variant.id}]`,
                error: (error as Error)?.message ?? "Unknown error",
              });
            }
          }
        }

        // Print error report if there are any errors
        if (results.some((r) => r.error)) {
          logger.error(
            `Error report: \n${results
              .filter((r) => r.error)
              .map((r) => `${r.storyName}: ${r.error}`)
              .join("\n")}`,
          );
        }

        // Print skipped stories if there are any
        if (results.some((r) => r.skipped)) {
          logger.warn(
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
        logger.error("Error in Storybook plugin:", (error as Error).message);
        throw error;
      }
    },
  };
};
