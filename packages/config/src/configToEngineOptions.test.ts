import path from "node:path";
import { describe, expect, it } from "vitest";
import { configToEngineOptions } from "./configToEngineOptions";
import type { ResolvedUserConfig } from "./getConfig";

const config = (overrides: Partial<ResolvedUserConfig> = {}) =>
  ({
    outputDir: "./screenshots",
    retries: 2,
    concurrency: 1,
    logConsoleEvents: true,
    diff: { type: "pixel", threshold: 0.1 },
    plugins: [],
    screenshot: {},
    review: { theme: "light", port: 3000, browserIdleTimeout: 300_000 },
    connectionTimeout: 20_000,
    ...overrides,
  }) as ResolvedUserConfig;

describe("configToEngineOptions", () => {
  it("resolves outputDir to an absolute path", () => {
    const options = configToEngineOptions(config({ outputDir: "./shots" }));

    expect(options.outputDir).toBe(path.resolve("./shots"));
    expect(path.isAbsolute(options.outputDir)).toBe(true);
  });

  it("leaves an already-absolute outputDir alone", () => {
    const options = configToEngineOptions(
      config({ outputDir: "/tmp/screenshots" }),
    );

    expect(options.outputDir).toBe("/tmp/screenshots");
  });

  it("passes the capture settings through unchanged", () => {
    const diff = { type: "gmsd", threshold: 0.4 } as const;
    const options = configToEngineOptions(
      config({
        diff,
        retries: 5,
        concurrency: 4,
        logConsoleEvents: false,
        connectionTimeout: 1234,
      }),
    );

    expect(options).toMatchObject({
      diff,
      retries: 5,
      concurrency: 4,
      logConsoleEvents: false,
      connectionTimeout: 1234,
    });
  });

  it("applies the screenshot defaults the engine expects", () => {
    const options = configToEngineOptions(config({ screenshot: {} }));

    expect(options.fullPage).toBe(true);
    expect(options.viewport).toEqual({ width: 1920, height: 1080 });
  });

  it("prefers explicit screenshot settings over the defaults", () => {
    const options = configToEngineOptions(
      config({
        screenshot: { fullPage: false, viewport: { width: 800, height: 600 } },
      }),
    );

    expect(options.fullPage).toBe(false);
    expect(options.viewport).toEqual({ width: 800, height: 600 });
  });

  it("carries the config's plugins through by reference", () => {
    const plugins = [
      { name: "pages" },
    ] as unknown as ResolvedUserConfig["plugins"];
    const options = configToEngineOptions(config({ plugins }));

    // Plugins are live closures, so they must be passed, never copied.
    expect(options.plugins[0]).toBe(plugins?.[0]);
  });

  it("tolerates a config with no plugins", () => {
    const options = configToEngineOptions(config({ plugins: undefined }));

    expect(options.plugins).toEqual([]);
  });

  it("does not set a browser idle timeout — that is the command's choice", () => {
    const options = configToEngineOptions(config());

    expect(options.browserIdleTimeoutMs).toBeUndefined();
  });
});
