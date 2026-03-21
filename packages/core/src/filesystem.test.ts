import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initLogger } from "@cappa/logger";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PNG } from "./features/png/png";
import { ScreenshotFileSystem } from "./filesystem";
import type { Screenshot } from "./types";

const pixelDiff = {
  type: "pixel" as const,
  threshold: 0.1,
  includeAA: false,
  fastBufferCheck: true,
  maxDiffPixels: 0,
  maxDiffPercentage: 0,
};

let tempDir: string;

beforeAll(() => {
  initLogger(0);
});

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cappa-fs-"));
  fs.mkdirSync(path.join(tempDir, "actual"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "expected"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "diff"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("ScreenshotFileSystem", () => {
  it("clears existing actual and diff directories", () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);

    const actualFile = path.join(tempDir, "actual", "example.png");
    const diffFile = path.join(tempDir, "diff", "example.png");

    fs.writeFileSync(actualFile, "actual");
    fs.writeFileSync(diffFile, "diff");

    fileSystem.clearActual();
    fileSystem.clearDiff();

    expect(fs.existsSync(path.join(tempDir, "actual"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "diff"))).toBe(false);
  });

  it("approves screenshots from absolute actual paths and removes diffs", async () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);

    const actualPath = path.join(tempDir, "actual", "component", "button.png");
    const expectedPath = path.join(
      tempDir,
      "expected",
      "component",
      "button.png",
    );
    const diffPath = path.join(tempDir, "diff", "component", "button.png");

    fs.mkdirSync(path.dirname(actualPath), { recursive: true });
    fs.mkdirSync(path.dirname(diffPath), { recursive: true });

    fs.writeFileSync(actualPath, "button");
    fs.writeFileSync(diffPath, "diff");

    const result = await fileSystem.approveFromActualPath(actualPath);

    expect(fs.readFileSync(expectedPath, "utf-8")).toBe("button");
    expect(fs.existsSync(diffPath)).toBe(false);
    expect(result).toEqual({
      actualPath,
      expectedPath,
      diffPath,
    });
  });

  it("copies diff metadata onto approved expected screenshots", async () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);

    const actualPath = path.join(tempDir, "actual", "component", "card.png");
    const diffPath = path.join(tempDir, "diff", "component", "card.png");
    const expectedPath = path.join(
      tempDir,
      "expected",
      "component",
      "card.png",
    );

    fs.mkdirSync(path.dirname(actualPath), { recursive: true });
    fs.mkdirSync(path.dirname(diffPath), { recursive: true });

    const actualPng = PNG.create(1, 1);
    actualPng.data[0] = 10;
    actualPng.data[1] = 20;
    actualPng.data[2] = 30;
    actualPng.data[3] = 255;

    fs.writeFileSync(actualPath, await actualPng.toBuffer());

    const diffPng = PNG.create(1, 1);
    diffPng.setMetadata("cappa.diff.algorithm", "pixel");
    diffPng.setMetadata("cappa.diff.threshold", "0.2");
    fs.writeFileSync(diffPath, await diffPng.toBuffer());

    await fileSystem.approveFromActualPath(actualPath);

    const expectedPng = await PNG.load(expectedPath);

    expect(expectedPng.metadata).toMatchObject({
      "cappa.diff.algorithm": "pixel",
      "cappa.diff.threshold": "0.2",
    });
  });

  it("approves screenshots by logical name", async () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);

    const actualPath = path.join(
      tempDir,
      "actual",
      "pages",
      "home",
      "hero.png",
    );
    fs.mkdirSync(path.dirname(actualPath), { recursive: true });
    fs.writeFileSync(actualPath, "hero");

    const { expectedPath } = await fileSystem.approveByName("pages/home/hero");

    expect(fs.readFileSync(expectedPath, "utf-8")).toBe("hero");
  });
});

describe("ScreenshotFileSystem.approveScreenshots", () => {
  it("promotes new screenshots to expected", async () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);
    const actualPath = path.join(tempDir, "actual", "a.png");
    fs.writeFileSync(actualPath, "a");

    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "a",
        category: "new",
        actualPath: "actual/a.png",
      },
    ];

    await fileSystem.approveScreenshots(screenshots, pixelDiff);

    expect(
      fs.readFileSync(path.join(tempDir, "expected", "a.png"), "utf-8"),
    ).toBe("a");
  });

  it("removes expected files for deleted screenshots", async () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);
    const expectedPath = path.join(tempDir, "expected", "gone.png");
    fs.writeFileSync(expectedPath, "old");

    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "gone",
        category: "deleted",
        expectedPath: "expected/gone.png",
      },
    ];

    await fileSystem.approveScreenshots(screenshots, pixelDiff);

    expect(fs.existsSync(expectedPath)).toBe(false);
  });

  it("removes diff and promotes actual for changed screenshots", async () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);
    const actualPath = path.join(tempDir, "actual", "c.png");
    const diffPath = path.join(tempDir, "diff", "c.png");
    fs.writeFileSync(actualPath, "new");
    fs.writeFileSync(diffPath, "diff");

    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "c",
        category: "changed",
        actualPath: "actual/c.png",
        expectedPath: "expected/c.png",
        diffPath: "diff/c.png",
      },
    ];

    await fileSystem.approveScreenshots(screenshots, pixelDiff);

    expect(fs.existsSync(diffPath)).toBe(false);
    expect(
      fs.readFileSync(path.join(tempDir, "expected", "c.png"), "utf-8"),
    ).toBe("new");
  });

  it("does not copy when passed screenshots match", async () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);

    const png = PNG.create(2, 2);
    png.data.fill(128);
    const buf = await png.toBuffer();

    const actualPath = path.join(tempDir, "actual", "p.png");
    const expectedPath = path.join(tempDir, "expected", "p.png");
    fs.writeFileSync(actualPath, buf);
    fs.writeFileSync(expectedPath, buf);

    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "p",
        category: "passed",
        actualPath: "actual/p.png",
        expectedPath: "expected/p.png",
      },
    ];

    await fileSystem.approveScreenshots(screenshots, pixelDiff);

    expect(fs.readFileSync(expectedPath)).toEqual(buf);
  });

  it("promotes actual to expected when passed screenshots differ", async () => {
    const fileSystem = new ScreenshotFileSystem(tempDir);

    const actualPng = PNG.create(1, 1);
    actualPng.data[0] = 255;
    actualPng.data[1] = 0;
    actualPng.data[2] = 0;
    actualPng.data[3] = 255;

    const expectedPng = PNG.create(1, 1);
    expectedPng.data[0] = 0;
    expectedPng.data[1] = 255;
    expectedPng.data[2] = 0;
    expectedPng.data[3] = 255;

    const actualPath = path.join(tempDir, "actual", "p.png");
    const expectedPath = path.join(tempDir, "expected", "p.png");
    fs.writeFileSync(actualPath, await actualPng.toBuffer());
    fs.writeFileSync(expectedPath, await expectedPng.toBuffer());

    const screenshots: Screenshot[] = [
      {
        id: "1",
        name: "p",
        category: "passed",
        actualPath: "actual/p.png",
        expectedPath: "expected/p.png",
      },
    ];

    await fileSystem.approveScreenshots(screenshots, pixelDiff);

    expect(fs.readFileSync(expectedPath)).toEqual(fs.readFileSync(actualPath));
  });
});
