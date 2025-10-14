import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
