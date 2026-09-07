import { defineConfig } from "@cappa/core";
import { cappaPluginStorybook } from "@cappa/plugin-storybook";

export default defineConfig({
  outputDir: ".screenshots",
  diff: {
    threshold: 0.1,
    includeAA: false,
    fastBufferCheck: true,
    // Headless Chromium's text rasterisation is not bit-stable between
    // process runs: a handful of glyph-edge pixels flip between two values,
    // which a zero-pixel tolerance reports as a failed comparison on most
    // runs. Disabling LCD text would need a browser launch flag, which
    // cappa does not expose, so allow a few pixels of rasterisation noise —
    // still far below any real visual change.
    maxDiffPixels: 20,
    maxDiffPercentage: 0,
  },
  plugins: [cappaPluginStorybook({ storybookUrl: "http://localhost:8080" })],
});
