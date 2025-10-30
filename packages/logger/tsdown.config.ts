import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  format: ["esm"],
  platform: "node",
  sourcemap: true,
  shims: true,
  exports: true,
});
