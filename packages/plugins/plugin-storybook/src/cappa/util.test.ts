import { describe, expect, it } from "vitest";
import type { StorybookStory } from "./plugin";
import { buildFilename } from "./util";

const makeStory = (
  overrides: Partial<StorybookStory> = {},
): StorybookStory => ({
  id: "1",
  name: "Primary",
  title: "Story",
  kind: "Kind",
  story: "Story",
  type: "story",
  ...overrides,
});

describe("buildFilename", () => {
  it("should build a filename for a story", () => {
    const filename = buildFilename(makeStory());
    expect(filename).toBe("story/primary.png");
  });

  it("should build a filename for a story with a folder", () => {
    const filename = buildFilename(
      makeStory({ title: "Folder/Story", name: "Primary" }),
    );
    expect(filename).toBe("folder/story/primary.png");
  });

  it("should build a filename for a story with special characters", () => {
    const filename = buildFilename(
      makeStory({
        title: "Story123!@#$%^&*()",
        name: "Primary123!@#$%^&*()",
      }),
    );
    expect(filename).toBe("story123/primary123.png");
  });

  it("should normalize case to lowercase", () => {
    const filename = buildFilename(
      makeStory({
        title: "features/keys/pages/Create/components/ValueTypeChangeDialog",
        name: "Default",
      }),
    );
    expect(filename).toBe(
      "features/keys/pages/create/components/valuetypechangedialog/default.png",
    );
  });

  it("should produce the same filename regardless of title casing", () => {
    const upper = buildFilename(
      makeStory({
        title: "features/keys/pages/Create/components/ValueTypeChangeDialog",
        name: "Default",
      }),
    );
    const lower = buildFilename(
      makeStory({
        title: "features/keys/pages/create/components/valuetypechangedialog",
        name: "Default",
      }),
    );
    expect(upper).toBe(lower);
  });

  it("should strip hyphens so kebab-case and camelCase produce the same filename", () => {
    const kebab = buildFilename(
      makeStory({
        title: "components/value-type-change-dialog",
        name: "Default",
      }),
    );
    const camel = buildFilename(
      makeStory({
        title: "components/ValueTypeChangeDialog",
        name: "Default",
      }),
    );
    expect(kebab).toBe(camel);
  });
});
