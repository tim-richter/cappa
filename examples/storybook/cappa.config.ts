import { defineConfig } from "@cappa/core";
import { cappaPluginStorybook } from "@cappa/plugin-storybook";

export default defineConfig({
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
  plugins: [cappaPluginStorybook({ storybookUrl: "http://localhost:8080" })],
});
