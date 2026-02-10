export interface StorybookRenderOptions {
  viewMode?: "story" | "docs";
  args?: Record<string, unknown>;
  globals?: Record<string, string | number | boolean>;
  query?: Record<string, string | number | boolean>;
  fullscreen?: boolean;
  singleStory?: boolean;
}

export interface DiffOptionsStorybook {
  threshold?: number;
  includeAA?: boolean;
  fastBufferCheck?: boolean;
  maxDiffPixels?: number;
  maxDiffPercentage?: number;
}

export interface ScreenshotVariantOverrideStorybook {
  fullPage?: boolean;
  delay?: number;
  skip?: boolean;
  mask?: string[];
  omitBackground?: boolean;
  viewport?: { width: number; height: number };
  args?: Record<string, unknown>;
  /**
   * Optional diff settings override applied when comparing this screenshot.
   * These map directly to Cappa's diff configuration options.
   */
  diff?: DiffOptionsStorybook;
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
