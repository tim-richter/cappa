import { fileURLToPath } from "node:url";

export const previewAnnotations = [
  fileURLToPath(new URL("./preview.js", import.meta.url)),
];

export { cappaPluginStorybook } from "./cappa/plugin";
export type { ScreenshotOptionsStorybook as CappaStorybookOptions } from "./types";
