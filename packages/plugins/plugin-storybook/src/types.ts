export interface ScreenshotVariantOverrideStorybook {
  fullPage?: boolean;
  delay?: number;
  skip?: boolean;
  mask?: string[];
  omitBackground?: boolean;
  viewport?: { width: number; height: number };
}

export interface ScreenshotVariantOptionsStorybook {
  id: string;
  label?: string;
  filename?: string;
  options?: ScreenshotVariantOverrideStorybook;
}

export interface ScreenshotOptionsStorybook
  extends ScreenshotVariantOverrideStorybook {
  variants?: ScreenshotVariantOptionsStorybook[];
}
