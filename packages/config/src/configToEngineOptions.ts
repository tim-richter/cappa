import path from "node:path";
import type { LocalEngineOptions, RunnablePlugin } from "@cappa/core";
import type { ResolvedUserConfig } from "./getConfig";

/**
 * Map a resolved config onto the options a `LocalEngine` needs.
 *
 * This lives here rather than in either command because both `cappa capture`
 * and `cappa review` build an engine from the same config, and two copies of
 * the mapping is two places for a new config option to be forgotten.
 *
 * `outputDir` is resolved to an absolute path. `ScreenshotFileSystem` and
 * `groupScreenshots` both `path.resolve` internally, so this changes no
 * behaviour — it just means the engine holds a path that does not depend on
 * the process's working directory staying put.
 *
 * `browserIdleTimeoutMs` is deliberately not mapped here. How long a browser
 * stays warm is a per-command policy rather than a config-to-engine mapping:
 * `review` wants the configured timeout, and a one-shot `capture` has no next
 * run to keep a browser warm for at all. Both pass it explicitly.
 */
export function configToEngineOptions(
  config: ResolvedUserConfig,
): LocalEngineOptions {
  return {
    outputDir: path.resolve(config.outputDir),
    plugins: (config.plugins || []) as unknown as RunnablePlugin[],
    diff: config.diff,
    retries: config.retries,
    concurrency: config.concurrency,
    logConsoleEvents: config.logConsoleEvents,
    fullPage: config.screenshot?.fullPage ?? true,
    viewport: config.screenshot?.viewport ?? { width: 1920, height: 1080 },
    connectionTimeout: config.connectionTimeout,
  };
}
