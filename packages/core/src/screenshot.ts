import fs from "node:fs";
import path from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  firefox,
  type Locator,
  type Page,
  type PageScreenshotOptions,
  webkit,
} from "playwright-core";
import {
  type CompareOptions,
  type CompareResult,
  compareImages,
} from "./compare";

class ScreenshotTool {
  browserType: string;
  headless: boolean;
  viewport: { width: number; height: number };
  outputDir: string;
  actualDir: string;
  diffDir: string;
  expectedDir: string;
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

    // Set up subdirectories
    this.actualDir = path.join(this.outputDir, "actual");
    this.diffDir = path.join(this.outputDir, "diff");
    this.expectedDir = path.join(this.outputDir, "expected");
  }

  async init() {
    // Create output directories if they don't exist
    this.createDirectories();

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

  private createDirectories() {
    // Create main output directory and subdirectories
    const directories = [
      this.outputDir,
      this.actualDir,
      this.diffDir,
      this.expectedDir,
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    }
  }

  getActualFilePath(filename: string): string {
    return path.join(this.actualDir, filename);
  }

  getDiffFilePath(filename: string): string {
    return path.join(this.diffDir, filename);
  }

  getExpectedFilePath(filename: string): string {
    return path.join(this.expectedDir, filename);
  }

  // Keep original method for backward compatibility
  getFilePath(filename: string) {
    return this.getActualFilePath(filename);
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

      // Generate filename - save to actual directory
      const filepath = this.getActualFilePath(filename);

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
      // Save to actual directory
      const filepath = this.getActualFilePath(filename);

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

  async takeScreenshotWithComparison(
    page: Page,
    filename: string,
    referenceImage: Buffer,
    options: {
      fullPage?: boolean;
      waitForSelector?: string;
      waitForTimeout?: number;
      mask?: Locator[];
      omitBackground?: boolean;
      // Comparison options
      compareOptions?: CompareOptions;
      maxDifferencePercent?: number;
      saveDiffImage?: boolean;
      diffImageFilename?: string;
    } = {},
  ): Promise<{
    screenshotPath: string;
    comparisonResult: CompareResult;
    diffImagePath?: string;
  }> {
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

      // Generate filename and take screenshot - save to actual directory
      const filepath = this.getActualFilePath(filename);

      // Take screenshot and get buffer
      const screenshotOptions = {
        fullPage:
          (options.fullPage as boolean) !== undefined
            ? options.fullPage
            : this.fullPage,
        type: "png" as const,
        timeout: 60000,
        mask: options.mask,
        omitBackground: options.omitBackground,
        scale: "css" as const,
      } satisfies PageScreenshotOptions;

      // Get screenshot as buffer for comparison
      const screenshotBuffer = await page.screenshot(screenshotOptions);

      // Save screenshot to actual directory
      fs.writeFileSync(filepath, screenshotBuffer);

      console.log(`Screenshot saved: ${filepath}`);

      // Perform comparison
      const comparisonResult = await compareImages(
        screenshotBuffer,
        referenceImage,
        options.compareOptions || {},
        options.maxDifferencePercent || 0.1,
      );

      console.log(
        `Comparison result: ${comparisonResult.percentDifference.toFixed(2)}% difference (${
          comparisonResult.passed ? "PASSED" : "FAILED"
        })`,
      );

      let diffImagePath: string | undefined;

      // Save diff image if requested and there are differences
      if (options.saveDiffImage && comparisonResult.diffBuffer) {
        const diffFilename =
          options.diffImageFilename || filename.replace(/\.png$/, "-diff.png");
        // Save to diff directory
        diffImagePath = this.getDiffFilePath(diffFilename);

        fs.writeFileSync(diffImagePath, comparisonResult.diffBuffer);
        console.log(`Diff image saved: ${diffImagePath}`);
      }

      return {
        screenshotPath: filepath,
        comparisonResult,
        diffImagePath,
      };
    } catch (error) {
      console.error(
        `Error taking screenshot with comparison of ${page.url()}:`,
        (error as Error).message,
      );
      throw error;
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
        // Save to actual directory
        const filepath = this.getActualFilePath(filename);

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

  // Utility method to check if expected image exists
  hasExpectedImage(filename: string): boolean {
    const expectedPath = this.getExpectedFilePath(filename);
    return fs.existsSync(expectedPath);
  }

  // Utility method to get expected image as buffer (for future approval process)
  getExpectedImageBuffer(filename: string): Buffer {
    const expectedPath = this.getExpectedFilePath(filename);
    if (!fs.existsSync(expectedPath)) {
      throw new Error(`Expected image not found: ${expectedPath}`);
    }
    return fs.readFileSync(expectedPath);
  }
}

export default ScreenshotTool;
