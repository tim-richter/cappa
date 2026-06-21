import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DiffMetadata } from "@cappa/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { groupScreenshots } from "./groupScreenshots";

it("should find changed screenshots", async () => {
  const outputDir = "/home/user/output";
  const name = "Test/Story.png";
  const actualScreenshots = [`${outputDir}/actual/${name}`];
  const expectedScreenshots = [`${outputDir}/expected/${name}`];
  const diffScreenshots = [`${outputDir}/diff/${name}`];

  const id = createHash("sha256").update(name).digest("hex");

  const result = await groupScreenshots(
    actualScreenshots,
    expectedScreenshots,
    diffScreenshots,
    outputDir,
  );
  expect(result).toEqual([
    {
      id: id,
      name: "Test/Story",
      category: "changed",
      actualPath: `actual/${name}`,
      expectedPath: `expected/${name}`,
      diffPath: `diff/${name}`,
    },
  ]);
});

it("should find new screenshots", async () => {
  const outputDir = "/home/user/output";
  const name = "Test/Story.png";
  const actualScreenshots = [`${outputDir}/actual/${name}`];
  const expectedScreenshots: string[] = [];
  const diffScreenshots: string[] = [];

  const id = createHash("sha256").update(name).digest("hex");

  const result = await groupScreenshots(
    actualScreenshots,
    expectedScreenshots,
    diffScreenshots,
    outputDir,
  );
  expect(result).toEqual([
    {
      id: id,
      name: "Test/Story",
      category: "new",
      actualPath: `actual/${name}`,
    },
  ]);
});

it("should find passed screenshots", async () => {
  const outputDir = "/home/user/output";
  const name = "Test/Story.png";
  const actualScreenshots = [`${outputDir}/actual/${name}`];
  const expectedScreenshots = [`${outputDir}/expected/${name}`];
  const diffScreenshots: string[] = [];

  const id = createHash("sha256").update(name).digest("hex");

  const result = await groupScreenshots(
    actualScreenshots,
    expectedScreenshots,
    diffScreenshots,
    outputDir,
  );
  expect(result).toEqual([
    {
      id: id,
      name: "Test/Story",
      category: "passed",
      actualPath: `actual/${name}`,
      expectedPath: `expected/${name}`,
      diffPath: undefined,
    },
  ]);
});

it("should find deleted screenshots", async () => {
  const outputDir = "/home/user/output";
  const name = "Test/Story.png";
  const actualScreenshots: string[] = [];
  const expectedScreenshots = [`${outputDir}/expected/${name}`];
  const diffScreenshots: string[] = [];

  const id = createHash("sha256").update(name).digest("hex");

  const result = await groupScreenshots(
    actualScreenshots,
    expectedScreenshots,
    diffScreenshots,
    outputDir,
  );
  expect(result).toEqual([
    {
      id: id,
      name: "Test/Story",
      category: "deleted",
      actualPath: undefined,
      expectedPath: `expected/${name}`,
      diffPath: undefined,
    },
  ]);
});

it("should sort screenshots by category", async () => {
  const outputDir = "/home/user/output";
  const screenshots = {
    new: "New/Story.png",
    deleted: "Deleted/Story.png",
    changed: "Changed/Story.png",
    passed: "Passed/Story.png",
  } as const;

  const result = await groupScreenshots(
    [
      `${outputDir}/actual/${screenshots.new}`,
      `${outputDir}/actual/${screenshots.changed}`,
      `${outputDir}/actual/${screenshots.passed}`,
    ],
    [
      `${outputDir}/expected/${screenshots.deleted}`,
      `${outputDir}/expected/${screenshots.changed}`,
      `${outputDir}/expected/${screenshots.passed}`,
    ],
    [`${outputDir}/diff/${screenshots.changed}`],
    outputDir,
  );

  expect(result.map((screenshot) => screenshot.category)).toEqual([
    "new",
    "deleted",
    "changed",
    "passed",
  ]);
});

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cappa-group-"));
  fs.mkdirSync(path.join(tempDir, "diff", "Test"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

it("attaches diff metadata from the sidecar for changed screenshots", async () => {
  const name = "Test/Story.png";
  const diffImagePath = path.join(tempDir, "diff", name);
  fs.writeFileSync(diffImagePath, "diff");

  const meta: DiffMetadata = {
    numDiffPixels: 10,
    percentDifference: 0.5,
    interpretation: {
      summary: "Minor visual change detected",
      severity: "Low",
      diffCount: 10,
      totalRegions: 1,
      regions: [],
      diffPercentage: 0.5,
      width: 100,
      height: 100,
    },
  };
  fs.writeFileSync(
    path.join(tempDir, "diff", "Test/Story.json"),
    JSON.stringify(meta),
  );

  const result = await groupScreenshots(
    [path.join(tempDir, "actual", name)],
    [path.join(tempDir, "expected", name)],
    [diffImagePath],
    tempDir,
  );

  expect(result).toHaveLength(1);
  const changed = result[0];
  expect(changed?.category).toBe("changed");
  if (changed?.category !== "changed") {
    throw new Error("expected a changed screenshot");
  }
  expect(changed.diffMeta).toEqual(meta);
});
