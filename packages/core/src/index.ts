import { defineConfig } from "./config";
import { ScreenshotFileSystem } from "./filesystem";
import type { Plugin, PluginDef, PluginFunction } from "./plugin";
import ScreenshotTool, {
  type ScreenshotCaptureDetails,
  type ScreenshotCaptureExtras,
  type ScreenshotCaptureResult,
  type ScreenshotVariantCaptureDetails,
} from "./screenshot";
import type {
  Screenshot,
  ScreenshotOptions,
  ScreenshotSettings,
  ScreenshotVariant,
  ScreenshotVariantWithUrl,
  UserConfig,
  Viewport,
} from "./types";

export {
  ScreenshotTool,
  ScreenshotFileSystem,
  defineConfig,
  type PluginFunction,
  type Plugin,
  type PluginDef,
  type UserConfig,
  type ScreenshotOptions,
  type ScreenshotSettings,
  type ScreenshotVariant,
  type ScreenshotVariantWithUrl,
  type Screenshot,
  type ScreenshotCaptureResult,
  type ScreenshotCaptureDetails,
  type ScreenshotVariantCaptureDetails,
  type ScreenshotCaptureExtras,
  type Viewport,
};
