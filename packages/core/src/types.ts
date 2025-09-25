import type { Plugin, PluginDef } from "./plugin";

export type PossiblePromise<T> = Promise<T> | T;

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
