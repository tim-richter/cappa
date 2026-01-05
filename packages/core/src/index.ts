import { compareImagesGMSD, imagesMatchGMSD } from "./compare/gmsd";
import { compareImages, imagesMatch } from "./compare/pixel";
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
  ChangedScreenshot,
  ConfigEnv,
  DeletedScreenshot,
  DiffConfig,
  DiffConfigGMSD,
  FailedScreenshot,
  NewScreenshot,
  PassedScreenshot,
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
  compareImages,
  compareImagesGMSD,
  imagesMatch,
  imagesMatchGMSD,
  type PluginFunction,
  type Plugin,
  type PluginDef,
  type ConfigEnv,
  type UserConfig,
  type ScreenshotOptions,
  type ScreenshotSettings,
  type ScreenshotVariant,
  type ScreenshotVariantWithUrl,
  type Screenshot,
  type NewScreenshot,
  type DeletedScreenshot,
  type ChangedScreenshot,
  type PassedScreenshot,
  type FailedScreenshot,
  type ScreenshotCaptureResult,
  type ScreenshotCaptureDetails,
  type ScreenshotVariantCaptureDetails,
  type ScreenshotCaptureExtras,
  type Viewport,
  type DiffConfig,
  type DiffConfigGMSD,
};
