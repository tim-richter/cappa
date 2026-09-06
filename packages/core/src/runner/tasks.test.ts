import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  glob: vi.fn(),
}));

import { glob } from "node:fs/promises";
import {
  didScreenshotFail,
  filterTasks,
  getDeletedScreenshots,
  selectTasks,
  toTaskStatus,
} from "./tasks";

describe("didScreenshotFail", () => {
  it("returns false for a non-object result", () => {
    expect(didScreenshotFail(null)).toBe(false);
    expect(didScreenshotFail("string")).toBe(false);
    expect(didScreenshotFail(42)).toBe(false);
  });

  it("returns true when result has a non-null error", () => {
    expect(didScreenshotFail({ error: "oops" })).toBe(true);
    expect(didScreenshotFail({ error: new Error("boom") })).toBe(true);
  });

  it("returns false when error is null/undefined", () => {
    expect(didScreenshotFail({ error: null })).toBe(false);
    expect(didScreenshotFail({ error: undefined })).toBe(false);
  });

  it("returns true when success is explicitly false", () => {
    expect(didScreenshotFail({ success: false })).toBe(true);
  });

  it("returns false when success is true (comparison passed)", () => {
    expect(
      didScreenshotFail({ success: true, filepath: "/some/path.png" }),
    ).toBe(false);
  });

  it("returns true when filepath is missing and not skipped (new screenshot with failed capture)", () => {
    expect(didScreenshotFail({ filepath: undefined, skipped: false })).toBe(
      true,
    );
  });

  it("returns false when skipped is true even without filepath", () => {
    expect(didScreenshotFail({ filepath: undefined, skipped: true })).toBe(
      false,
    );
  });
});

describe("toTaskStatus", () => {
  it("reports a skipped task", () => {
    expect(toTaskStatus({ skipped: true })).toBe("skipped");
  });

  it("reports an errored task as failed", () => {
    expect(toTaskStatus({ error: "boom" })).toBe("failed");
  });

  it("reports a screenshot without a baseline as new", () => {
    expect(toTaskStatus({ isNew: true, filepath: "/a.png" })).toBe("new");
  });

  it("reports a failing comparison as changed", () => {
    expect(toTaskStatus({ success: false, filepath: "/a.png" })).toBe(
      "changed",
    );
  });

  it("reports a missing filepath as failed", () => {
    expect(toTaskStatus({ filepath: undefined })).toBe("failed");
  });

  it("reports a passing comparison as passed", () => {
    expect(toTaskStatus({ success: true, filepath: "/a.png" })).toBe("passed");
  });

  it("treats a non-object result as passed", () => {
    expect(toTaskStatus(undefined)).toBe("passed");
  });
});

describe("filterTasks", () => {
  const tasks = [
    { id: "button--primary", url: "http://localhost:6006" },
    { id: "button--secondary", url: "http://localhost:6006" },
    { id: "card--default", url: "http://localhost:6006" },
    { id: "card--with-image", url: "http://localhost:6006" },
    { id: "header--logged-in", url: "http://localhost:6006" },
  ];

  it("filters tasks matching a glob pattern with wildcard", () => {
    const result = filterTasks(tasks, "button*");
    expect(result.map((t) => t.id)).toEqual([
      "button--primary",
      "button--secondary",
    ]);
  });

  it("filters tasks matching an exact id", () => {
    const result = filterTasks(tasks, "card--default");
    expect(result.map((t) => t.id)).toEqual(["card--default"]);
  });

  it("returns empty array when no tasks match", () => {
    const result = filterTasks(tasks, "footer*");
    expect(result).toEqual([]);
  });

  it("returns all tasks when pattern matches everything", () => {
    const result = filterTasks(tasks, "*");
    expect(result).toHaveLength(5);
  });

  it("supports character class patterns", () => {
    const result = filterTasks(tasks, "card--*image");
    expect(result.map((t) => t.id)).toEqual(["card--with-image"]);
  });
});

describe("selectTasks", () => {
  const tasks = [
    { id: "a", url: "u" },
    { id: "b", url: "u" },
    { id: "c", url: "u" },
  ];

  it("keeps only the requested ids", () => {
    expect(selectTasks(tasks, ["a", "c"]).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("ignores ids that were not discovered", () => {
    expect(selectTasks(tasks, ["a", "zzz"]).map((t) => t.id)).toEqual(["a"]);
  });

  it("returns nothing for an empty selection", () => {
    expect(selectTasks(tasks, [])).toEqual([]);
  });
});

describe("getDeletedScreenshots", () => {
  it("returns empty array when no expected screenshots exist", async () => {
    vi.mocked(glob).mockImplementation(async function* () {} as any);
    expect(await getDeletedScreenshots("/output")).toEqual([]);
  });

  it("returns empty array when all expected screenshots have a matching actual", async () => {
    vi.mocked(glob).mockImplementation(async function* (
      pattern: string | readonly string[],
    ) {
      if ((pattern as string).includes("actual")) {
        yield "/output/actual/button.png";
      } else {
        yield "/output/expected/button.png";
      }
    } as any);
    expect(await getDeletedScreenshots("/output")).toEqual([]);
  });

  it("returns the deleted relative path when an expected screenshot has no matching actual", async () => {
    vi.mocked(glob).mockImplementation(async function* (
      pattern: string | readonly string[],
    ) {
      if ((pattern as string).includes("actual")) {
        // no actual screenshots
      } else {
        yield "/output/expected/button.png";
      }
    } as any);
    expect(await getDeletedScreenshots("/output")).toEqual(["button.png"]);
  });

  it("returns only the missing paths when some expected screenshots are absent from actual", async () => {
    vi.mocked(glob).mockImplementation(async function* (
      pattern: string | readonly string[],
    ) {
      if ((pattern as string).includes("actual")) {
        yield "/output/actual/button.png";
      } else {
        yield "/output/expected/button.png";
        yield "/output/expected/card.png";
      }
    } as any);
    expect(await getDeletedScreenshots("/output")).toEqual(["card.png"]);
  });
});
