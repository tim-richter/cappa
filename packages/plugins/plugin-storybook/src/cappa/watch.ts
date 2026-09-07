import type { PluginTask } from "@cappa/core";
import type { StorybookStory } from "./plugin";

/**
 * Globs whose changes this plugin can map precisely.
 *
 * These mirror Storybook's own default `stories` patterns rather than being
 * read from the project's config: the plugin talks to a *running* Storybook
 * over HTTP and never sees its config file. They only widen what a watch
 * session watches — resolution itself is driven by the story index, which is
 * the authority on which files produce which stories.
 */
export const DEFAULT_STORY_WATCH_PATHS = [
  "**/*.stories.@(js|jsx|mjs|cjs|ts|tsx|mts|cts)",
  "**/*.story.@(js|jsx|mjs|cjs|ts|tsx|mts|cts)",
];

/** Compare paths written by different tools: `./src/a.tsx`, `src\\a.tsx`, `/abs/src/a.tsx`. */
export const normalizeWatchPath = (file: string): string =>
  file.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");

/**
 * Whether a changed file and a story index `importPath` name the same file.
 *
 * Suffix matching in both directions, because the two are relative to roots
 * nobody here knows: `importPath` is relative to the Storybook project, and the
 * changed file is relative to wherever `cappa` was started — which in a
 * monorepo is routinely a directory above it. Over-matching costs a few extra
 * screenshots; under-matching silently misses the regression being hunted.
 */
const isSameFile = (file: string, importPath: string): boolean => {
  const changed = normalizeWatchPath(file);
  const imported = normalizeWatchPath(importPath);

  return (
    changed === imported ||
    changed.endsWith(`/${imported}`) ||
    imported.endsWith(`/${changed}`)
  );
};

type StoryTaskData = { story: Pick<StorybookStory, "importPath"> };

/**
 * Map a changed file onto the story ids it produces.
 *
 * `null` — "cannot tell, re-run everything" — for any file the index does not
 * attribute a story to. That covers the component a story renders, which is the
 * common case and genuinely unmappable from the index; it also covers a story
 * file the index has never seen, which is what a freshly created story looks
 * like until discovery runs again. Returning "nothing to do" for that second
 * case would mean saving a new story and watching nothing happen.
 */
export const resolveStoryTasks = (
  file: string,
  tasks: PluginTask<StoryTaskData>[],
): string[] | null => {
  const affected = tasks
    .filter((task) => {
      const importPath = task.data?.story?.importPath;
      return typeof importPath === "string" && isSameFile(file, importPath);
    })
    .map((task) => task.id);

  return affected.length > 0 ? affected : null;
};
