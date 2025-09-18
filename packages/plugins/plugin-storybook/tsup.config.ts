import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    external: ["./preview.mjs"],
    sourcemap: false,
    clean: true,
  },
  {
    entry: ["src/storybook/addon/preview.ts"],
    target: "node16",
    format: ["esm"],
    splitting: false,
    sourcemap: false,
    clean: true,
  },
  {
    entry: ["src/storybook/addon/browser.ts"],
    target: "es2015",
    format: ["esm"],
    splitting: false,
    sourcemap: false,
    clean: true,
  },
]);
