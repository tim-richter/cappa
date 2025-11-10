import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.esm.ts" },
    format: ["esm"],
    dts: { entry: 'src/index.esm.ts' },
    splitting: false,
    external: ["./preview.js"],
    sourcemap: false,
    clean: true,
  },
  {
    entry: { index: "src/index.cjs.ts" },
    format: ["cjs"],
    dts: { entry: 'src/index.cjs.ts' },
    splitting: false,
    external: ["./preview.js"],
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
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: true,
  },
]);
