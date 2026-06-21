import type { Screenshot } from "@cappa/core";
import chalk from "chalk";

const severityColor = (severity: string) => {
  switch (severity) {
    case "High":
      return chalk.red;
    case "Medium":
      return chalk.yellow;
    case "Low":
      return chalk.green;
    default:
      return chalk.gray;
  }
};

/**
 * Build human-readable lines describing the changed screenshots, surfacing the
 * pixel-diff percentage and (when `diff.interpret` is enabled) the structured
 * interpretation: severity, region count and summary.
 *
 * Returns an empty array when there are no changed screenshots.
 */
export const describeChanges = (screenshots: Screenshot[]): string[] => {
  const changed = screenshots.filter(
    (screenshot) => screenshot.category === "changed",
  );

  if (changed.length === 0) {
    return [];
  }

  const lines: string[] = [];

  for (const screenshot of changed) {
    const meta = screenshot.diffMeta;
    const interpretation = meta?.interpretation;

    const parts: string[] = [];
    if (interpretation) {
      parts.push(
        severityColor(interpretation.severity)(
          interpretation.severity.toUpperCase(),
        ),
      );
    }
    if (meta) {
      parts.push(`${meta.percentDifference.toFixed(2)}%`);
    }
    if (interpretation) {
      const { totalRegions } = interpretation;
      parts.push(
        `${totalRegions} ${totalRegions === 1 ? "region" : "regions"}`,
      );
    }

    const suffix =
      parts.length > 0
        ? `  ${chalk.dim("·")} ${parts.join(chalk.dim(" · "))}`
        : "";
    lines.push(`${chalk.bold(screenshot.name)}${suffix}`);

    if (interpretation?.summary) {
      lines.push(`  ${chalk.dim(interpretation.summary)}`);
    }
  }

  return lines;
};
