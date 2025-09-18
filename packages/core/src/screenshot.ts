import fs from "node:fs";
import path from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  firefox,
  Locator,
  type Page,
  type PageScreenshotOptions,
  webkit,
} from "playwright-core";

class ScreenshotTool {
  browserType: string;
  headless: boolean;
  viewport: { width: number; height: number };
  outputDir: string;
  fullPage: boolean;
  browser: Browser | null = null;
  context: BrowserContext | null = null;
  page: Page | null = null;
  constructor(options: {
    browserType?: string;
    headless?: boolean;
    viewport?: { width: number; height: number };
    outputDir?: string;
    fullPage?: boolean;
  }) {
    this.browserType = options.browserType || "chromium";
    this.headless = options.headless !== false; // Default to headless
    this.viewport = options.viewport || { width: 1920, height: 1080 };
    this.outputDir = options.outputDir || "./screenshots";
    this.fullPage = options.fullPage !== false; // Default to full page
  }

  async init() {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Launch browser based on type
    const browserMap = {
      chromium,
      firefox,
      webkit,
    };

    const browserClass =
      browserMap[this.browserType as keyof typeof browserMap];
    if (!browserClass) {
      throw new Error(`Unsupported browser type: ${this.browserType}`);
    }

    this.browser = await browserClass.launch({
      headless: this.headless,
    });

    const defaultUserAgent = (await this.browser.newContext())
      .newPage()
      .then((page) => page.evaluate(() => navigator.userAgent));

    this.context = await this.browser.newContext({
      reducedMotion: "reduce",
      deviceScaleFactor: 2,
      userAgent: `${await defaultUserAgent} CappaStorybook`,
    });

    this.page = await this.context?.newPage();
    this.page?.setViewportSize(this.viewport);
  }

  async close() {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  async goTo(page: Page, url: string) {
    if (!this.context) {
      throw new Error("Browser not initialized");
    }
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }

  getFilePath(filename: string) {
    const filepath = path.join(this.outputDir, filename);
    return filepath;
  }

  async takeScreenshot(
    page: Page,
    filename: string,
    options: {
      fullPage?: boolean;
      waitForSelector?: string;
      waitForTimeout?: number;
      mask?: Locator[];
      omitBackground?: boolean;
    } = {},
  ) {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    try {
      // Wait for selector if specified
      if (options.waitForSelector) {
        console.log(`Waiting for selector: ${options.waitForSelector}`);
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      }

      // Wait for custom timeout or default
      const waitTime =
        options.waitForTimeout !== undefined ? options.waitForTimeout : 0;
      if (waitTime > 0) {
        console.log(`Waiting for ${waitTime}ms for dynamic content`);
        await page.waitForTimeout(waitTime);
      }

      // Generate filename
      const filepath = this.getFilePath(filename);

      // Take screenshot
      const screenshotOptions = {
        path: filepath,
        fullPage:
          (options.fullPage as boolean) !== undefined
            ? options.fullPage
            : this.fullPage,
        type: "png",
        timeout: 60000,
        mask: options.mask,
        omitBackground: options.omitBackground,
        scale: "css" as const,
      } satisfies PageScreenshotOptions;

      await page.screenshot(screenshotOptions);

      console.log(`Screenshot saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error(
        `Error taking screenshot of ${page.url()}:`,
        (error as Error).message,
      );
      throw error;
    }
  }

  async takeElementScreenshot(
    page: Page,
    selector: string,
    options: {
      filename?: string;
      fullPage?: boolean;
    } = {},
  ) {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    try {
      // Wait for element to be visible
      await page.waitForSelector(selector, { timeout: 10000 });

      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }

      const filename =
        (options.filename as string | undefined) ||
        `${selector.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      const filepath = this.getFilePath(filename);

      const elementScreenshotOptions = {
        path: filepath,
        type: "png",
      } satisfies PageScreenshotOptions;

      await element.screenshot(elementScreenshotOptions);

      console.log(`Element screenshot saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error(
        `Error taking element screenshot of ${page.url()}:`,
        (error as Error).message,
      );
      throw error;
    } finally {
      await page.close();
    }
  }

  async batchScreenshots(urls: string[], options = {}) {
    const results: {
      url: string;
      success: boolean;
      filepath: string;
      error?: string;
    }[] = [];

    for (const url of urls) {
      try {
        const page = this.page;
        if (!page) {
          throw new Error("Page not initialized");
        }
        await this.goTo(page, url);
        const filepath = await this.takeScreenshot(page, url, options);
        results.push({ url, success: true, filepath });
      } catch (error) {
        results.push({
          url,
          success: false,
          error: (error as Error).message,
          filepath: "",
        });
      }
    }

    return results;
  }

  async takeResponsiveScreenshots(
    url: string,
    viewports: { width: number; height: number; name: string }[] = [
      { width: 1920, height: 1080, name: "desktop" },
      { width: 768, height: 1024, name: "tablet" },
      { width: 375, height: 667, name: "mobile" },
    ],
    options: {
      fullPage?: boolean;
    } = {},
  ) {
    if (!this.context) {
      throw new Error("Browser not initialized");
    }

    const results: {
      viewport: string;
      success: boolean;
      filepath: string;
      error?: string;
    }[] = [];

    for (const viewport of viewports) {
      try {
        const page = await this.context?.newPage();
        await page.setViewportSize(viewport);

        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        const filename = `${viewport.name}.png`;
        const filepath = this.getFilePath(filename);

        const responsiveScreenshotOptions = {
          path: filepath,
          fullPage:
            (options.fullPage as boolean) !== undefined
              ? options.fullPage
              : this.fullPage,
          type: "png" as const,
        };

        await page.screenshot(responsiveScreenshotOptions);

        await page.close();

        console.log(`Responsive screenshot saved: ${filepath}`);
        results.push({ viewport: viewport.name, success: true, filepath });
      } catch (error) {
        console.error(
          `Error taking responsive screenshot for ${viewport.name}:`,
          (error as Error).message,
        );
        results.push({
          viewport: viewport.name,
          success: false,
          error: (error as Error).message,
          filepath: "",
        });
      }
    }

    return results;
  }
}

export default ScreenshotTool;
