import type { DiffOptions } from "@cappa/core";

export interface StorybookRenderOptions {
  viewMode?: "story" | "docs";
  args?: Record<string, unknown>;
  globals?: Record<string, string | number | boolean>;
  query?: Record<string, string | number | boolean>;
  fullscreen?: boolean;
  singleStory?: boolean;
}

export type DiffOptionsStorybook = DiffOptions;

export interface ScreenshotVariantOverrideStorybook {
  fullPage?: boolean;
  delay?: number;
  skip?: boolean;
  mask?: string[];
  omitBackground?: boolean;
  viewport?: { width: number; height: number };
  /**
   * Storybook args to render this screenshot with, merged over the
   * plugin-level `storybook.args` — and, on a variant, over the story's own
   * `args`.
   */
  args?: Record<string, unknown>;
  /**
   * Storybook globals to render this screenshot with, merged over the
   * plugin-level `storybook.globals` — and, on a variant, over the story's own
   * `globals`.
   *
   * Args and globals are the only render inputs Storybook decodes from the
   * iframe URL, which is what makes them settable per screenshot: cappa
   * rebuilds the URL and loads it again. Parameters cannot work this way —
   * they are fixed when the story is prepared.
   */
  globals?: Record<string, string | number | boolean>;
  /**
   * Optional diff settings override applied when comparing this screenshot.
   * Supports both pixel (default) and gmsd algorithms.
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
