import type { ConfigEnv, PossiblePromise, UserConfig } from "./types";

/**
 * Type helper to make it easier to use cappa.config.ts, or a function that returns it. The function receives a ConfigEnv object.
 */
export function defineConfig(
  options:
    | PossiblePromise<UserConfig>
    | ((env: ConfigEnv) => PossiblePromise<UserConfig>),
): typeof options {
  return options;
}
