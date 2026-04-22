import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/index.esm.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: false,
  },
  {
    entry: ["src/index.cjs.ts"],
    format: ["cjs"],
    dts: true,
    sourcemap: false,
  },
  {
    entry: ["src/storybook/addon/preview.ts"],
    target: "node16",
    format: ["esm", "cjs"],
    sourcemap: false,
  },
  {
    entry: ["src/storybook/addon/browser.ts"],
    target: "es2015",
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: false,
  },
]);
