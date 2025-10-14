export interface StorybookRenderOptions {
  viewMode?: "story" | "docs";
  args?: Record<string, unknown>;
  globals?: Record<string, string | number | boolean>;
  query?: Record<string, string | number | boolean>;
  fullscreen?: boolean;
  singleStory?: boolean;
}

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
  storybook?: StorybookRenderOptions;
}
