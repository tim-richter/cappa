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
  });
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
