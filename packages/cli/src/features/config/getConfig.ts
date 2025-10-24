import type { UserConfig } from "@cappa/core";
import { getPlugins, isPromise } from "./getPlugins";
import type { ConfigResult } from "./loadConfig";

/**
 * Converting UserConfig to Config without a change in the object beside the JSON convert.
 */
export async function getConfig(result: ConfigResult): Promise<UserConfig> {
  const configData = result?.config;
  let cappaUserConfig: Promise<UserConfig> = Promise.resolve(
    configData as UserConfig,
  );

  // for ts or js files
  if (typeof configData === "function") {
    const possiblePromise = (configData as () => any)();
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

  return {
    outputDir: "./screenshots",
    retries: 2,
    concurrency: 1,
    diff: {
      threshold: 0.1,
      includeAA: false,
      fastBufferCheck: true,
      maxDiffPixels: 0,
      maxDiffPercentage: 0,
    },
    ...userConfig,
    plugins: userConfig.plugins
      ? await getPlugins(userConfig.plugins)
      : undefined,
  };
}
