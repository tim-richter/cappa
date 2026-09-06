import { collectScreenshots } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import chalk from "chalk";
import { getConfig } from "../features/config";

import { describeChanges } from "../utils/describeChanges";

type StatusOptions = {
  maxRegions?: number;
};

export const status = async (options: StatusOptions = {}) => {
  const logger = getLogger();

  const config = await getConfig();

  const groupedScreenshots = await collectScreenshots(config.outputDir);

  logger.debug(
    "All screenshot information:",
    JSON.stringify(groupedScreenshots, null, 2),
  );

  logger.box({
    title: "Screenshot Status",
    message: `${chalk.yellow("New screenshots:")} ${groupedScreenshots.filter((r) => r.category === "new").length}\n${chalk.red("Deleted screenshots:")} ${groupedScreenshots.filter((r) => r.category === "deleted").length}\n${chalk.green("Changed screenshots:")} ${groupedScreenshots.filter((r) => r.category === "changed").length}\n${chalk.blue("Passed screenshots:")} ${groupedScreenshots.filter((r) => r.category === "passed").length}`,
  });

  const changeLines = describeChanges(groupedScreenshots, {
    maxRegions: options.maxRegions,
  });
  if (changeLines.length > 0) {
    logger.box({
      title: "Changed Screenshots",
      message: changeLines.join("\n"),
    });
  }

  if (
    groupedScreenshots.some((s) =>
      ["new", "changed", "deleted"].includes(s.category),
    )
  ) {
    process.exitCode = 1;
  }
};
