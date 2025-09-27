import { defineConfig } from "@cappa/core";
import { cappaPluginStorybook } from "@cappa/plugin-storybook";

export default defineConfig({
  outputDir: "./screenshots",
  diff: {
    threshold: 0.1,
    includeAA: false,
    fastBufferCheck: true,
    maxDiffPixels: 0,
    maxDiffPercentage: 10,
  },
  plugins: [cappaPluginStorybook({ storybookUrl: "http://localhost:8080" })],
});
