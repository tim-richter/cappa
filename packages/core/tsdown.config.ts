import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/playwright.ts"],
  dts: true,
  format: ["esm", "cjs"],
  platform: "node",
  sourcemap: true,
  shims: true,
  exports: true,
});
