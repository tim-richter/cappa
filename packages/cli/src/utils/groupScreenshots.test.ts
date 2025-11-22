import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { groupScreenshots } from "./groupScreenshots";

it("should find changed screenshots", () => {
  const outputDir = "/home/user/output";
  const name = "Test/Story.png";
  const actualScreenshots = [`${outputDir}/actual/${name}`];
  const expectedScreenshots = [`${outputDir}/expected/${name}`];
  const diffScreenshots = [`${outputDir}/diff/${name}`];

  const id = createHash("sha256").update(name).digest("hex");

  const result = groupScreenshots(
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

it("should find new screenshots", () => {
  const outputDir = "/home/user/output";
  const name = "Test/Story.png";
  const actualScreenshots = [`${outputDir}/actual/${name}`];
  const expectedScreenshots: string[] = [];
  const diffScreenshots: string[] = [];

  const id = createHash("sha256").update(name).digest("hex");

  const result = groupScreenshots(
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

it("should find passed screenshots", () => {
  const outputDir = "/home/user/output";
  const name = "Test/Story.png";
  const actualScreenshots = [`${outputDir}/actual/${name}`];
  const expectedScreenshots = [`${outputDir}/expected/${name}`];
  const diffScreenshots: string[] = [];

  const id = createHash("sha256").update(name).digest("hex");

  const result = groupScreenshots(
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

it("should find deleted screenshots", () => {
  const outputDir = "/home/user/output";
  const name = "Test/Story.png";
  const actualScreenshots: string[] = [];
  const expectedScreenshots = [`${outputDir}/expected/${name}`];
  const diffScreenshots: string[] = [];

  const id = createHash("sha256").update(name).digest("hex");

  const result = groupScreenshots(
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

it("should sort screenshots by category", () => {
  const outputDir = "/home/user/output";
  const screenshots = {
    new: "New/Story.png",
    deleted: "Deleted/Story.png",
    changed: "Changed/Story.png",
    passed: "Passed/Story.png",
  } as const;

  const result = groupScreenshots(
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
