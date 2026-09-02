import type { ChangeRegion, Screenshot } from "@cappa/core";
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

/** Human-readable labels for the `changeType` values reported by blazediff. */
const CHANGE_TYPE_LABELS: Record<string, string> = {
  Addition: "added",
  Deletion: "removed",
  ColorChange: "color",
  ContentChange: "content",
  Shift: "shifted",
  RenderingNoise: "noise",
};

const changeTypeLabel = (changeType: string) =>
  CHANGE_TYPE_LABELS[changeType] ?? changeType;

/** `content at center · 0.90% · 360x200 at (420, 300)` */
const describeRegion = (region: ChangeRegion): string => {
  const { bbox } = region;

  return [
    chalk.cyan(changeTypeLabel(region.changeType)),
    `at ${region.position}`,
    chalk.dim("·"),
    `${region.percentage.toFixed(2)}%`,
    chalk.dim("·"),
    chalk.dim(`${bbox.width}x${bbox.height} at (${bbox.x}, ${bbox.y})`),
  ].join(" ");
};

export type DescribeChangesOptions = {
  /**
   * Maximum number of interpreted regions listed per screenshot. Remaining
   * regions are collapsed into a `… and N more region(s)` line.
   * Set to `0` to omit the per-region breakdown entirely.
   *
   * @default 5
   */
  maxRegions?: number;
};

/**
 * Build human-readable lines describing the changed screenshots, surfacing the
 * pixel-diff percentage and (when `diff.interpret` is enabled) the structured
 * interpretation: severity, region count, summary and the individual regions
 * with their position and bounding box.
 *
 * Returns an empty array when there are no changed screenshots.
 */
export const describeChanges = (
  screenshots: Screenshot[],
  options: DescribeChangesOptions = {},
): string[] => {
  const { maxRegions = 5 } = options;

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

    const regions = interpretation?.regions ?? [];
    if (maxRegions > 0 && regions.length > 0) {
      for (const region of regions.slice(0, maxRegions)) {
        lines.push(`  ${chalk.dim("→")} ${describeRegion(region)}`);
      }

      const remaining = regions.length - maxRegions;
      if (remaining > 0) {
        lines.push(
          chalk.dim(
            `  … and ${remaining} more ${remaining === 1 ? "region" : "regions"}`,
          ),
        );
      }
    }
  }

  return lines;
};
