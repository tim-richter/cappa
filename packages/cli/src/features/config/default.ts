export const defaultConfig = `import { defineConfig } from "@cappa/core";

export default defineConfig({
  outputDir: "./screenshots",
  retries: 3,
  diff: {
    threshold: 0.1,
    includeAA: false,
    fastBufferCheck: true,
    maxDiffPixels: 0,
    maxDiffPercentage: 0,
  },
  plugins: [],
});
`;
