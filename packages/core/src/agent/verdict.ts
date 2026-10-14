import type {
  ChangeRegion,
  InterpretResult,
} from "@blazediff/interpret-native";

/**
 * What a reviewer — heuristic or agent — believes a changed screenshot is.
 *
 * `ambiguous` is only ever produced by the heuristic: it is the signal that
 * the change has to be looked at, and an agent's verdict must resolve it into
 * one of the other three.
 */
export const VERDICT_LABELS = [
  "regression-likely",
  "intentional-likely",
  "noise-likely",
  "ambiguous",
] as const;

export type VerdictLabel = (typeof VERDICT_LABELS)[number];

/** The labels a judge may hand back — everything but `ambiguous`. */
export const JUDGED_LABELS = [
  "regression-likely",
  "intentional-likely",
  "noise-likely",
] as const;

export type JudgedLabel = (typeof JUDGED_LABELS)[number];

/** What to do next with a screenshot carrying a label. */
export type VerdictAction =
  | "investigate"
  | "approve-if-intended"
  | "mask-or-approve";

export const ACTION_BY_LABEL: Record<VerdictLabel, VerdictAction> = {
  "regression-likely": "investigate",
  "intentional-likely": "approve-if-intended",
  "noise-likely": "mask-or-approve",
  ambiguous: "investigate",
};

export type Verdict = {
  label: VerdictLabel;
  /** One line, e.g. `2 regions: 1 addition, 1 color-change @ top-left (1.20%, medium)`. */
  headline: string;
  rationale: string[];
  action: VerdictAction;
};

export const isVerdictLabel = (value: unknown): value is VerdictLabel =>
  typeof value === "string" &&
  (VERDICT_LABELS as readonly string[]).includes(value);

export const isJudgedLabel = (value: unknown): value is JudgedLabel =>
  typeof value === "string" &&
  (JUDGED_LABELS as readonly string[]).includes(value);

/**
 * Change types are normalised to kebab-case before they are compared.
 *
 * `@blazediff/interpret-native` reports `color-change` today but earlier
 * releases reported `ColorChange`; normalising keeps the heuristic working
 * across a diff-engine upgrade instead of silently degrading every screenshot
 * to `ambiguous`.
 */
export const normalizeChangeType = (changeType: string): string =>
  changeType
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

const normalizeSeverity = (severity: string | undefined): string =>
  (severity ?? "").toLowerCase();

/** Structural: something appeared, vanished or was replaced. */
const REGRESSIVE_TYPES = new Set(["content-change", "addition", "deletion"]);
/** Restyled or moved, with structure intact. */
const RESTYLE_TYPES = new Set(["color-change", "shift"]);
const NOISE_TYPES = new Set(["rendering-noise"]);
const ELEVATED_SEVERITY = new Set(["medium", "high"]);

/** Below this share of the image, a low-severity change is not perceptible. */
export const SUB_PERCEPTUAL_PERCENT = 0.01;

/** Mean region confidence above which a pure recolour is trusted. */
const RECOLOR_CONFIDENCE = 0.7;

export type VerdictInput = {
  /** Percentage of differing pixels (0-100), from the pixel diff. */
  percentDifference?: number;
  numDiffPixels?: number;
  interpretation?: InterpretResult;
  /** Expected and actual have different dimensions. */
  differentSizes?: boolean;
};

const formatPercent = (percent: number | undefined): string => {
  if (percent === undefined) return "?%";
  return percent >= 0.01 ? `${percent.toFixed(2)}%` : `${percent.toFixed(3)}%`;
};

