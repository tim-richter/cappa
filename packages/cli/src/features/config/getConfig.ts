import type { ConfigEnv, UserConfig } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import { getPlugins, isPromise } from "./getPlugins";
import type { ConfigResult } from "./loadConfig";
import { loadConfig } from "./loadConfig";

type ResolvedUserConfig = Required<Omit<UserConfig, "onFail">> &
  Pick<UserConfig, "onFail">;

/**
 * Converting UserConfig to Config without a change in the object beside the JSON convert.
 */
export async function getConfig(
  loadResult?: ConfigResult,
): Promise<ResolvedUserConfig> {
  const result = loadResult ?? (await loadConfig());

  const configData = result?.config;
  let cappaUserConfig: Promise<UserConfig> = Promise.resolve(
    configData as UserConfig,
  );

  const configEnv: ConfigEnv = {
    command: process.argv[2],
    mode: process.env.NODE_ENV || "development",
    env: process.env,
  };

  // for ts or js files
  if (typeof configData === "function") {
    const possiblePromise = (configData as (env: ConfigEnv) => any)(configEnv);
    if (isPromise(possiblePromise)) {
      cappaUserConfig = possiblePromise as Promise<UserConfig>;
    } else {
      cappaUserConfig = Promise.resolve(possiblePromise as UserConfig);
    }
  }

  const userConfig = await cappaUserConfig;

  if (!userConfig || typeof userConfig === "function") {
    throw new Error("Invalid configuration: no valid config found");
  }

  const configWithDefaults = {
    outputDir: userConfig.outputDir || "./screenshots",
    retries: userConfig.retries || 2,
    concurrency: userConfig.concurrency || 1,
    diff: {
      threshold: userConfig.diff?.threshold || 0.1,
      includeAA: userConfig.diff?.includeAA || false,
      fastBufferCheck: userConfig.diff?.fastBufferCheck || true,
      maxDiffPixels: userConfig.diff?.maxDiffPixels || 0,
      maxDiffPercentage: userConfig.diff?.maxDiffPercentage || 0,
    },
    plugins: userConfig.plugins ? await getPlugins(userConfig.plugins) : [],
    onFail: userConfig.onFail,
  };

  getLogger().debug(
    "Configuration loaded:",
    JSON.stringify(configWithDefaults, null, 2),
  );

  return configWithDefaults;
}
