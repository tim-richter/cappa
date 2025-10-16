import type {
  Plugin,
  ScreenshotCaptureExtras,
  ScreenshotOptions,
  ScreenshotVariant,
} from "@cappa/core";
import { getLogger } from "@cappa/logger";
import type {
  ScreenshotOptionsStorybook,
  ScreenshotVariantOptionsStorybook,
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

    discover: async () => {
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
        storybook: defaultStorybookOptions,
      } = options;

      const storiesUrl = `${storybookUrl}/index.json`;
      logger.debug(`Fetching stories from: ${storiesUrl}`);

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

      filteredStories = filteredStories.filter(
        (story) => story.type === "story",
      );

      logger.start(`Found ${filteredStories.length} stories to screenshot...`);

      // Return tasks
      return filteredStories.map((story) => ({
        id: story.id,
        url: buildStorybookIframeUrl({
          baseUrl: storybookUrl,
          storyId: story.id,
          viewMode: defaultStorybookOptions?.viewMode,
          args: defaultStorybookOptions?.args,
          globals: defaultStorybookOptions?.globals,
          query: defaultStorybookOptions?.query,
          fullscreen: defaultStorybookOptions?.fullscreen,
          singleStory: defaultStorybookOptions?.singleStory,
        }),
        data: {
          story,
        },
      }));
    },

    initPage: async () => {
      return {
        latchMap: new Map<
          string,
          {
            p: Promise<ScreenshotOptionsStorybook>;
            resolve: (v: ScreenshotOptionsStorybook) => void;
          }
        >(),
      };
    },

    // Phase 2: Execute single story
    execute: async (task, page, screenshotTool, context) => {
      const { url, data } = task;
      const { story } = data;
      const logger = getLogger();

      try {
        // Setup exposed function for this page
        const currentLatch = createLatch<ScreenshotOptionsStorybook>();
        context.latchMap.set(story.id, currentLatch);

        if (
          await page.evaluate(() => {
            return (window as any).__cappa_parameters === undefined;
          })
        ) {
          await page.exposeFunction(
            "__cappa_parameters",
            async (id: string, payload: ScreenshotOptionsStorybook) => {
              context.latchMap.get(id)?.resolve?.(payload);
            },
          );
        }

        page.on("console", (message) => {
          logger.debug("console", message.text());
        });
        page.on("pageerror", (error) => {
          logger.debug("pageerror", error);
        });

        // Navigate to story
        await page.goto(url);

        // Get story parameters
        const storyParameters = await context.latchMap.get(story.id)?.p;
        context.latchMap.delete(story.id);

        const variantParameters = storyParameters?.variants ?? [];

        if (storyParameters?.skip) {
          logger.warn(`Skipping story ${story.title} - ${story.name}`);
          return {
            storyId: story.id,
            storyName: `${story.title} - ${story.name}`,
            skipped: true,
          };
        }

        if (storyParameters && Object.keys(storyParameters).length > 0) {
          logger.debug("Taking screenshot with options", storyParameters);
        }

        const resolvedViewport =
          storyParameters?.viewport ?? screenshotTool.viewport;

        await page.setViewportSize(resolvedViewport);

        await freezeUI(page);
        await waitForVisualIdle(page);

        const toLocatorMask = (mask?: string[]) =>
          mask?.map((selector) => page.locator(selector));

        const screenshotVariants: ScreenshotVariant[] = variantParameters.map(
          (variant: ScreenshotVariantOptionsStorybook) => ({
            id: variant.id,
            label: variant.label,
            filename: variant.filename,
            options: variant.options
              ? {
                  ...variant.options,
                  mask: toLocatorMask(variant.options.mask),
                }
              : undefined,
          }),
        );

        const screenshotOptions: ScreenshotOptions = {
          fullPage: storyParameters?.fullPage,
          delay: storyParameters?.delay,
          omitBackground: storyParameters?.omitBackground,
          skip: storyParameters?.skip,
          viewport: storyParameters?.viewport ?? screenshotTool.viewport,
          mask: toLocatorMask(storyParameters?.mask),
          variants: screenshotVariants.length ? screenshotVariants : undefined,
        };

        const filename = buildFilename(story);
        const expectedExists =
          screenshotTool.filesystem.hasExpectedFile(filename);
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

          if (!screenshotTool.filesystem.hasExpectedFile(variantFilename)) {
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

        return {
          storyId: story.id,
          storyName: `${story.title} - ${story.name}`,
          filepath: captureResult.base.filepath,
          success: captureResult.base.skipped
            ? undefined
            : captureResult.base.comparisonResult
              ? captureResult.base.comparisonResult.passed
              : Boolean(captureResult.base.filepath),
          skipped: captureResult.base.skipped,
        };
      } catch (error) {
        logger.error(
          `Error taking screenshot of story ${story.title} - ${story.name}:`,
          (error as Error).message,
        );
        return {
          storyId: story.id,
          storyName: `${story.title} - ${story.name}`,
          error: (error as Error)?.message ?? "Unknown error",
        };
      }
    },
  };
};
