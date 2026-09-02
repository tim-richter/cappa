import { getLogger } from "@cappa/logger";
import chalk from "chalk";
import { getConfig } from "../features/config";
import { collectScreenshots } from "../utils/collectScreenshots";
import { describeChanges } from "../utils/describeChanges";

export const status = async () => {
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

  const changeLines = describeChanges(groupedScreenshots);
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
