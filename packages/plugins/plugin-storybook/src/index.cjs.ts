export const previewAnnotations = [require.resolve("./preview.js")];

export type {
  StorybookPluginOptions,
  StoryFilterContext,
} from "./cappa/plugin";
export { cappaPluginStorybook } from "./cappa/plugin";
export type { ScreenshotOptionsStorybook as CappaStorybookOptions } from "./types";
