import type { ScreenshotOptions } from "@cappa/core";

export type ScreenshotOptionsStorybook = Omit<ScreenshotOptions, "mask"> & {
  mask: string[];
};
