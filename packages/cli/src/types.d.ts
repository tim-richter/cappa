/**
 * TypeScript type definitions for Cappa CLI configuration
 */

export interface BrowserConfig {
  type?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
}

export interface ScreenshotConfig {
  outputDir?: string;
  viewport?: {
    width: number;
    height: number;
  };
  fullPage?: boolean;
}

export interface PluginConfig {
  name?: string;
  path?: string;
  options?: Record<string, any>;
}

export interface CappaConfig {
  browser?: BrowserConfig;
  screenshot?: ScreenshotConfig;
  plugins?: (string | PluginConfig)[];
}

/**
 * Define a Cappa configuration
 * @param config - Configuration object
 * @returns The configuration object
 */
export function defineConfig(config: CappaConfig): CappaConfig;
