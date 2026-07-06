import type { Screenshot } from "@cappa/core";
import { describe, expect, it } from "vitest";
import { filterScreenshots } from "./approve";

const newScreenshot = (name: string, actualPath?: string): Screenshot => ({
  id: name,
  name,
  category: "new",
  actualPath: actualPath ?? `actual/${name}.png`,
});

describe("filterScreenshots", () => {
  it("matches name case-insensitively when filter is lowercase", () => {
    const screenshots = [newScreenshot("Button/Primary")];
    expect(filterScreenshots(screenshots, ["button"])).toEqual(screenshots);
  });

  it("matches name case-insensitively when filter is mixed case", () => {
    const screenshots = [newScreenshot("Button/Primary")];
    const filters = ["Button/Primary".toUpperCase().toLowerCase()];
    expect(filterScreenshots(screenshots, filters)).toEqual(screenshots);
  });

  it("matches actualPath case-insensitively", () => {
    const screenshots = [newScreenshot("Button/Primary", "actual/Button/Primary.png")];
    expect(filterScreenshots(screenshots, ["button/primary"])).toEqual(
      screenshots,
    );
  });

  it("returns only screenshots that match at least one filter", () => {
    const btn = newScreenshot("Button/Primary");
    const inp = newScreenshot("Input/Default");
    expect(filterScreenshots([btn, inp], ["button"])).toEqual([btn]);
  });

  it("returns empty array when no screenshots match", () => {
    const screenshots = [newScreenshot("Button/Primary")];
    expect(filterScreenshots(screenshots, ["modal"])).toEqual([]);
  });

  it("matches deleted screenshots by name (no actualPath)", () => {
    const deleted: Screenshot = {
      id: "Button/Primary",
      name: "Button/Primary",
      category: "deleted",
      expectedPath: "expected/Button/Primary.png",
    };
    expect(filterScreenshots([deleted], ["button"])).toEqual([deleted]);
  });
});
