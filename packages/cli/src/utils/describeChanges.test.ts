import type { InterpretResult, Screenshot } from "@cappa/core";
import { describe, expect, it } from "vitest";
import { describeChanges } from "./describeChanges";

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
