import fs from "node:fs";
import path from "node:path";
import {
  imagesMatch,
  type Screenshot,
  ScreenshotFileSystem,
} from "@cappa/core";
import { getLogger } from "@cappa/logger";
import { getConfig } from "../features/config";
import { groupScreenshots } from "../utils/groupScreenshots";

export const approve = async (options: { filter?: string[] }) => {
  const logger = getLogger();

  const config = await getConfig();

  logger.start("Approving screenshots...");

  const fileSystem = new ScreenshotFileSystem(config.outputDir);

  const [actualScreenshots, diffScreenshots, expectedScreenshots] =
    await Promise.all([
      fileSystem.getActualScreenshots(),
      fileSystem.getDiffScreenshots(),
      fileSystem.getExpectedScreenshots(),
    ]);

  let screenshotsToApprove = groupScreenshots(
    actualScreenshots,
    expectedScreenshots,
    diffScreenshots,
    config.outputDir,
  );

  const filters =
    options.filter?.map((filter: string) => filter.toLowerCase()) ?? [];

  if (filters.length > 0) {
    logger.debug(
      `Filtering actual screenshots by filter: ${filters.join(", ")}`,
    );

    screenshotsToApprove = filterScreenshots(screenshotsToApprove, filters);

    if (screenshotsToApprove.length === 0) {
      logger.warn("No screenshots matched the provided filter(s)");
      return;
    }
  }

  for (const screenshot of screenshotsToApprove) {
    logger.debug(`Approving screenshot with category: ${screenshot.category}`);

    if (screenshot.category === "new") {
      logger.debug(`Approving new screenshot: ${screenshot.actualPath}`);
      // Strip "actual/" prefix since approveFromActualPath expects path relative to actual directory
      const relativePath = screenshot.actualPath.startsWith("actual/")
        ? screenshot.actualPath.slice("actual/".length)
        : screenshot.actualPath;
      fileSystem.approveFromActualPath(relativePath);
      continue;
    }

    if (screenshot.category === "deleted") {
      logger.debug(`Deleting expected screenshot: ${screenshot.expectedPath}`);
      fs.unlinkSync(path.resolve(config.outputDir, screenshot.expectedPath));
      continue;
    }

    if (screenshot.category === "changed") {
      logger.debug(`Deleting diff screenshot: ${screenshot.diffPath}`);
      fs.unlinkSync(path.resolve(config.outputDir, screenshot.diffPath));
      // Strip "actual/" prefix since approveFromActualPath expects path relative to actual directory
      const relativePath = screenshot.actualPath.startsWith("actual/")
        ? screenshot.actualPath.slice("actual/".length)
        : screenshot.actualPath;
      fileSystem.approveFromActualPath(relativePath);
      continue;
    }

    if (screenshot.category === "passed") {
      if (!screenshot.expectedPath) {
        throw new Error("Expected path is required for passed screenshots");
      }

      const matches = await imagesMatch(
        path.resolve(config.outputDir, screenshot.actualPath),
        path.resolve(config.outputDir, screenshot.expectedPath),
        config.diff,
      );

      if (!matches) {
        // Strip "actual/" prefix since approveFromActualPath expects path relative to actual directory
        const relativePath = screenshot.actualPath.startsWith("actual/")
          ? screenshot.actualPath.slice("actual/".length)
          : screenshot.actualPath;
        fileSystem.approveFromActualPath(relativePath);
      }
    }
  }

  if (filters.length > 0) {
    logger.success(
      `${screenshotsToApprove.length} screenshot(s) approved (filtered)`,
    );
  } else {
    logger.success("All screenshots approved");
  }
};

const filterScreenshots = (screenshots: Screenshot[], filters: string[]) => {
  return screenshots.filter((screenshot) => {
    return filters.some((filter: string) => {
      const nameMatches = screenshot.name.includes(filter);
      const pathMatches =
        "actualPath" in screenshot && screenshot.actualPath?.includes(filter);
      return nameMatches || pathMatches;
    });
  });
};
