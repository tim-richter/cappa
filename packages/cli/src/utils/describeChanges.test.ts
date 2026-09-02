import type { ChangeRegion, InterpretResult, Screenshot } from "@cappa/core";
import { describe, expect, it } from "vitest";
import { describeChanges } from "./describeChanges";

const region = (
  changeType: string,
  position: string,
  bbox: ChangeRegion["bbox"],
  percentage: number,
): ChangeRegion =>
  ({
    bbox,
    pixelCount: 100,
    percentage,
    position,
    shape: "rectangle",
    changeType,
    confidence: 0.9,
  }) as ChangeRegion;

const interpretation = (
  overrides: Partial<InterpretResult> = {},
): InterpretResult => ({
  summary: "Moderate visual change detected",
  diffCount: 100,
  totalRegions: 2,
  severity: "Medium",
  diffPercentage: 1.87,
  width: 100,
  height: 100,
  regions: [],
  ...overrides,
});

const changedScreenshot = (
  name: string,
  interpretationOverrides: Partial<InterpretResult>,
): Screenshot => ({
  id: name,
  name,
  category: "changed",
  actualPath: `actual/${name}.png`,
  expectedPath: `expected/${name}.png`,
  diffPath: `diff/${name}.png`,
  diffMeta: {
    numDiffPixels: 100,
    percentDifference: 1.87,
    interpretation: interpretation(interpretationOverrides),
  },
});

describe("describeChanges", () => {
  it("returns no lines when nothing changed", () => {
    const screenshots: Screenshot[] = [
      { id: "1", name: "a", category: "new", actualPath: "actual/a.png" },
    ];

    expect(describeChanges(screenshots)).toEqual([]);
  });

  it("includes severity, percentage, region count and summary", () => {
    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "Button/Primary",
        category: "changed",
        actualPath: "actual/b.png",
        expectedPath: "expected/b.png",
        diffPath: "diff/b.png",
        diffMeta: {
          numDiffPixels: 100,
          percentDifference: 1.87,
          interpretation: interpretation(),
        },
      },
    ];

    const lines = describeChanges(screenshots);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Button/Primary");
    expect(lines[0]).toContain("MEDIUM");
    expect(lines[0]).toContain("1.87%");
    expect(lines[0]).toContain("2 regions");
    expect(lines[1]).toContain("Moderate visual change detected");
  });

  it("uses singular wording for a single region", () => {
    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "c",
        category: "changed",
        actualPath: "actual/c.png",
        expectedPath: "expected/c.png",
        diffPath: "diff/c.png",
        diffMeta: {
          numDiffPixels: 5,
          percentDifference: 0.5,
          interpretation: interpretation({ totalRegions: 1 }),
        },
      },
    ];

    expect(describeChanges(screenshots)[0]).toContain("1 region");
  });

  it("shows the diff percentage even without interpretation", () => {
    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "d",
        category: "changed",
        actualPath: "actual/d.png",
        expectedPath: "expected/d.png",
        diffPath: "diff/d.png",
        diffMeta: { numDiffPixels: 42, percentDifference: 3.14 },
      },
    ];

    const lines = describeChanges(screenshots);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("d");
    expect(lines[0]).toContain("3.14%");
  });

  it("lists each interpreted region with its type, position and bounding box", () => {
    const screenshots = [
      changedScreenshot("Button/Primary", {
        totalRegions: 2,
        regions: [
          region(
            "ContentChange",
            "center",
            { x: 420, y: 300, width: 360, height: 200 },
            0.9,
          ),
          region(
            "Addition",
            "right",
            { x: 960, y: 120, width: 180, height: 140 },
            0.5,
          ),
        ],
      }),
    ];

    const lines = describeChanges(screenshots);

    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain("content");
    expect(lines[2]).toContain("at center");
    expect(lines[2]).toContain("0.90%");
    expect(lines[2]).toContain("360x200 at (420, 300)");
    expect(lines[3]).toContain("added");
    expect(lines[3]).toContain("at right");
  });

  it("falls back to the raw change type for unknown region types", () => {
    const screenshots = [
      changedScreenshot("a", {
        totalRegions: 1,
        regions: [
          region(
            "SomethingNew",
            "top",
            { x: 0, y: 0, width: 10, height: 10 },
            1,
          ),
        ],
      }),
    ];

    expect(describeChanges(screenshots)[2]).toContain("SomethingNew");
  });

  it("truncates the region list at maxRegions", () => {
    const regions = Array.from({ length: 7 }, (_, index) =>
      region(
        "ColorChange",
        "center",
        { x: index, y: index, width: 10, height: 10 },
        0.1,
      ),
    );

    const lines = describeChanges(
      [changedScreenshot("a", { totalRegions: 7, regions })],
      { maxRegions: 2 },
    );

    // name + summary + 2 regions + truncation notice
    expect(lines).toHaveLength(5);
    expect(lines[4]).toContain("and 5 more regions");
  });

  it("omits the region breakdown when maxRegions is 0", () => {
    const screenshots = [
      changedScreenshot("a", {
        totalRegions: 1,
        regions: [
          region("Deletion", "top", { x: 0, y: 0, width: 10, height: 10 }, 1),
        ],
      }),
    ];

    expect(describeChanges(screenshots, { maxRegions: 0 })).toHaveLength(2);
  });

  it("handles changed screenshots without a sidecar", () => {
    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "e",
        category: "changed",
        actualPath: "actual/e.png",
        expectedPath: "expected/e.png",
        diffPath: "diff/e.png",
      },
    ];

    const lines = describeChanges(screenshots);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("e");
  });
});
