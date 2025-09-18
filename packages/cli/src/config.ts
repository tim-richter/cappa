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
    console.error(`Error loading config from ${configPath}:`, error.message);
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
