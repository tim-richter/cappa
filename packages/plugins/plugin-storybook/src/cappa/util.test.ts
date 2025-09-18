import { describe, expect, it } from "vitest";
import type { StorybookStory } from "./plugin";
import { buildFilename } from "./util";

describe("buildFilename", () => {
  it("should build a filename for a story", () => {
    const story: StorybookStory = {
      id: "1",
      name: "Primary",
      title: "Story",
      kind: "Kind",
      story: "Story",
      type: "story",
    };

    const filename = buildFilename(story);
    expect(filename).toBe("Story/Primary.png");
  });

  it("should build a filename for a story with a folder", () => {
    const story: StorybookStory = {
      id: "1",
      name: "Primary",
      title: "Folder/Story",
      kind: "Kind",
      story: "Story",
      type: "story",
    };

    const filename = buildFilename(story);
    expect(filename).toBe("Folder/Story/Primary.png");
  });

  it("should build a filename for a story with special characters", () => {
    const story: StorybookStory = {
      id: "1",
      name: "Primary123!@#$%^&*()",
      title: "Story123!@#$%^&*()",
      kind: "Kind",
      story: "Story",
      type: "story",
    };

    const filename = buildFilename(story);
    expect(filename).toBe("Story123/Primary123.png");
  });
});
