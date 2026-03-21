import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Screenshot } from "@cappa/core";

const ASSETS_SCREENSHOTS_PREFIX = "/assets/screenshots/";

/**
 * Strip the UI `/assets/screenshots/` prefix from screenshot paths so they match
 * `path.relative(outputDir, …)` values used by `ScreenshotFileSystem` and the CLI.
 */
export function screenshotPathsForFilesystem(
  screenshot: Screenshot,
): Screenshot {
  const strip = (p?: string) => {
    if (!p) return undefined;
    if (p.startsWith(ASSETS_SCREENSHOTS_PREFIX)) {
      return p.slice(ASSETS_SCREENSHOTS_PREFIX.length);
    }
    return p;
  };

  return {
    ...screenshot,
    actualPath: strip(screenshot.actualPath),
    expectedPath: strip(screenshot.expectedPath),
    diffPath: strip(screenshot.diffPath),
  };
}

export const hereDir = () => {
  return path.dirname(fileURLToPath(import.meta.url));
};

export const resolveFromHere = (relative: string) => {
  return path.resolve(hereDir(), relative);
};

export const transform = (screenshots: Screenshot[]) => {
  const screenshotWithPaths = transformScreenshotPaths(screenshots);
  const screenshotWithNextAndPrev =
    transformScreenshotsWithNextAndPrev(screenshotWithPaths);
  return screenshotWithNextAndPrev;
};

const transformScreenshotPaths = (screenshots: Screenshot[]) => {
  return screenshots.map((screenshot) => {
    return {
      ...screenshot,
      actualPath: screenshot.actualPath
        ? `/assets/screenshots/${screenshot.actualPath}`
        : undefined,
      expectedPath: screenshot.expectedPath
        ? `/assets/screenshots/${screenshot.expectedPath}`
        : undefined,
      diffPath: screenshot.diffPath
        ? `/assets/screenshots/${screenshot.diffPath}`
        : undefined,
    };
  });
};

const transformScreenshotsWithNextAndPrev = (screenshots: Screenshot[]) => {
  return screenshots.map((screenshot, index) => {
    return {
      ...screenshot,
      next: screenshots[index + 1]?.id,
      prev: screenshots[index - 1]?.id,
    };
  });
};
