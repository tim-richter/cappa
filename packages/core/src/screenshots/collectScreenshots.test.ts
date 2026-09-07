import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn<() => Promise<string>>(async () => {
    throw new Error("ENOENT");
  }),
}));

vi.mock("node:fs/promises", () => ({
  glob: vi.fn(),
  default: { readFile: readFileMock },
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

/** Stand in for a `.cappa-manifest.json` on disk. */
const mockManifest = (screenshots: Record<string, unknown>) => {
  readFileMock.mockImplementation(async () =>
    JSON.stringify({ version: 1, screenshots }),
  );
};

describe("collectScreenshots", () => {
  beforeEach(() => {
    vi.mocked(glob).mockReset();
    readFileMock.mockReset();
    readFileMock.mockImplementation(async () => {
      throw new Error("ENOENT");
    });
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

describe("collectScreenshots and the capture manifest", () => {
  beforeEach(() => {
    vi.mocked(glob).mockReset();
    readFileMock.mockReset();
  });

  it("attaches the task a screenshot came from", async () => {
    mockGlob({
      actual: [`${outputDir}/actual/example/button/primary.png`],
      expected: [`${outputDir}/expected/example/button/primary.png`],
    });
    // Storybook: the name and the task id have nothing in common, so without
    // the manifest a client has no way to re-capture just this screenshot.
    mockManifest({
      "example/button/primary": {
        taskId: "example-button--primary",
        plugin: "StorybookPlugin",
      },
    });

    const [screenshot] = await collectScreenshots(outputDir);

    expect(screenshot).toMatchObject({
      name: "example/button/primary",
      taskId: "example-button--primary",
      plugin: "StorybookPlugin",
    });
  });

  it("leaves taskId unset for a screenshot the manifest does not know", async () => {
    mockGlob({ actual: [`${outputDir}/actual/legacy.png`] });
    mockManifest({});

    const [screenshot] = await collectScreenshots(outputDir);

    // Never a fallback to `name`: that guess is what the server rejects.
    expect(screenshot?.taskId).toBeUndefined();
  });

  it("survives an unreadable manifest", async () => {
    mockGlob({ actual: [`${outputDir}/actual/a.png`] });
    readFileMock.mockImplementation(async () => "{{{ not json");

    const screenshots = await collectScreenshots(outputDir);

    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]?.taskId).toBeUndefined();
  });
});
