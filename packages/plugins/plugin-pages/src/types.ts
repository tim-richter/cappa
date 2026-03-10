import type { DiffOptions, Viewport } from "@cappa/core";

/**
 * Waiting strategy configuration for page screenshots.
 */
export interface WaitStrategy {
  /**
   * Wait for a specific CSS selector to appear in the DOM.
   */
  waitForSelector?: string;
  /**
   * Wait for a specific amount of time (ms) after navigation.
   */
  waitForTimeout?: number;
  /**
   * Wait for the network to be idle (no in-flight requests for 500ms).
   * @default true
   */
  waitForNetworkIdle?: boolean;
  /**
   * Wait until the page has no DOM mutations for a period.
   * @default true
   */
  waitForStable?: boolean;
}

/**
 * Screenshot options that can be set per-page.
 */
export interface PageScreenshotOptions {
  /**
   * Whether to capture the full scrollable page.
   */
  fullPage?: boolean;
  /**
   * Delay in milliseconds before taking the screenshot.
   */
  delay?: number;
  /**
   * CSS selectors to mask (hide) in the screenshot.
   */
  mask?: string[];
  /**
   * Render the page with a transparent background.
   */
  omitBackground?: boolean;
  /**
   * Override the viewport size for this page.
   */
  viewport?: Viewport;
  /**
   * Override diff settings for this page.
   */
  diff?: DiffOptions;
}

/**
 * Configuration for a single page to screenshot.
 */
export interface PageEntry {
  /**
   * The URL to navigate to and screenshot.
   */
  url: string;
  /**
   * A human-readable name used as the screenshot filename.
   * If not provided, one is derived from the URL.
   */
  name?: string;
  /**
   * Per-page screenshot options.
   */
  options?: PageScreenshotOptions;
  /**
   * Per-page waiting strategy overrides.
   */
  wait?: WaitStrategy;
}

/**
 * Configuration for the pages plugin.
 */
export interface PagesPluginOptions {
  /**
   * List of pages to screenshot.
   */
  pages: PageEntry[];
  /**
   * Default waiting strategy applied to all pages.
   * Individual pages can override these settings.
   */
  wait?: WaitStrategy;
  /**
   * Default screenshot options applied to all pages.
   * Individual pages can override these settings.
   */
  defaults?: PageScreenshotOptions;
}
