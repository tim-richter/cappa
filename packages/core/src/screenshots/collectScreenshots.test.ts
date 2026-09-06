import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  glob: vi.fn(),
}));

vi.mock("../filesystem", () => ({
  readDiffMeta: vi.fn(async () => undefined),
}));

import { glob } from "node:fs/promises";
import { collectScreenshots } from "./collectScreenshots";

const outputDir = "/screenshots";

const mockGlob = (files: Record<string, string[]>) => {
  vi.mocked(glob).mockImplementation(async function* (pattern: string) {
    for (const [dir, entries] of Object.entries(files)) {
      if (pattern.startsWith(path.resolve(outputDir, dir))) {
        yield* entries;
      }
    }
  } as any);
};

describe("collectScreenshots", () => {
  beforeEach(() => {
    vi.mocked(glob).mockReset();
  });

  it("returns an empty list when nothing has been captured", async () => {
    mockGlob({});

    expect(await collectScreenshots(outputDir)).toEqual([]);
  });

  it("groups actual, expected and diff files into screenshots", async () => {
    mockGlob({
      actual: [
        `${outputDir}/actual/changed.png`,
        `${outputDir}/actual/new.png`,
      ],
      expected: [
        `${outputDir}/expected/changed.png`,
        `${outputDir}/expected/deleted.png`,
      ],
      diff: [`${outputDir}/diff/changed.png`],
    });

    const screenshots = await collectScreenshots(outputDir);

    expect(
      screenshots.map(({ name, category }) => ({ name, category })),
    ).toEqual([
      { name: "new", category: "new" },
      { name: "deleted", category: "deleted" },
      { name: "changed", category: "changed" },
    ]);
  });
});
