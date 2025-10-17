export { cappaPluginStorybook } from "./cappa/plugin";

export const previewAnnotations = [require.resolve("./preview.mjs")];

export type { ScreenshotOptionsStorybook as CappaStorybookOptions } from "./types";
