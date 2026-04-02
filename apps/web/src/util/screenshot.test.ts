import type { Screenshot } from "@cappa/core";
import { describe, expect, it } from "vitest";
import { findPreviewScreenshot } from "./screenshot";

const base: Screenshot = {
  id: "1",
  name: "test",
  category: "new",
};

describe("findPreviewScreenshot", () => {
  it("returns actualPath for new screenshots", () => {
    const screenshot: Screenshot = {
      ...base,
      category: "new",
      actualPath: "/actual.png",
    };
    expect(findPreviewScreenshot(screenshot)).toBe("/actual.png");
  });

  it("returns expectedPath for deleted screenshots", () => {
    const screenshot: Screenshot = {
      ...base,
      category: "deleted",
      expectedPath: "/expected.png",
    };
    expect(findPreviewScreenshot(screenshot)).toBe("/expected.png");
  });

  it("returns diffPath for changed screenshots", () => {
    const screenshot: Screenshot = {
      ...base,
      category: "changed",
      actualPath: "/actual.png",
      expectedPath: "/expected.png",
      diffPath: "/diff.png",
    };
    expect(findPreviewScreenshot(screenshot)).toBe("/diff.png");
  });

  it("returns expectedPath for passed screenshots", () => {
    const screenshot: Screenshot = {
      ...base,
      category: "passed",
      actualPath: "/actual.png",
      expectedPath: "/expected.png",
    };
    expect(findPreviewScreenshot(screenshot)).toBe("/expected.png");
  });

  it("returns undefined when actualPath is missing for new screenshots", () => {
    const screenshot: Screenshot = { ...base, category: "new" };
    expect(findPreviewScreenshot(screenshot)).toBeUndefined();
  });
});
