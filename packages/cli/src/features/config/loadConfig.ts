import fs from "node:fs";
import path from "node:path";
import type { defineConfig, UserConfig } from "@cappa/core";
import { createJiti } from "jiti";

export type ConfigResult = {
  filepath: string;
  config: ReturnType<typeof defineConfig> | UserConfig;
};

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

export async function loadConfig(): Promise<ConfigResult> {
  const configPath = path.resolve(process.cwd(), "cappa.config.ts");

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
