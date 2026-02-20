import { defineConfig } from "@cappa/core";
import { expect, test, vi } from "vitest";
import { getConfig } from "./getConfig";
import type { ConfigResult } from "./loadConfig";

const debugMock = vi.fn();

vi.mock("@cappa/logger", () => ({
  getLogger: () => ({
    debug: debugMock,
  }),
}));

test("return Config when config is set with defineConfig", async () => {
  const config: ConfigResult["config"] = defineConfig({
    outputDir: "./screenshots",
    retries: 3,
    concurrency: 2,
    plugins: [],
  });

  const cappaUserConfig = await getConfig({
    config,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig).toEqual({
    outputDir: "./screenshots",
    retries: 3,
    concurrency: 2,
    logConsoleEvents: true,
    diff: {
      type: "pixel",
      threshold: 0.1,
      includeAA: false,
      fastBufferCheck: true,
      maxDiffPixels: 0,
      maxDiffPercentage: 0,
    },
    plugins: [],
    onFail: undefined,
    screenshot: {
      fullPage: true,
      viewport: { width: 1920, height: 1080 },
    },
    review: { theme: "light" },
  });
});

test("respects screenshot.fullPage override", async () => {
  const config: ConfigResult["config"] = defineConfig({
    outputDir: "./screenshots",
    retries: 2,
    plugins: [],
    screenshot: { fullPage: false },
  });

  const cappaUserConfig = await getConfig({
    config,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig.screenshot.fullPage).toBe(false);
  expect(cappaUserConfig.screenshot.viewport).toEqual({
    width: 1920,
    height: 1080,
  });
});

test("respects screenshot.viewport override", async () => {
  const config: ConfigResult["config"] = defineConfig({
    outputDir: "./screenshots",
    retries: 2,
    plugins: [],
    screenshot: { viewport: { width: 1024, height: 768 } },
  });

  const cappaUserConfig = await getConfig({
    config,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig.screenshot.fullPage).toBe(true);
  expect(cappaUserConfig.screenshot.viewport).toEqual({
    width: 1024,
    height: 768,
  });
});

test("respects review.theme override", async () => {
  const config: ConfigResult["config"] = defineConfig({
    outputDir: "./screenshots",
    retries: 2,
    plugins: [],
    review: { theme: "dark" },
  });

  const cappaUserConfig = await getConfig({
    config,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig.review.theme).toBe("dark");
});

test("respects logConsoleEvents override", async () => {
  const config: ConfigResult["config"] = defineConfig({
    outputDir: "./screenshots",
    retries: 3,
    concurrency: 2,
    logConsoleEvents: false,
    plugins: [],
  });

  const cappaUserConfig = await getConfig({
    config,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig.logConsoleEvents).toBe(false);
});

test("return Config when config is a function", async () => {
  const config = () => {
    return {
      outputDir: "./custom-screenshots",
      retries: 5,
      concurrency: 1,
      plugins: [],
    };
  };

  const cappaUserConfig = await getConfig({
    config: config as any,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig).toEqual({
    outputDir: "./custom-screenshots",
    retries: 5,
    concurrency: 1,
    logConsoleEvents: true,
    diff: {
      type: "pixel",
      threshold: 0.1,
      includeAA: false,
      fastBufferCheck: true,
      maxDiffPixels: 0,
      maxDiffPercentage: 0,
    },
    plugins: [],
    onFail: undefined,
    screenshot: {
      fullPage: true,
      viewport: { width: 1920, height: 1080 },
    },
    review: { theme: "light" },
  });
});

test("return Config when config is a promise", async () => {
  const config = Promise.resolve({
    outputDir: "./async-screenshots",
    retries: 2,
    concurrency: 4,
    plugins: [],
  });

  const cappaUserConfig = await getConfig({
    config: config as any,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig).toEqual({
    outputDir: "./async-screenshots",
    retries: 2,
    concurrency: 4,
    logConsoleEvents: true,
    diff: {
      type: "pixel",
      threshold: 0.1,
      includeAA: false,
      fastBufferCheck: true,
      maxDiffPixels: 0,
      maxDiffPercentage: 0,
    },
    plugins: [],
    onFail: undefined,
    screenshot: {
      fullPage: true,
      viewport: { width: 1920, height: 1080 },
    },
    review: { theme: "light" },
  });
});

test("passes environment variables to config functions", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUploadKey = process.env.UPLOAD_KEY;

  process.env.NODE_ENV = "test";
  process.env.UPLOAD_KEY = "secret";

  const config = (env: any) => {
    expect(env.env.UPLOAD_KEY).toBe("secret");
    expect(env.mode).toBe("test");
    expect(env.command).toBeUndefined();

    return {
      outputDir: "./env-screenshots",
      retries: 1,
      concurrency: 1,
      plugins: [],
    };
  };

  const cappaUserConfig = await getConfig({
    config: config as any,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig).toEqual({
    outputDir: "./env-screenshots",
    retries: 1,
    concurrency: 1,
    logConsoleEvents: true,
    diff: {
      type: "pixel",
      threshold: 0.1,
      includeAA: false,
      fastBufferCheck: true,
      maxDiffPixels: 0,
      maxDiffPercentage: 0,
    },
    plugins: [],
    onFail: undefined,
    screenshot: {
      fullPage: true,
      viewport: { width: 1920, height: 1080 },
    },
    review: { theme: "light" },
  });

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalUploadKey === undefined) {
    delete process.env.UPLOAD_KEY;
  } else {
    process.env.UPLOAD_KEY = originalUploadKey;
  }
});

test("keeps explicit pixel diff values from config", async () => {
  const config: ConfigResult["config"] = defineConfig({
    plugins: [],
    diff: {
      type: "pixel",
      threshold: 0,
      includeAA: true,
      fastBufferCheck: false,
      maxDiffPixels: 5,
      maxDiffPercentage: 1,
    },
  });

  const cappaUserConfig = await getConfig({
    config,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig.diff).toEqual({
    type: "pixel",
    threshold: 0,
    includeAA: true,
    fastBufferCheck: false,
    maxDiffPixels: 5,
    maxDiffPercentage: 1,
  });
});

test("supports gmsd diff config values", async () => {
  const config: ConfigResult["config"] = defineConfig({
    plugins: [],
    diff: {
      type: "gmsd",
      threshold: 0.2,
      downsample: 1,
      c: 200,
    },
  });

  const cappaUserConfig = await getConfig({
    config,
    filepath: "./cappa.config.ts",
  });

  expect(cappaUserConfig.diff).toEqual({
    type: "gmsd",
    threshold: 0.2,
    downsample: 1,
    c: 200,
  });
});
