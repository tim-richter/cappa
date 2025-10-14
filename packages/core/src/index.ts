import { defineConfig } from "./config";
import { ScreenshotFileSystem } from "./filesystem";
import type { Plugin, PluginDef, PluginFunction } from "./plugin";
import ScreenshotTool from "./screenshot";
import type { Screenshot, ScreenshotOptions, UserConfig } from "./types";

export {
  ScreenshotTool,
  ScreenshotFileSystem,
  defineConfig,
  type PluginFunction,
  type Plugin,
  type PluginDef,
  type UserConfig,
  type ScreenshotOptions,
  type Screenshot,
};
