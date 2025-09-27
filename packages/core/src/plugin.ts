import type ScreenshotTool from "./screenshot";

/**
 * Plugin function type definition
 */
export type PluginFunction = (screenshotTool: ScreenshotTool) => Promise<any[]>;

/**
 * Plugin definition interface
 */
export type PluginDef = {
  name: string;
  description: string;
  execute: PluginFunction;
};

/**
 * Plugin function type definition
 */
export type Plugin<Config = any> = (config?: Config) => PluginDef;
