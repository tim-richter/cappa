import chalk from "chalk";
import { z } from "zod";

/**
 * The interpretation fields this reporter actually reads.
 *
 * The protocol carries `diffMeta.interpretation` opaquely — its shape belongs
 * to `@blazediff/core-native` and pinning it in a versioned wire contract would
 * make every diff-engine upgrade a breaking protocol change. So a remote engine
 * hands this an `unknown`, and it narrows rather than trusts.
 *
 * Deliberately not the full `InterpretResult`: matching only what is rendered
 * means a diff engine that adds or reshapes a field the reporter ignores does
 * not silently cost the user their diff report.
 */
const regionSchema = z.object({
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  percentage: z.number(),
  position: z.string(),
  changeType: z.string(),
});

type ParsedRegion = z.infer<typeof regionSchema>;

const interpretationSchema = z.object({
  severity: z.string(),
  totalRegions: z.number(),
  summary: z.string().optional(),
  // A region list that does not match is dropped rather than failing the whole
  // interpretation: severity and the region count still tell the user what
  // happened, which beats reporting nothing because one field moved.
  regions: z.array(regionSchema).catch([]).optional(),
});

type ParsedInterpretation = z.infer<typeof interpretationSchema>;

/**
 * A screenshot as far as this reporter is concerned.
 *
 * Looser than `@cappa/core`'s `Screenshot` in exactly one place — the
 * interpretation is `unknown` — so both a local and a remote engine's results
 * satisfy it.
 */
export type ReportableScreenshot = {
  name: string;
  category: string;
  diffMeta?: {
    percentDifference?: number;
    interpretation?: unknown;
  };
};

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
const describeRegion = (region: ParsedRegion): string => {
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

/** Default number of regions listed per changed screenshot. */
export const DEFAULT_MAX_REGIONS = 5;

export type DescribeChangesOptions = {
  /**
   * Maximum number of interpreted regions listed per screenshot. The largest
   * regions are listed first; the remainder is collapsed into a
   * `… and N more region(s)` line. Set to `0` to omit the per-region
   * breakdown entirely.
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
  screenshots: readonly ReportableScreenshot[],
  options: DescribeChangesOptions = {},
): string[] => {
  const { maxRegions = DEFAULT_MAX_REGIONS } = options;

  const changed = screenshots.filter(
    (screenshot) => screenshot.category === "changed",
  );

  if (changed.length === 0) {
    return [];
  }

  const lines: string[] = [];

  for (const screenshot of changed) {
    const meta = screenshot.diffMeta;
    const parsed = interpretationSchema.safeParse(meta?.interpretation);
    const interpretation: ParsedInterpretation | undefined = parsed.success
      ? parsed.data
      : undefined;

    const parts: string[] = [];
    if (interpretation) {
      parts.push(
        severityColor(interpretation.severity)(
          interpretation.severity.toUpperCase(),
        ),
      );
    }
    if (meta?.percentDifference !== undefined) {
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

    // Largest regions first, so truncating keeps the most significant ones.
    const regions = [...(interpretation?.regions ?? [])].sort(
      (a, b) => b.percentage - a.percentage,
    );
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
