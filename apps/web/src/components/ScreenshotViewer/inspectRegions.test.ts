import { beforeEach, describe, expect, it } from "vitest";
import {
  createInspectRegion,
  INSPECT_REGIONS_STORAGE_KEY,
  isRegionOutside,
  parseCoordinate,
  persistRegions,
  readPersistedRegions,
  regionStyle,
} from "./inspectRegions";

const size = { width: 1200, height: 800 };

describe("parseCoordinate", () => {
  it("reads a typed number", () => {
    expect(parseCoordinate("378")).toBe(378);
    expect(parseCoordinate(" 40 ")).toBe(40);
    expect(parseCoordinate("-12")).toBe(-12);
  });

  it("rounds a fractional coordinate to a pixel", () => {
    expect(parseCoordinate("12.6")).toBe(13);
  });

  it("returns null rather than zero for input that is not a number", () => {
    // A cleared field must leave the region where it is instead of snapping
    // the box to the top-left corner while the user retypes it.
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate("   ")).toBeNull();
    expect(parseCoordinate("abc")).toBeNull();
    expect(parseCoordinate("Infinity")).toBeNull();
  });
});

describe("regionStyle", () => {
  it("positions a region as percentages of the image's pixel size", () => {
    expect(
      regionStyle(
        createInspectRegion({ x: 378, y: 488, width: 264, height: 340 }),
        size,
      ),
    ).toEqual({
      left: "31.5%",
      top: "61%",
      width: "22%",
      height: "42.5%",
    });
  });
});

describe("isRegionOutside", () => {
  it("accepts a region that fits", () => {
    expect(
      isRegionOutside(
        createInspectRegion({ x: 0, y: 0, width: 1200, height: 800 }),
        size,
      ),
    ).toBe(false);
  });

  it("flags a region that runs past an edge", () => {
    expect(
      isRegionOutside(
        createInspectRegion({ x: 1100, y: 0, width: 200, height: 100 }),
        size,
      ),
    ).toBe(true);
    expect(
      isRegionOutside(
        createInspectRegion({ x: -10, y: 0, width: 100, height: 100 }),
        size,
      ),
    ).toBe(true);
  });
});

describe("createInspectRegion", () => {
  it("gives every region its own id", () => {
    expect(createInspectRegion().id).not.toBe(createInspectRegion().id);
  });
});

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips regions", () => {
    const regions = [createInspectRegion({ x: 10, y: 20 })];
    persistRegions(regions);
    expect(readPersistedRegions()).toEqual(regions);
  });

  it("ignores stored values that are not regions", () => {
    // Storage is shared with whatever the user's browser did to it before, so
    // a malformed entry must read as "no regions" rather than crashing the
    // screenshot page on mount.
    localStorage.setItem(INSPECT_REGIONS_STORAGE_KEY, "not json");
    expect(readPersistedRegions()).toEqual([]);

    localStorage.setItem(INSPECT_REGIONS_STORAGE_KEY, '{"x":1}');
    expect(readPersistedRegions()).toEqual([]);

    localStorage.setItem(
      INSPECT_REGIONS_STORAGE_KEY,
      '[{"id":"a","x":1,"y":2,"width":3,"height":4},{"id":"b"}]',
    );
    expect(readPersistedRegions()).toEqual([
      { id: "a", x: 1, y: 2, width: 3, height: 4 },
    ]);
  });
});
