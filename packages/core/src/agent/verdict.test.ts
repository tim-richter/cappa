import type {
  ChangeRegion,
  InterpretResult,
} from "@blazediff/interpret-native";
import { describe, expect, it } from "vitest";
import { describeChange, isVerdictLabel, normalizeChangeType } from "./verdict";

const region = (
  changeType: string,
  overrides: Partial<ChangeRegion> = {},
): ChangeRegion =>
  ({
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    pixelCount: 100,
    percentage: 1,
    position: "top-left",
    shape: "solid-region",
    changeType,
    confidence: 0.9,
    ...overrides,
  }) as ChangeRegion;

const interpretation = (
  regions: ChangeRegion[],
  overrides: Partial<InterpretResult> = {},
): InterpretResult => ({
  summary: "",
  diffCount: 1000,
  totalRegions: regions.length,
  regions,
  severity: "medium",
  diffPercentage: 1.5,
  width: 100,
  height: 100,
  ...overrides,
});

describe("normalizeChangeType", () => {
  it("normalises PascalCase and kebab-case to kebab-case", () => {
    expect(normalizeChangeType("ColorChange")).toBe("color-change");
    expect(normalizeChangeType("color-change")).toBe("color-change");
    expect(normalizeChangeType("RenderingNoise")).toBe("rendering-noise");
    expect(normalizeChangeType("Addition")).toBe("addition");
  });
});

describe("isVerdictLabel", () => {
  it("accepts only the labels a judge can give", () => {
    expect(isVerdictLabel("regression-likely")).toBe(true);
    expect(isVerdictLabel("intentional-likely")).toBe(true);
    expect(isVerdictLabel("noise-likely")).toBe(true);
    expect(isVerdictLabel("ambiguous")).toBe(false);
  });
});

describe("describeChange", () => {
  it("counts regions and names the largest one's position", () => {
    const change = describeChange({
      percentDifference: 1.2,
      interpretation: interpretation([
        region("addition", { pixelCount: 10, position: "bottom" }),
        region("color-change", { pixelCount: 500, position: "center" }),
        region("addition", { pixelCount: 20, position: "top" }),
      ]),
    });
    expect(change).toBe("3 regions @ center (1.20%)");
  });

  it("names neither change types nor severity", () => {
    const change = describeChange({
      percentDifference: 0.004,
      interpretation: interpretation(
        [region("rendering-noise", { position: "top" })],
        { severity: "low" },
      ),
    });
    expect(change).toBe("1 region @ top (0.004%)");
  });

  it("falls back to pixel counts without regions", () => {
    expect(describeChange({ percentDifference: 2, numDiffPixels: 1234 })).toBe(
      "1,234 px (2.00%) - no regions located",
    );
  });

  it("says when the dimensions changed", () => {
    expect(describeChange({ differentSizes: true })).toBe(
      "image dimensions changed",
    );
    expect(
      describeChange({
        differentSizes: true,
        percentDifference: 5,
        interpretation: interpretation([region("addition")]),
      }),
    ).toBe("dimensions changed; 1 region @ top-left (5.00%)");
  });
});
