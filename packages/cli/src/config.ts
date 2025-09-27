import { getLogger } from "@cappa/logger";

/**
 * Configuration system for Cappa CLI
 */

// TypeScript type definitions
export interface BrowserConfig {
  type?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
}

export interface ScreenshotConfig {
  outputDir?: string;
  viewport?: { width: number; height: number };
  fullPage?: boolean;
}

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

export interface PluginConfig {
  name?: string;
  path?: string;
  options?: Record<string, any>;
}

export interface CappaConfig {
  browser?: BrowserConfig;
  screenshot?: ScreenshotConfig;
  diff?: DiffConfig;
  plugins?: (string | PluginConfig)[];
}

/**
 * Define a Cappa configuration
 * @param {CappaConfig} config - Configuration object
 * @returns {CappaConfig} The configuration object
 */
export function defineConfig(config: CappaConfig): CappaConfig {
  return config;
}

/**
 * Default configuration
 */
const defaultConfig: CappaConfig = {
  plugins: [],
  browser: {
    type: "chromium",
    headless: true,
  },
  screenshot: {
    outputDir: "./screenshots",
    viewport: { width: 1920, height: 1080 },
    fullPage: true,
  },
};

/**
 * Merge configuration with defaults
 * @param {CappaConfig} userConfig - User configuration
 * @returns {CappaConfig} Merged configuration
 */
function mergeConfig(userConfig: CappaConfig): CappaConfig {
  return {
    ...defaultConfig,
    ...userConfig,
    browser: {
      ...defaultConfig.browser,
      ...userConfig.browser,
    },
    screenshot: {
      ...defaultConfig.screenshot,
      ...userConfig.screenshot,
    },
  };
}

/**
 * Load configuration from file
 * @param {string} configPath - Path to config file
 * @returns {Promise<CappaConfig>} Configuration object
 */
async function loadConfig(configPath: string): Promise<CappaConfig> {
  try {
    let config: any;
    const path = await import("node:path");
    const resolvedPath = path.resolve(configPath);

    if (configPath.endsWith(".ts") || configPath.endsWith(".js")) {
      // Load TypeScript config using dynamic import
      const module = await import(resolvedPath);
      config = module.default || module;
    } else {
      throw new Error(`Unsupported config file format: ${configPath}`);
    }

    // Handle default export
    if (config.default) {
      config = config.default;
    }

    return mergeConfig(config);
  } catch (error: any) {
    getLogger().error(
      `Error loading config from ${configPath}:`,
      error.message,
    );
    throw error;
  }
}

/**
 * Find configuration file in current directory
 * @returns {string|null} Path to config file or null if not found
 */
async function findConfigFile(): Promise<string | null> {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const configFiles = [
    "cappa.config.ts",
    "cappa.config.js",
    "cappa.config.json",
  ];

  for (const file of configFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

export { defaultConfig, mergeConfig, loadConfig, findConfigFile };
