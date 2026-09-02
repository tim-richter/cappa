import { InvalidArgumentError } from "commander";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_REGIONS } from "./describeChanges";
import { parseMaxRegions } from "./parseMaxRegions";

describe("parseMaxRegions", () => {
  it("falls back to the default when the option is omitted", () => {
    expect(parseMaxRegions(undefined)).toBe(DEFAULT_MAX_REGIONS);
  });

  it("parses non-negative integers", () => {
    expect(parseMaxRegions("0")).toBe(0);
    expect(parseMaxRegions("12")).toBe(12);
    expect(parseMaxRegions(" 3 ")).toBe(3);
  });

  it("rejects values that are not non-negative integers", () => {
    for (const value of ["-1", "1.5", "abc", "", "  ", "1e3"]) {
      expect(() => parseMaxRegions(value)).toThrow(InvalidArgumentError);
    }
  });
});
