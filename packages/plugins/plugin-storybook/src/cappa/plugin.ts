import type {
  Plugin,
  ScreenshotCaptureExtras,
  ScreenshotVariantWithUrl,
} from "@cappa/core";
import { getLogger } from "@cappa/logger";
import type { Page } from "playwright-core";
import type {
  DiffOptionsStorybook,
  ScreenshotOptionsStorybook,
  StorybookRenderOptions,
} from "../types";
import { buildStorybookIframeUrl } from "./storybook-url";
import { buildFilename, freezeUI, waitForVisualIdle } from "./util";

/**
 * Wait for the play function to complete by checking the playAfterEach flag
 * Only waits if the story actually has a play function
 */
async function waitForPlayFunctionCompletion(page: Page, storyName: string) {
  const logger = getLogger();

  try {
    // First check if this story has a play function
    const hasPlayFunction = await page.evaluate(
      () => (window as any).__cappa_has_play_function === true,
    );

    if (!hasPlayFunction) {
      return;
    }

    logger.debug(
      `Waiting for play function to complete for story: ${storyName}`,
    );

    await page.waitForFunction(() => (window as any).playAfterEach === true, {
      timeout: 10000,
    });

    logger.debug(`Play function completed for story: ${storyName}`);

    // Reset the flags for the next story
    await page.evaluate(() => {
      (window as any).playAfterEach = false;
      (window as any).__cappa_has_play_function = false;
    });
  } catch {
    // Reset flags even on timeout
    await page.evaluate(() => {
      (window as any).playAfterEach = false;
      (window as any).__cappa_has_play_function = false;
    });
  }
}

export interface StorybookStory {
  id: string;
  name: string;
  title: string;
  kind: string;
  story: string;
  type: "story" | "docs";
}

/**
 * Context passed to includeStories and excludeStories predicate functions.
 * Use these fields to decide which stories to include or exclude.
 */
export interface StoryFilterContext {
  id: string;
  title: string;
  name: string;
  /** Full story path: `${title}/${name}` (e.g. "Button/Primary") */
  filePath: string;
}

function toFilterContext(story: StorybookStory): StoryFilterContext {
  return {
    id: story.id,
    title: story.title,
    name: story.name,
    filePath: `${story.title}/${story.name}`,
  };
}

interface StorybookStoriesResponse {
  entries: Record<string, StorybookStory>;
}

export interface StorybookPluginOptions {
  storybookUrl: string;
  /**
   * Optional predicate to include stories. If provided, only stories for which
   * it returns true are included. Example: (s) => s.id === 'button--primary'
   * or (s) => s.title === 'Button'.
   */
  includeStories?: (story: StoryFilterContext) => boolean;
  /**
   * Optional predicate to exclude stories. If provided, stories for which it
   * returns true are excluded (applied after includeStories). Example:
   * (s) => s.title === 'Input'.
   */
  excludeStories?: (story: StoryFilterContext) => boolean;
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
  const p = new Promise<T>((r) => {
    resolve = r;
  });
  return { p, resolve };
}

/**
 * Storybook Plugin for Cappa
 * Fetches stories from a running Storybook server and takes screenshots of each story.
 * Supports includeStories and excludeStories predicate functions for filtering.
 */
