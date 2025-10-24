import { defineConfig } from "@cappa/core";
import { expect, test } from "vitest";
import { getConfig } from "./getConfig";
import type { ConfigResult } from "./loadConfig";

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
    diff: {
      threshold: 0.1,
      includeAA: false,
      fastBufferCheck: true,
      maxDiffPixels: 0,
      maxDiffPercentage: 0,
    },
    plugins: [],
  });
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
    diff: {
      threshold: 0.1,
      includeAA: false,
      fastBufferCheck: true,
      maxDiffPixels: 0,
      maxDiffPercentage: 0,
    },
    plugins: [],
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
    diff: {
      threshold: 0.1,
      includeAA: false,
      fastBufferCheck: true,
      maxDiffPixels: 0,
      maxDiffPercentage: 0,
    },
    plugins: [],
  });
});
