import type { Locator } from "playwright-core";
import type { Plugin, PluginDef } from "./plugin";

export type PossiblePromise<T> = Promise<T> | T;

/**
 * Configuration for the comparison of images
 */
export interface DiffConfig {
  /**
   * Matching threshold (0-1). Lower = more sensitive
   * Default = 0.1
   *
   * This affects how similar a pixel needs to be in the reference image to be considered the same.
   */
  threshold?: number;
  /**
   * Include anti-aliased pixels in diff count
   * Default = false
   *
   * For most users this should be false, because it makes comparisons very sensitive to sub-pixel differences of
   * fonts and other UI elements.
   */
  includeAA?: boolean;
  /**
   * Use fast buffer comparison for identical images
   * Default = true
   */
  fastBufferCheck?: boolean;
  /**
   * Maximum number of different pixels
   * Default = 0
   *
   * The amount of pixels that can be different before the comparison fails.
   */
  maxDiffPixels?: number;
  /**
   * Maximum percentage of pixels different
   * Default = 0
   *
   * The amount of pixels that can be different before the comparison fails as a percentage of the total pixels.
   * 0 = no difference, 100 = 100% difference.
   *
   * Since this is a relative value, it is affected by the size of the images. A 100px image with a 10% difference
   * is 10 pixels different, but a 1000px image with a 10% difference is 100 pixels different. On very large full page screenshots
   * this can mean that small changes still slip through.
   */
  maxDiffPercentage?: number;
}

/**
 * Config used in `cappa.config.ts`
 *
 * @example
 * import { defineConfig } from '@cappa/core'
 * export default defineConfig({
 * ...
 * })
 */
export type UserConfig = {
  /**
   * The directory to save screenshots and other files in
   */
  outputDir?: string;
  /**
   * Configuration for the comparison of images
   */
  diff?: DiffConfig;
  /**
   * The number of times to retry a screenshot if it fails
   */
  retries?: number;
  /**
   * An array of Cappa plugins used for generation.
   * Each plugin may have additional configurable options (defined within the plugin itself).
   */
  plugins?: Array<Plugin | PluginDef>;
};

export type ScreenshotOptions = {
  fullPage?: boolean;
  delay?: number;
  skip?: boolean;
  mask?: Locator[];
  omitBackground?: boolean;
};

export interface Screenshot {
  id: string;
  name: string;
  category: "new" | "deleted" | "changed" | "passed";
  actualPath?: string;
  expectedPath?: string;
  diffPath?: string;
  approved?: boolean;
}
