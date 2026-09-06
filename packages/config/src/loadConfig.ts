import fs from "node:fs";
import path from "node:path";
import type { defineConfig, UserConfig } from "@cappa/core";
import { createJiti } from "jiti";

export type ConfigResult = {
  filepath: string;
  config: ReturnType<typeof defineConfig> | UserConfig;
};

export type LoadConfigOptions = {
  /**
   * Directory to look for `cappa.config.ts` in.
   * @default process.cwd()
   */
  cwd?: string;
};

export const CONFIG_FILENAME = "cappa.config.ts";

const tsLoader = async (configFile: string) => {
  const jiti = createJiti(import.meta.url, {
    jsx: {
      runtime: "automatic",
      importSource: "@cappa/core",
    },
    sourceMaps: true,
  });

  const mod = await jiti.import(configFile, { default: true });

  return mod;
};

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<ConfigResult> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = path.resolve(cwd, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      "Config not found. Please create a cappa.config.ts file in the current directory.",
    );
  }

  try {
    const config = await tsLoader(configPath);

    if (!config) {
      throw new Error(
        "Config file is empty or does not export a valid configuration.",
      );
    }

    return {
      filepath: configPath,
      config,
    };
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
