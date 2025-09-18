import type { ConsolaInstance } from "consola";
import type ScreenshotTool from "./screenshot";

/**
 * Plugin function type definition
 */
export type PluginFunction = (
  screenshotTool: ScreenshotTool,
  logger: ConsolaInstance,
) => Promise<any[]>;

/**
 * Plugin definition interface
 */
export type PluginDef = {
  name: string;
  description: string;
  version: string;
  execute: PluginFunction;
  validateOptions?: (options: any) => boolean;
};

/**
 * Plugin function type definition
 */
export type Plugin<Config = any> = (config?: Config) => PluginDef;
