import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    dir: "./src",
    globals: true,
    coverage: {
      enabled: true,
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/*.config.ts"],
    },
  },
});
