import type {
  ChangeRegion,
  InterpretResult,
} from "@blazediff/interpret-native";
import { describe, expect, it } from "vitest";
import { buildHeadline, deriveVerdict, normalizeChangeType } from "./verdict";

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

describe("deriveVerdict", () => {
  it("is ambiguous when the dimensions changed", () => {
    const verdict = deriveVerdict({ differentSizes: true });
    expect(verdict.label).toBe("ambiguous");
    expect(verdict.headline).toBe("image dimensions changed");
    expect(verdict.action).toBe("investigate");
  });

  it("is ambiguous when there is no interpretation", () => {
    const verdict = deriveVerdict({
      percentDifference: 2,
      numDiffPixels: 1234,
    });
    expect(verdict.label).toBe("ambiguous");
    expect(verdict.headline).toBe("1,234 px (2.00%) - no region analysis");
  });

  it("labels pure rendering noise as noise", () => {
    const verdict = deriveVerdict({
      interpretation: interpretation([
        region("rendering-noise"),
        region("RenderingNoise"),
      ]),
    });
    expect(verdict.label).toBe("noise-likely");
    expect(verdict.action).toBe("mask-or-approve");
  });

  it("labels sub-perceptual low-severity changes as noise", () => {
    const verdict = deriveVerdict({
      percentDifference: 0.004,
      interpretation: interpretation([region("content-change")], {
        severity: "Low",
      }),
    });
    expect(verdict.label).toBe("noise-likely");
    expect(verdict.headline).toBe("1 content-change @ top-left (0.004%, low)");
  });

  it("labels structural changes at elevated severity as regressions", () => {
    const verdict = deriveVerdict({
      percentDifference: 3,
      interpretation: interpretation(
        [region("deletion"), region("color-change")],
        { severity: "high" },
      ),
    });
    expect(verdict.label).toBe("regression-likely");
    expect(verdict.rationale[0]).toContain("1 deletion");
  });

  it("labels confident recolours as intentional", () => {
    const verdict = deriveVerdict({
      percentDifference: 3,
      interpretation: interpretation([
        region("color-change", { confidence: 0.8 }),
        region("ColorChange", { confidence: 0.9 }),
      ]),
    });
    expect(verdict.label).toBe("intentional-likely");
    expect(verdict.action).toBe("approve-if-intended");
  });

  it("does not trust low-confidence recolours", () => {
    const verdict = deriveVerdict({
      percentDifference: 3,
      interpretation: interpretation([
        region("color-change", { confidence: 0.4 }),
      ]),
    });
    expect(verdict.label).toBe("ambiguous");
  });

  it("labels shifts mixed with recolours as intentional", () => {
    const verdict = deriveVerdict({
      percentDifference: 3,
      interpretation: interpretation([region("shift"), region("color-change")]),
    });
    expect(verdict.label).toBe("intentional-likely");
  });

  it("leaves structural changes at low severity ambiguous", () => {
    const verdict = deriveVerdict({
      percentDifference: 0.5,
      interpretation: interpretation([region("addition")], {
        severity: "low",
      }),
    });
    expect(verdict.label).toBe("ambiguous");
  });
});

describe("buildHeadline", () => {
  it("summarises multiple regions by type, largest position first", () => {
    const headline = buildHeadline({
      percentDifference: 1.2,
      interpretation: interpretation([
        region("addition", { pixelCount: 10, position: "bottom" }),
        region("color-change", { pixelCount: 500, position: "center" }),
        region("addition", { pixelCount: 20, position: "top" }),
      ]),
    });
    expect(headline).toBe(
      "3 regions: 2 addition, 1 color-change @ center (1.20%, medium)",
    );
  });
});
