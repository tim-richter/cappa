import type { UserConfig } from "@cappa/core";
import type { Config } from "cosmiconfig";
import type { CosmiconfigResult } from "./getCosmiConfig.ts";
import { getPlugins, isPromise } from "./getPlugins";

/**
 * Converting UserConfig to Config without a change in the object beside the JSON convert.
 */
export async function getConfig(
  result: CosmiconfigResult,
): Promise<Array<Config> | Config> {
  const config = result?.config;
  let cappaUserConfig = Promise.resolve(config) as Promise<
    UserConfig | Array<UserConfig>
  >;

  // for ts or js files
  if (typeof config === "function") {
    const possiblePromise = config();
    if (isPromise(possiblePromise)) {
      cappaUserConfig = possiblePromise as Promise<
        UserConfig | Array<UserConfig>
      >;
    }
    cappaUserConfig = Promise.resolve(possiblePromise);
  }

  let JSONConfig = await cappaUserConfig;

  if (Array.isArray(JSONConfig)) {
    const results: Array<Config> = [];

    for (const item of JSONConfig) {
      const plugins = item.plugins ? await getPlugins(item.plugins) : undefined;

      results.push({
        ...item,
        plugins,
      } as Config);
    }

    return results;
  }

  JSONConfig = {
    ...JSONConfig,
    plugins: JSONConfig.plugins
      ? await getPlugins(JSONConfig.plugins)
      : undefined,
  };

  return JSONConfig as Config;
}
