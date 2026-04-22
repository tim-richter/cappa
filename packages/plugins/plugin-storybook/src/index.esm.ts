import { fileURLToPath } from "node:url";

export const previewAnnotations = [
  fileURLToPath(new URL("./preview.mjs", import.meta.url)),
];

export type {
  StorybookPluginOptions,
  StoryFilterContext,
} from "./cappa/plugin";
export { cappaPluginStorybook } from "./cappa/plugin";
export type { ScreenshotOptionsStorybook as CappaStorybookOptions } from "./types";