const countByType = (regions: readonly ChangeRegion[]) => {
  const counts = new Map<string, number>();
  for (const region of regions) {
    const type = normalizeChangeType(region.changeType);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
};

const formatBreakdown = (counts: Map<string, number>): string =>
  [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");

const largestRegion = (regions: readonly ChangeRegion[]) =>
  regions.reduce<ChangeRegion | undefined>(
    (best, region) =>
      !best || region.pixelCount > best.pixelCount ? region : best,
    undefined,
  );

const meanConfidence = (regions: readonly ChangeRegion[]): number =>
  regions.length === 0
    ? 0
    : regions.reduce((sum, region) => sum + (region.confidence ?? 0), 0) /
      regions.length;

/**
 * A one-line description of a change, shaped so that the same kind of change
 * on different screenshots produces the same headline — which is what lets an
 * agent spot one shared cause (a footer timestamp, a theme toggle) across
 * dozens of screenshots without opening any of them.
 */
export const buildHeadline = (input: VerdictInput): string => {
  if (input.differentSizes) return "image dimensions changed";

  const interpretation = input.interpretation;
  const percent = input.percentDifference ?? interpretation?.diffPercentage;

  if (!interpretation || interpretation.regions.length === 0) {
    const pixels = input.numDiffPixels ?? interpretation?.diffCount;
    return `${pixels?.toLocaleString("en-US") ?? "?"} px (${formatPercent(percent)}) - no region analysis`;
  }

  const regions = interpretation.regions;
  const counts = countByType(regions);
  const position = largestRegion(regions)?.position;
  const at = position ? ` @ ${position}` : "";
  const severity = normalizeSeverity(interpretation.severity) || "?";

  if (regions.length === 1) {
    return `1 ${[...counts.keys()][0]}${at} (${formatPercent(percent)}, ${severity})`;
  }

  return `${regions.length} regions: ${formatBreakdown(counts)}${at} (${formatPercent(percent)}, ${severity})`;
};

const verdict = (
  label: VerdictLabel,
  headline: string,
  rationale: string[],
): Verdict => ({ label, headline, rationale, action: ACTION_BY_LABEL[label] });

/**
 * Classify a changed screenshot from its diff interpretation alone.
 *
 * Deliberately conservative: only the cases the signals settle are labelled,
 * and everything else is `ambiguous` so that it reaches a judge who can look
 * at the pixels. A wrong `noise-likely` hides a regression; a wrong
 * `ambiguous` costs one look.
 */
export const deriveVerdict = (input: VerdictInput): Verdict => {
  const headline = buildHeadline(input);

  if (input.differentSizes) {
    return verdict("ambiguous", headline, [
      "expected and actual have different dimensions — content likely grew or shrank",
      "could be an intended content change or a broken layout",
    ]);
  }

  const interpretation = input.interpretation;
  if (!interpretation || interpretation.regions.length === 0) {
    return verdict("ambiguous", headline, [
      "pixels differ but no change regions were found",
    ]);
  }

  const regions = interpretation.regions;
  const types = regions.map((region) => normalizeChangeType(region.changeType));
  const severity = normalizeSeverity(interpretation.severity);
  const percent = input.percentDifference ?? interpretation.diffPercentage;
  const counts = countByType(regions);

  if (types.every((type) => NOISE_TYPES.has(type))) {
    return verdict("noise-likely", headline, [
      "every region is classified as rendering noise",
    ]);
  }

  if (percent < SUB_PERCEPTUAL_PERCENT && severity === "low") {
    return verdict("noise-likely", headline, [
      `less than ${SUB_PERCEPTUAL_PERCENT}% of the image differs (${formatPercent(percent)}) at low severity`,
      "sub-perceptual change",
    ]);
  }

  if (
    types.some((type) => REGRESSIVE_TYPES.has(type)) &&
    ELEVATED_SEVERITY.has(severity)
  ) {
    const structural = [...counts]
      .filter(([type]) => REGRESSIVE_TYPES.has(type))
      .map(([type, count]) => `${count} ${type}`)
      .join(", ");
    return verdict("regression-likely", headline, [
      `${severity} severity with structural changes (${structural})`,
      "content or layout changed, not just styling",
    ]);
  }

  const allRecolor = types.every((type) => type === "color-change");
  if (allRecolor && meanConfidence(regions) > RECOLOR_CONFIDENCE) {
    return verdict("intentional-likely", headline, [
      `${regions.length} confident color-change ${regions.length === 1 ? "region" : "regions"}`,
      "edge structure preserved — looks like a theming or palette change",
    ]);
  }

  if (!allRecolor && types.every((type) => RESTYLE_TYPES.has(type))) {
    return verdict("intentional-likely", headline, [
      "every region is a shift or color change — content moved or was restyled, structure preserved",
    ]);
  }

  return verdict("ambiguous", headline, [
    `mix of change types (${formatBreakdown(counts)}) at ${severity || "unknown"} severity`,
    `${formatPercent(percent)} of the image differs`,
  ]);
};
