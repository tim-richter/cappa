import { describe, expect, it } from "vitest";
import { formatPixelRatio, getPixelRatios } from "./pixelRatio";

const changed = {
  id: "1",
  name: "a",
  category: "changed" as const,
  actualPath: "actual/a.png",
  expectedPath: "expected/a.png",
  diffPath: "diff/a.png",
};

describe("getPixelRatios", () => {
  it("defaults both ratios to 1", () => {
    expect(getPixelRatios(changed)).toEqual({
      expected: 1,
      actual: 1,
      diff: 1,
      mismatch: false,
    });
  });

  it("flags a baseline captured at another ratio", () => {
    expect(getPixelRatios({ ...changed, actualPixelRatio: 2 })).toEqual({
      expected: 1,
      actual: 2,
      diff: 2,
      mismatch: true,
    });
  });

  it("does not flag a new screenshot, which has no baseline", () => {
    const ratios = getPixelRatios({
      id: "1",
      name: "a",
      category: "new",
      actualPath: "actual/a.png",
      actualPixelRatio: 2,
    });

    expect(ratios.mismatch).toBe(false);
    expect(ratios.actual).toBe(2);
  });
});

describe("formatPixelRatio", () => {
  it("renders a multiplier", () => {
    expect(formatPixelRatio(1.5)).toBe("1.5×");
  });
});
