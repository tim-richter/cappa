import { defineConfig } from "./config";
import type { Plugin, PluginDef, PluginFunction } from "./plugin";
import ScreenshotTool from "./screenshot";
import type {
  Exposed,
  Screenshot,
  ScreenshotOptions,
  UserConfig,
} from "./types";

export {
  ScreenshotTool,
  defineConfig,
  type PluginFunction,
  type Plugin,
  type PluginDef,
  type UserConfig,
  type ScreenshotOptions,
  type Exposed,
  type Screenshot,
};
