import type { Screenshot } from "@cappa/core";
import { ScreenshotFileSystem } from "@cappa/core";
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

  await fileSystem.approveScreenshots(screenshotsToApprove, config.diff);

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
