import type { Plugin, PluginDef } from "./plugin";

export type PossiblePromise<T> = Promise<T> | T;

export interface DiffConfig {
  /**
   * Matching threshold (0-1). Lower = more sensitive
   * Default = 0.1
   *
   * This affects how similar a pixel needs to be to the reference image to be considered the same.
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
   * The project root directory, which can be either an absolute path or a path relative to the location of your `cappa.config.ts` file.
   * @default process.cwd()
   */
  root?: string;
  outputDir?: string;
  diff?: DiffConfig;
  /**
   * An array of Cappa plugins used for generation. Each plugin may have additional configurable options (defined within the plugin itself). If a plugin relies on another plugin, an error will occur if the required dependency is missing. Refer to "pre" for more details.
   */
  plugins?: Array<Plugin | PluginDef>;
};

export type ScreenshotOptions = {
  fullPage?: boolean;
  waitForSelector?: string;
  waitForTimeout?: number;
  delay?: number;
  skip?: boolean;
  mask?: string[];
  omitBackground?: boolean;
};

export interface Exposed {
  emitCapture(opt: ScreenshotOptions): void;
  getBaseScreenshotOptions(): ScreenshotOptions;
  waitBrowserMetricsStable(): Promise<void>;
}

export interface Screenshot {
  id: string;
  name: string;
  category: "new" | "deleted" | "changed" | "passed";
  actualPath?: string;
  expectedPath?: string;
  diffPath?: string;
  approved?: boolean;
}
