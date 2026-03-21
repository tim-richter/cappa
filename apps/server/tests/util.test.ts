import { describe, expect, it } from "vitest";
import { screenshotPathsForFilesystem } from "../src/util";

describe("screenshotPathsForFilesystem", () => {
  it("strips /assets/screenshots/ prefix from paths", () => {
    expect(
      screenshotPathsForFilesystem({
        id: "1",
        name: "a",
        category: "new",
        actualPath: "/assets/screenshots/actual/a.png",
        expectedPath: "/assets/screenshots/expected/a.png",
        diffPath: "/assets/screenshots/diff/a.png",
      }),
    ).toEqual({
      id: "1",
      name: "a",
      category: "new",
      actualPath: "actual/a.png",
      expectedPath: "expected/a.png",
      diffPath: "diff/a.png",
    });
  });

  it("leaves paths unchanged when not prefixed", () => {
    expect(
      screenshotPathsForFilesystem({
        id: "1",
        name: "a",
        category: "new",
        actualPath: "actual/a.png",
      }),
    ).toEqual({
      id: "1",
      name: "a",
      category: "new",
      actualPath: "actual/a.png",
    });
  });
});
