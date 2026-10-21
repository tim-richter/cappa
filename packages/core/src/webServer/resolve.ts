import path from "node:path";
import type { WebServerConfig } from "../types";
import type { ResolvedWebServerConfig } from "./WebServerPool";

export const DEFAULT_WEB_SERVER_TIMEOUT_MS = 60_000;

// `localhost:6006` parses — as a URL with the scheme `localhost:`.
const isHttpUrl = (value: string): boolean =>
  URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol);

/**
 * Normalise `webServer` to a list with every default applied.
 *
 * A relative `cwd` resolves against `configDir` — the directory of
 * `cappa.config.ts` — not the process's working directory, so the same config
 * works whether cappa runs from the repository root or from inside the package
 * (`pnpm -F visual-tests cappa capture`).
 */
export function resolveWebServerConfig(
  webServer: WebServerConfig | WebServerConfig[] | undefined,
  configDir: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedWebServerConfig[] {
  if (webServer === undefined) {
    return [];
  }

  const entries = Array.isArray(webServer) ? webServer : [webServer];

  return entries.map((entry, index) => {
    const where = Array.isArray(webServer)
      ? `webServer[${index}]`
      : "webServer";

    if (typeof entry?.command !== "string" || entry.command.trim() === "") {
      throw new Error(`Invalid configuration: ${where}.command is required.`);
    }
    if (typeof entry.url !== "string" || !isHttpUrl(entry.url)) {
      throw new Error(
        `Invalid configuration: ${where}.url must be an absolute URL, e.g. "http://localhost:6006".`,
      );
    }
    if (
      entry.timeout !== undefined &&
      !(Number.isFinite(entry.timeout) && entry.timeout > 0)
    ) {
      throw new Error(
        `Invalid configuration: ${where}.timeout must be a positive number of milliseconds.`,
      );
    }

    return {
      command: entry.command,
      url: entry.url,
      reuseExistingServer: entry.reuseExistingServer ?? !env.CI,
      timeout: entry.timeout ?? DEFAULT_WEB_SERVER_TIMEOUT_MS,
      cwd: path.resolve(configDir, entry.cwd ?? "."),
      env: entry.env ?? {},
    };
  });
}
