import { createHash } from "crypto";
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
      actualPath: `${outputDir}/actual/${name}`,
      expectedPath: `${outputDir}/expected/${name}`,
      diffPath: `${outputDir}/diff/${name}`,
      approved: false,
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
      actualPath: `${outputDir}/actual/${name}`,
      approved: false,
      expectedPath: undefined,
      diffPath: undefined,
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
      actualPath: `${outputDir}/actual/${name}`,
      expectedPath: `${outputDir}/expected/${name}`,
      diffPath: undefined,
      approved: false,
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
      expectedPath: `${outputDir}/expected/${name}`,
      diffPath: undefined,
      approved: false,
    },
  ]);
});