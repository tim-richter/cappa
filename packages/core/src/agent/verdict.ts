import type {
  ChangeRegion,
  InterpretResult,
} from "@blazediff/interpret-native";

/**
 * What a judge believes a changed screenshot is, after looking at it.
 *
 * Only a judge labels a change. Cappa's diff threshold already absorbs
 * sub-pixel rendering differences, so a screenshot that reaches `changed`
 * differs beyond the tolerance the project configured — and classifying it
 * from diff signals alone (change types, severity, pixel counts) proved to
 * mislabel exactly the changes that matter: a font-size change reads as a
 * harmless shift plus recolour. Every changed screenshot is looked at instead.
 */
export const VERDICT_LABELS = [
  "regression-likely",
  "intentional-likely",
  "noise-likely",
] as const;

export type VerdictLabel = (typeof VERDICT_LABELS)[number];

/** What to do next with a screenshot carrying a label. */
export type VerdictAction =
  | "investigate"
  | "approve-if-intended"
  | "mask-or-approve";

export const ACTION_BY_LABEL: Record<VerdictLabel, VerdictAction> = {
  "regression-likely": "investigate",
  "intentional-likely": "approve-if-intended",
  "noise-likely": "mask-or-approve",
};

export type Verdict = {
  label: VerdictLabel;
  /** One line, e.g. `Submit button label is truncated`. */
  headline: string;
  rationale: string[];
  action: VerdictAction;
};

export const isVerdictLabel = (value: unknown): value is VerdictLabel =>
  typeof value === "string" &&
  (VERDICT_LABELS as readonly string[]).includes(value);

/**
 * Change types are normalised to kebab-case before they are compared.
 *
 * `@blazediff/interpret-native` reports `color-change` today but earlier
 * releases reported `ColorChange`; normalising keeps the capture report's
 * labels working across a diff-engine upgrade.
 */
export const normalizeChangeType = (changeType: string): string =>
  changeType
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

export type ChangeInput = {
  /** Percentage of differing pixels (0-100), from the pixel diff. */
  percentDifference?: number;
  numDiffPixels?: number;
  interpretation?: InterpretResult;
  /**
   * Expected and actual have different dimensions. Pixel counts and the
   * interpretation then describe a comparison on a canvas padded to the
   * larger size.
   */
  differentSizes?: boolean;
};

const formatPercent = (percent: number | undefined): string => {
  if (percent === undefined) return "?%";
  return percent >= 0.01 ? `${percent.toFixed(2)}%` : `${percent.toFixed(3)}%`;
};

const largestRegion = (regions: readonly ChangeRegion[]) =>
  regions.reduce<ChangeRegion | undefined>(
    (best, region) =>
      !best || region.pixelCount > best.pixelCount ? region : best,
    undefined,
  );

/**
 * A one-line description of where and how much a screenshot changed, shaped
 * so that the same change on different screenshots produces the same text —
 * which is what lets a judge spot one shared cause (a footer timestamp, a
 * theme toggle) across dozens of screenshots and judge them together.
 *
 * Deliberately geometry only: no change types, no severity. Those are guesses
 * from pixel signals, and a judge primed with "noise" or "shift" looks less
 * carefully at what is in fact a regression.
 */
export const describeChange = (input: ChangeInput): string => {
  const regions = input.interpretation?.regions ?? [];

  if (input.differentSizes) {
    return regions.length > 0
      ? `dimensions changed; ${describeChange({ ...input, differentSizes: false })}`
      : "image dimensions changed";
  }

  const percent =
    input.percentDifference ?? input.interpretation?.diffPercentage;

  if (regions.length === 0) {
    const pixels = input.numDiffPixels ?? input.interpretation?.diffCount;
    return `${pixels?.toLocaleString("en-US") ?? "?"} px (${formatPercent(percent)}) - no regions located`;
  }

  const position = largestRegion(regions)?.position;
  const at = position ? ` @ ${position}` : "";
  const count = `${regions.length} ${regions.length === 1 ? "region" : "regions"}`;
  return `${count}${at} (${formatPercent(percent)})`;
};
