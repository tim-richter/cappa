import type { PluginTask } from "@cappa/core";
import { describe, expect, it } from "vitest";
import type { StorybookStory } from "./plugin";
import {
  DEFAULT_STORY_WATCH_PATHS,
  normalizeWatchPath,
  resolveStoryTasks,
} from "./watch";

/**
 * A story index in the shape Storybook 8+ serves from `/index.json`, trimmed to
 * the fields the plugin reads. It covers the three cases resolution has to get
 * right: two stories from one file, two files co-located in one directory, and
 * a story whose `importPath` is the file that re-exports it rather than the one
 * that defines it — which is exactly how Storybook indexes a re-export.
 */
const storyIndex = {
  entries: {
    "example-button--primary": {
      id: "example-button--primary",
      title: "Example/Button",
      name: "Primary",
      importPath: "./src/components/Button.stories.tsx",
      type: "story",
    },
    "example-button--secondary": {
      id: "example-button--secondary",
      title: "Example/Button",
      name: "Secondary",
      importPath: "./src/components/Button.stories.tsx",
      type: "story",
    },
    "example-input--default": {
      id: "example-input--default",
      title: "Example/Input",
      name: "Default",
      importPath: "./src/components/Input.stories.tsx",
      type: "story",
    },
    // Declared in `Button.stories.tsx` but re-exported from another file: the
    // index attributes it to the file it is exported *from*.
    "legacy-button--primary": {
      id: "legacy-button--primary",
      title: "Legacy/Button",
      name: "Primary",
      importPath: "./src/legacy/Reexports.stories.ts",
      type: "story",
    },
    // An index entry with no `importPath` at all — an older Storybook, or a
    // hand-written index. It must never match anything.
    "unindexed--story": {
      id: "unindexed--story",
      title: "Unindexed",
      name: "Story",
      type: "story",
    },
  },
} as const;

const tasks: PluginTask<{ story: StorybookStory }>[] = Object.values(
  storyIndex.entries,
).map((story) => ({
  id: story.id,
  url: `http://localhost:6006/iframe.html?id=${story.id}`,
  data: { story: story as unknown as StorybookStory },
}));

describe("resolveStoryTasks", () => {
  it("maps a story file to every story it declares", () => {
    expect(
      resolveStoryTasks("src/components/Button.stories.tsx", tasks),
    ).toEqual(["example-button--primary", "example-button--secondary"]);
  });

  it("does not leak into a co-located story file", () => {
    expect(
      resolveStoryTasks("src/components/Input.stories.tsx", tasks),
    ).toEqual(["example-input--default"]);
  });

  it("resolves a re-exported story to the file that re-exports it", () => {
    expect(resolveStoryTasks("src/legacy/Reexports.stories.ts", tasks)).toEqual(
      ["legacy-button--primary"],
    );
  });

  it("matches an index path written with a leading ./", () => {
    expect(
      resolveStoryTasks("./src/components/Button.stories.tsx", tasks),
    ).toEqual(["example-button--primary", "example-button--secondary"]);
  });

  it("matches when cappa runs above the Storybook project", () => {
    // `importPath` is relative to the Storybook project; the watcher reports
    // paths relative to wherever cappa was started.
    expect(
      resolveStoryTasks(
        "apps/storybook/src/components/Button.stories.tsx",
        tasks,
      ),
    ).toEqual(["example-button--primary", "example-button--secondary"]);
  });

  it("matches an absolute path from the watcher", () => {
    expect(
      resolveStoryTasks(
        "/repo/apps/sb/src/components/Input.stories.tsx",
        tasks,
      ),
    ).toEqual(["example-input--default"]);
  });

  it("normalizes Windows separators", () => {
    expect(
      resolveStoryTasks("src\\components\\Input.stories.tsx", tasks),
    ).toEqual(["example-input--default"]);
  });

  it("returns null for a component the index cannot attribute", () => {
    // The honest answer: the index says nothing about which stories render
    // `Button.tsx`, so the plugin asks for a full re-run rather than guessing.
    expect(resolveStoryTasks("src/components/Button.tsx", tasks)).toBeNull();
  });

  it("returns null for a story file the index has never seen", () => {
    // What a freshly created story looks like until discovery runs again.
    expect(
      resolveStoryTasks("src/components/Badge.stories.tsx", tasks),
    ).toBeNull();
  });

  it("never matches an entry without an importPath", () => {
    expect(resolveStoryTasks("Unindexed", tasks)).toBeNull();
    expect(resolveStoryTasks("", tasks)).toBeNull();
  });

  it("returns null when there are no tasks at all", () => {
    expect(
      resolveStoryTasks("src/components/Button.stories.tsx", []),
    ).toBeNull();
  });
});

describe("normalizeWatchPath", () => {
  it("strips leading ./ and /, and normalizes separators", () => {
    expect(normalizeWatchPath("./src/a.tsx")).toBe("src/a.tsx");
    expect(normalizeWatchPath("/src/a.tsx")).toBe("src/a.tsx");
    expect(normalizeWatchPath("src\\a.tsx")).toBe("src/a.tsx");
  });
});

describe("DEFAULT_STORY_WATCH_PATHS", () => {
  it("covers the story file extensions Storybook indexes by default", () => {
    expect(DEFAULT_STORY_WATCH_PATHS).toContain(
      "**/*.stories.@(js|jsx|mjs|cjs|ts|tsx|mts|cts)",
    );
  });
});
