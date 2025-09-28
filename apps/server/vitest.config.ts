import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    dir: "./tests",
    coverage: {
      enabled: true,
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.config.ts",
        "__mocks__/**",
        "public/**",
      ],
    },
    setupFiles: ["./tests/setup.ts"],
  },
});
