import type { Plugin, ScreenshotCaptureExtras } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import type { PageEntry, PagesPluginOptions } from "./types";
import {
  applyWaitStrategy,
  deriveFilenameFromUrl,
  freezeUI,
  resolveWaitStrategy,
  sanitizeName,
  waitForVisualIdle,
} from "./util";

/**
 * Pages Plugin for Cappa
 *
 * Takes screenshots of a list of URLs with configurable waiting strategies,
 * viewport overrides, masks, and delays.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@cappa/core';
 * import { cappaPluginPages } from '@cappa/plugin-pages';
 *
 * export default defineConfig({
 *   plugins: [
 *     cappaPluginPages({
 *       pages: [
 *         { url: 'https://example.com', name: 'homepage' },
 *         { url: 'https://example.com/pricing', name: 'pricing' },
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export const cappaPluginPages: Plugin<PagesPluginOptions> = (options) => {
  return {
    name: "PagesPlugin",
    description: "Takes screenshots of a list of URLs",

    discover: async () => {
      if (!options) {
        throw new Error("Pages plugin options are required");
      }
      if (!options.pages || options.pages.length === 0) {
        throw new Error(
          "At least one page entry is required in the pages array",
        );
      }

      const logger = getLogger();

      const tasks = options.pages.map((entry) => {
        const name =
          entry.name ?? deriveFilenameFromUrl(entry.url).replace(/\.png$/, "");

        return {
          id: name,
          url: entry.url,
          data: entry,
        };
      });

      logger.start(`Found ${tasks.length} pages to screenshot...`);

      return tasks;
    },

    initPage: async (page, screenshotTool) => {
      const logger = getLogger();
      const { logConsoleEvents = true } = screenshotTool;

      if (logConsoleEvents) {
        page.on("console", (message) => {
          logger.debug("console", message.text());
        });
      }
      page.on("pageerror", (error) => {
        logger.debug("pageerror", error);
      });

      return {};
    },

    execute: async (task, page, screenshotTool) => {
      const { data } = task;
      const entry = data as PageEntry;
      const logger = getLogger();

      try {
        const captureStart = performance.now();

        // Navigate to the page
        await page.goto(entry.url, { waitUntil: "domcontentloaded" });

        // Freeze animations/transitions for deterministic screenshots
        await freezeUI(page);

        // Apply the resolved wait strategy
        const waitStrategy = resolveWaitStrategy(options?.wait, entry.wait);
        await applyWaitStrategy(page, waitStrategy);

        // Resolve screenshot options
        const mergedOptions = {
          ...options?.defaults,
          ...entry.options,
        };

        // Convert CSS selector masks to Playwright Locators
        const toLocatorMask = (mask?: string[]) =>
          mask?.map((selector: string) => page.locator(selector));

        // Build the filename
        const filename = entry.name
          ? sanitizeName(entry.name)
          : deriveFilenameFromUrl(entry.url);

        const screenshotSettings = {
          fullPage: mergedOptions.fullPage,
          delay: mergedOptions.delay,
          omitBackground: mergedOptions.omitBackground,
          viewport: mergedOptions.viewport ?? screenshotTool.viewport,
          mask: toLocatorMask(mergedOptions.mask),
        };

        // Set viewport before capture
        const resolvedViewport =
          mergedOptions.viewport ?? screenshotTool.viewport;
        await page.setViewportSize(resolvedViewport);

        const captureExtras: ScreenshotCaptureExtras = {
          saveDiffImage: true,
          diffImageFilename: filename,
          diff: mergedOptions.diff,
          skipBaseNavigation: true,
          waitForStability: waitForVisualIdle,
          captureStart,
        };

        const captureResult = await screenshotTool.captureWithVariants(
          page,
          filename,
          entry.url,
          screenshotSettings,
          [],
          captureExtras,
        );

        return {
          name: entry.name ?? task.id,
          url: entry.url,
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
          `Error taking screenshot of ${entry.url}:`,
          (error as Error).message,
        );
        return {
          name: entry.name ?? task.id,
          url: entry.url,
          error: (error as Error)?.message ?? "Unknown error",
        };
      }
    },
  };
};
