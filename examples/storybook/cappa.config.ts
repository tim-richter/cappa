import { defineConfig } from "@cappa/core";
import { cappaPluginStorybook } from "@cappa/plugin-storybook";

export default defineConfig({
  outputDir: "./screenshots",
  plugins: [cappaPluginStorybook({ storybookUrl: "http://localhost:8080" })],
});