export const cappaPluginStorybook: Plugin<StorybookPluginOptions> = (
  options,
) => {
  return {
    name: "StorybookPlugin",
    description:
      "Takes screenshots of Storybook stories with configurable options",

    discover: async (screenshotTool) => {
      if (!options) {
        throw new Error("Storybook plugin options are required");
      }
      if (!options.storybookUrl) {
        throw new Error("storybookUrl is required");
      }

      const logger = getLogger();

      const {
        storybookUrl,
        includeStories,
        excludeStories,
        storybook: defaultStorybookOptions,
      } = options;

      const storiesUrl = `${storybookUrl}/index.json`;
      logger.debug(`Fetching stories from: ${storiesUrl}`);

      const timeout = screenshotTool.connectionTimeout;

      let response: Response;
      try {
        response = await fetch(storiesUrl, {
          signal: AbortSignal.timeout(timeout),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new Error(
            `Connection to Storybook at ${storybookUrl} timed out after ${timeout}ms. Make sure Storybook is running and accessible.`,
          );
        }
        throw new Error(
          `Failed to connect to Storybook at ${storybookUrl}. Make sure Storybook is running and accessible. Error: ${(error as Error).message}`,
        );
      }
      if (!response.ok) {
        throw new Error(
          `Failed to fetch stories: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as StorybookStoriesResponse;
      const stories = Object.values(data.entries);

      let filteredStories = stories;

      if (includeStories) {
        filteredStories = filteredStories.filter((story) =>
          includeStories(toFilterContext(story)),
        );
      }

      if (excludeStories) {
        filteredStories = filteredStories.filter(
          (story) => !excludeStories(toFilterContext(story)),
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

    initPage: async (page, screenshotTool) => {
      const logger = getLogger();
      const { logConsoleEvents = true } = screenshotTool;

      const latchMap = new Map<
        string,
        {
          p: Promise<ScreenshotOptionsStorybook>;
          resolve: (v: ScreenshotOptionsStorybook) => void;
        }
      >();

      await page.exposeFunction(
        "__cappa_parameters",
        async (id: string, payload: ScreenshotOptionsStorybook) => {
          latchMap.get(id)?.resolve?.(payload);
        },
      );

      if (logConsoleEvents) {
        page.on("console", (message) => {
          logger.debug("console", message.text());
        });
      }
      page.on("pageerror", (error) => {
        logger.debug("pageerror", error);
      });

      return { latchMap };
    },

    // Phase 2: Execute single story
    execute: async (task, page, screenshotTool, context) => {
      const { url, data } = task;
      const { story } = data;
      const logger = getLogger();
      const { storybook: defaultStorybookOptions } = options || {};

      try {
        // Setup latch for this story's parameters
        const currentLatch = createLatch<ScreenshotOptionsStorybook>();
        context.latchMap.set(story.id, currentLatch);

        // Navigate to story
        const captureStart = performance.now();
        await page.goto(url, { timeout: screenshotTool.connectionTimeout });

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

        // Wait for play function to complete if it exists
        await waitForPlayFunctionCompletion(
          page,
          `${story.title} - ${story.name}`,
        );

        const toLocatorMask = (mask?: string[]) =>
          mask?.map((selector) => page.locator(selector));

        const filename = buildFilename(story);

        // Convert variants to the new format with URLs
        const variantsWithUrls: ScreenshotVariantWithUrl[] = [];
        const variantExtrasEntries: [
          string,
          {
            saveDiffImage: boolean;
            diffImageFilename?: string;
            diff?: DiffOptionsStorybook;
          },
        ][] = [];

        for (const variant of variantParameters) {
          const variantFilename =
            variant.filename ||
            screenshotTool.getVariantFilename(filename, {
              id: variant.id,
              label: variant.label,
              filename: variant.filename,
            });

          // Merge variant args with default storybook options
          const mergedArgs = {
            ...defaultStorybookOptions?.args,
            ...variant.options?.args,
          };

          variantsWithUrls.push({
            id: variant.id,
            label: variant.label,
            filename: variantFilename,
            url: buildStorybookIframeUrl({
              baseUrl: options?.storybookUrl || "",
              storyId: story.id,
              viewMode: defaultStorybookOptions?.viewMode,
              args: mergedArgs,
              globals: defaultStorybookOptions?.globals,
              query: defaultStorybookOptions?.query,
              fullscreen: defaultStorybookOptions?.fullscreen,
              singleStory: defaultStorybookOptions?.singleStory,
            }),
            options: variant.options
              ? {
                  ...variant.options,
                  mask: toLocatorMask(variant.options.mask),
                }
              : undefined,
          });

          variantExtrasEntries.push([
            variant.id,
            {
              saveDiffImage: true,
              diffImageFilename: variantFilename,
              diff: variant.options?.diff,
            },
          ]);
        }

        const baseOptions = {
          fullPage: storyParameters?.fullPage,
          delay: storyParameters?.delay,
          omitBackground: storyParameters?.omitBackground,
          skip: storyParameters?.skip,
          viewport: storyParameters?.viewport ?? screenshotTool.viewport,
          mask: toLocatorMask(storyParameters?.mask),
        };

        const variantFilenameMap = new Map<string, string>();
        for (const variant of variantsWithUrls) {
          const variantFilename = variant.filename;
          if (!variantFilename) continue; // Skip if no filename

          variantFilenameMap.set(variant.id, variantFilename);
        }

        const captureExtras: ScreenshotCaptureExtras = {
          saveDiffImage: true,
          diffImageFilename: filename,
          diff: storyParameters?.diff,
          variants: variantExtrasEntries.length
            ? Object.fromEntries(variantExtrasEntries)
            : undefined,
          skipBaseNavigation: true,
          waitForStability: waitForVisualIdle,
          captureStart,
        };

        const captureResult = await screenshotTool.captureWithVariants(
          page,
          filename,
          url,
          baseOptions,
          variantsWithUrls,
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
