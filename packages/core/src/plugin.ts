import type { Page } from "playwright-core";
import type ScreenshotTool from "./screenshot";

/**
 * Plugin task interface
 */
export type PluginTask<TData = any> = {
  id: string; // unique identifier for logging
  url: string; // url of the task
  data?: TData; // plugin-specific task data
};

/**
 * Plugin function type definition (legacy)
 */
export type PluginFunction = (screenshotTool: ScreenshotTool) => Promise<any[]>;

/**
 * Map a changed file onto the tasks it affects.
 *
 * Called once per changed file, for every file a watch session sees — not only
 * for files matching `PluginWatch.paths`, which exist to widen what is watched
 * rather than to narrow what is asked. A plugin that recognises the file
 * answers with task ids; one that does not answers `null`.
 *
 * @returns the affected task ids, or `null` for "cannot tell" — which re-runs
 * everything this plugin owns. `null` is the honest answer whenever the mapping
 * is uncertain: a resolve that names too few tasks produces a watch mode that
 * silently misses regressions, which is worse than one that re-runs too much.
 */
export type PluginWatchResolve<TData = any> = (
  file: string,
  tasks: PluginTask<TData>[],
) => string[] | null;

/**
 * How a plugin participates in watch mode.
 *
 * Optional on `PluginDef`: a plugin without it contributes its whole task set
 * whenever anything in the watch set changes, which is correct for plugins
 * whose tasks have no local source at all (`@cappa/plugin-pages` captures URLs
 * behind a dev server it knows nothing about).
 */
export type PluginWatch<TData = any> = {
  /**
   * Extra globs, relative to the working directory, added to what the watch
   * session watches. Sources this plugin can map precisely belong here — the
   * session watches the project either way, so these only ever widen the set.
   */
  paths: string[];
  resolve: PluginWatchResolve<TData>;
};

/**
 * Plugin definition interface
 */
export type PluginDef<TResult = any, TContext = any, TData = any> = {
  name: string;
  description: string;

  // Phase 1: Discover all tasks
  discover: (screenshotTool: ScreenshotTool) => Promise<PluginTask<TData>[]>;

  // Phase 2: Execute a single task
  execute: (
    task: PluginTask<TData>,
    page: Page,
    screenshotTool: ScreenshotTool,
    context: TContext,
  ) => Promise<TResult>;

  // Optional: called once per page before executing tasks on that page
  initPage?: (page: Page, screenshotTool: ScreenshotTool) => Promise<TContext>;

  /**
   * Optional: how this plugin maps changed files onto tasks, for
   * `cappa capture --watch` and the review UI's watch toggle.
   */
  watch?: PluginWatch<TData>;
};

/**
 * Plugin function type definition
 */
export type Plugin<Config = any> = (config?: Config) => PluginDef;
