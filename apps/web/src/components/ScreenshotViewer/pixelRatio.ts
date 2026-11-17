import type { Screenshot } from "@cappa/protocol";

export type PixelRatios = {
  /** Image pixels per CSS pixel of the baseline; 1 when it has none. */
  expected: number;
  /** Image pixels per CSS pixel of the new capture; 1 when it has none. */
  actual: number;
  /**
   * The diff image's ratio. It is drawn on a canvas the size of the larger
   * image, so on a mismatch the larger ratio is the closer guess.
   */
  diff: number;
  /** The baseline was captured at another ratio — a scale change. */
  mismatch: boolean;
};

/** Read a screenshot's pixel ratios, filling in the 1× the wire leaves out. */
export function getPixelRatios(screenshot: Screenshot): PixelRatios {
  const expected = screenshot.expectedPixelRatio ?? 1;
  const actual = screenshot.actualPixelRatio ?? 1;
  const bothImages =
    screenshot.category === "changed" || screenshot.category === "passed";

  return {
    expected,
    actual,
    diff: Math.max(expected, actual),
    mismatch: bothImages && expected !== actual,
  };
}

export const formatPixelRatio = (ratio: number) => `${ratio}×`;
