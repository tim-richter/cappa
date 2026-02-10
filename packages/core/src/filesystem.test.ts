import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PNG } from "./features/png/png";
import { ScreenshotFileSystem } from "./filesystem";

let tempDir: string;

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

  it("approves screenshots from absolute actual paths and removes diffs", () => {
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

    const result = fileSystem.approveFromActualPath(actualPath);

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

    fs.writeFileSync(actualPath, actualPng.toBuffer());

    const diffPng = PNG.create(1, 1);
    diffPng.setMetadata("cappa.diff.algorithm", "pixel");
    diffPng.setMetadata("cappa.diff.threshold", "0.2");
    fs.writeFileSync(diffPath, diffPng.toBuffer());

    fileSystem.approveFromActualPath(actualPath);

    const expectedPng = await PNG.load(expectedPath);

    expect(expectedPng.metadata).toMatchObject({
      "cappa.diff.algorithm": "pixel",
      "cappa.diff.threshold": "0.2",
    });
  });

  it("approves screenshots by logical name", () => {
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

    const { expectedPath } = fileSystem.approveByName("pages/home/hero");

    expect(fs.readFileSync(expectedPath, "utf-8")).toBe("hero");
  });
});
