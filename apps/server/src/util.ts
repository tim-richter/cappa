import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Screenshot } from "@cappa/core";

export const hereDir = () => {
  return path.dirname(fileURLToPath(import.meta.url));
};

export const resolveFromHere = (relative: string) => {
  return path.resolve(hereDir(), relative);
};

export const transformScreenshotPaths = (screenshots: Screenshot[]) => {
  return screenshots.map((screenshot) => {
    return {
      ...screenshot,
      actualPath: screenshot.actualPath ? "/assets/screenshots/" + screenshot.actualPath : undefined,
      expectedPath: screenshot.expectedPath ? "/assets/screenshots/" + screenshot.expectedPath : undefined,
      diffPath: screenshot.diffPath ? "/assets/screenshots/" + screenshot.diffPath : undefined,
    };
  });
};
