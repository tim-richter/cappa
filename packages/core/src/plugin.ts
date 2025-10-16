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
};

/**
 * Plugin function type definition
 */
export type Plugin<Config = any> = (config?: Config) => PluginDef;
