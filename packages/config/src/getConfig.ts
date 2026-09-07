import type { ConfigEnv, UserConfig } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import { getPlugins, isPromise } from "./getPlugins";
import type { ConfigResult } from "./loadConfig";
import { loadConfig } from "./loadConfig";

/**
 * A config with every default applied.
 *
 * `review` is spelled out rather than left to the shallow `Required` above:
 * `getConfig` fills all three of its fields, so callers should not have to
 * re-apply defaults that have already been applied.
 */
export type ResolvedUserConfig = Required<
  Omit<UserConfig, "onFail" | "review">
> &
  Pick<UserConfig, "onFail"> & {
    review: Required<NonNullable<UserConfig["review"]>>;
  };

export type GetConfigOptions = {
  /**
   * Directory to load `cappa.config.ts` from when no `loadResult` is given.
   * @default process.cwd()
   */
  cwd?: string;
  /**
   * Value exposed as `ConfigEnv.command` to a function-style config.
   * @default process.argv[2]
   */
  command?: string;
};

/**
 * Converting UserConfig to Config without a change in the object beside the JSON convert.
 */
export async function getConfig(
  loadResult?: ConfigResult,
  options: GetConfigOptions = {},
): Promise<ResolvedUserConfig> {
  const result = loadResult ?? (await loadConfig({ cwd: options.cwd }));

  const configData = result?.config;
  let cappaUserConfig: Promise<UserConfig> = Promise.resolve(
    configData as UserConfig,
  );

  const configEnv: ConfigEnv = {
    command: options.command ?? process.argv[2],
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

  const diffConfig: UserConfig["diff"] = (() => {
    if (userConfig.diff?.type !== "gmsd") {
      return {
        type: "pixel",
        threshold: userConfig.diff?.threshold ?? 0.1,
        includeAA: userConfig.diff?.includeAA ?? false,
        fastBufferCheck: userConfig.diff?.fastBufferCheck ?? true,
        maxDiffPixels: userConfig.diff?.maxDiffPixels ?? 0,
        maxDiffPercentage: userConfig.diff?.maxDiffPercentage ?? 0,
        interpret: userConfig.diff?.interpret ?? false,
      };
    }

    return {
      type: "gmsd",
      threshold: userConfig.diff.threshold ?? 0.1,
      downsample: userConfig.diff.downsample ?? 0,
      c: userConfig.diff.c ?? 170,
    };
  })();

  const configWithDefaults = {
    outputDir: userConfig.outputDir || "./screenshots",
    retries: userConfig.retries || 2,
    concurrency: userConfig.concurrency || 1,
    logConsoleEvents: userConfig.logConsoleEvents ?? true,
    diff: diffConfig,
    plugins: userConfig.plugins ? await getPlugins(userConfig.plugins) : [],
    onFail: userConfig.onFail,
    screenshot: {
      fullPage: userConfig.screenshot?.fullPage ?? true,
      viewport: userConfig.screenshot?.viewport ?? {
        width: 1920,
        height: 1080,
      },
    },
    review: {
      theme: userConfig.review?.theme ?? "light",
      port: userConfig.review?.port ?? 3000,
      browserIdleTimeout: userConfig.review?.browserIdleTimeout ?? 300_000,
    },
    connectionTimeout: userConfig.connectionTimeout ?? 20000,
  };

  getLogger().debug(
    "Configuration loaded:",
    JSON.stringify(configWithDefaults, null, 2),
  );

  return configWithDefaults;
}
