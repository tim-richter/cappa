import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPathInside,
  resolveInside,
  sanitizeScreenshotFilename,
} from "./paths";

const base = path.resolve("/tmp/screenshots/actual");

describe("isPathInside", () => {
  it("accepts a path nested inside the base", () => {
    expect(isPathInside(base, path.join(base, "a", "b.png"))).toBe(true);
  });

  it("rejects the base itself", () => {
    expect(isPathInside(base, base)).toBe(false);
  });

  it("rejects a traversed path", () => {
    expect(isPathInside(base, path.resolve(base, "../expected/a.png"))).toBe(
      false,
    );
  });

  it("rejects a sibling directory with the base as a prefix", () => {
    expect(isPathInside(base, `${base}-evil/a.png`)).toBe(false);
  });

  it("accepts a filename that merely starts with dots", () => {
    expect(isPathInside(base, path.join(base, "..leading.png"))).toBe(true);
  });
});

describe("resolveInside", () => {
  it("resolves a relative filename inside the base", () => {
    expect(resolveInside(base, "nested/a.png", "actual")).toBe(
      path.join(base, "nested", "a.png"),
    );
  });

  it("rejects a traversing filename", () => {
    expect(() =>
      resolveInside(base, "../../../home/user/evil.png", "actual"),
    ).toThrow(/outside of the actual directory/);
  });

  it("rejects an absolute filename", () => {
    expect(() => resolveInside(base, "/etc/evil.png", "diff")).toThrow(
      /outside of the diff directory/,
    );
  });
});

describe("sanitizeScreenshotFilename", () => {
  it("leaves a nested relative name untouched", () => {
    expect(sanitizeScreenshotFilename("components/button.dark.png")).toBe(
      "components/button.dark.png",
    );
  });

  it("drops traversal segments", () => {
    expect(
      sanitizeScreenshotFilename("../../../../home/user/.config/evil.png"),
    ).toBe("home/user/.config/evil.png");
  });

  it("drops traversal written with backslashes", () => {
    expect(sanitizeScreenshotFilename("..\\..\\evil.png")).toBe("evil.png");
  });

  it("makes an absolute posix path relative", () => {
    expect(sanitizeScreenshotFilename("/etc/evil.png")).toBe("etc/evil.png");
  });

  it("drops a windows drive prefix", () => {
    expect(sanitizeScreenshotFilename("C:\\Windows\\evil.png")).toBe(
      "Windows/evil.png",
    );
  });

  it("drops no-op and empty segments", () => {
    expect(sanitizeScreenshotFilename("./a//./b.png")).toBe("a/b.png");
  });

  it("strips NUL bytes", () => {
    expect(sanitizeScreenshotFilename("a\0b.png")).toBe("ab.png");
  });

  it("returns an empty string when nothing usable is left", () => {
    expect(sanitizeScreenshotFilename("../..")).toBe("");
    expect(sanitizeScreenshotFilename("  ")).toBe("");
  });
});
