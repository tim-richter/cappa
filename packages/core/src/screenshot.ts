import fs from "node:fs";
import path from "node:path";
import { getLogger, type Logger } from "@cappa/logger";
import {
  type Browser,
  type BrowserContext,
  chromium,
  firefox,
  type Page,
  type PageScreenshotOptions,
  webkit,
} from "playwright-core";
import {
  type CompareResult,
  compareImages,
  createDiffSizePngImage,
} from "./compare";
import type { DiffConfig, ScreenshotOptions } from "./types";

const defaultDiffConfig: DiffConfig = {
  threshold: 0.1,
  includeAA: false,
  fastBufferCheck: true,
  maxDiffPixels: 0,
  maxDiffPercentage: 0,
};

class ScreenshotTool {
  browserType: "chromium" | "firefox" | "webkit";
  headless: boolean;
  viewport: { width: number; height: number };
  outputDir: string;
  actualDir: string;
  diffDir: string;
  expectedDir: string;
  browser: Browser | null = null;
  context: BrowserContext | null = null;
  page: Page | null = null;
  diff: DiffConfig;
  logger: Logger;
  retries: number;

  constructor(options: {
    browserType?: "chromium" | "firefox" | "webkit";
    headless?: boolean;
    viewport?: { width: number; height: number };
    outputDir?: string;
    diff?: DiffConfig;
    retries?: number;
  }) {
    this.browserType = options.browserType || "chromium";
    this.headless = options.headless !== false; // Default to headless
    this.viewport = options.viewport || { width: 1920, height: 1080 };
    this.outputDir = options.outputDir || "./screenshots";
    this.diff = { ...defaultDiffConfig, ...options.diff };
    // Set up subdirectories
    this.actualDir = path.join(this.outputDir, "actual");
    this.diffDir = path.join(this.outputDir, "diff");
    this.expectedDir = path.join(this.outputDir, "expected");

    this.logger = getLogger();
    this.retries = options.retries || 2;
  }

  /**
   * Initialize playwright and page
   */
  async init() {
    // Create output directories if they don't exist
    this.createDirectories();

    // Launch browser based on type
    const browserMap = {
      chromium,
      firefox,
      webkit,
    };

    const browserClass = browserMap[this.browserType];
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
      viewport: this.viewport,
    });

    this.page = await this.context?.newPage();
  }

  /**
   * Closes browser
   * If not closed, the process will not exit
   */
  async close() {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Navigates to a URL with "domcontentloaded" waitUntil
   */
  async goTo(page: Page, url: string) {
    if (!this.context) {
      throw new Error("Browser not initialized");
    }
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }

  /**
   * Creates directories for screenshots and other files
   */
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
        this.logger.debug(`Initialized directory: ${dir}`);
      }
    }
  }

  /**
   * Gets the path to the actual screenshot file
   */
  getActualFilePath(filename: string): string {
    return path.join(this.actualDir, filename);
  }

  /**
   * Gets the path to the diff screenshot file
   */
  getDiffFilePath(filename: string): string {
    return path.join(this.diffDir, filename);
  }

  /**
   * Gets the path to the expected screenshot file
   */
  getExpectedFilePath(filename: string): string {
    return path.join(this.expectedDir, filename);
  }

  /**
   * Takes a screenshot of the page
   */
  async takeScreenshot(
    page: Page,
    filename: string,
    options: ScreenshotOptions & {
      viewport?: { width: number; height: number };
    },
  ) {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    if (options.skip) {
      return;
    }

    try {
      // Generate filename - save to actual directory
      const filepath = this.getActualFilePath(filename);

      // Take screenshot
      const screenshotOptions = {
        path: filepath,
        fullPage: options.fullPage,
        type: "png" as const,
        timeout: 60000,
        mask: options.mask,
        omitBackground: options.omitBackground,
        scale: "css" as const,
        animations: "disabled",
        caret: "hide",
      } satisfies PageScreenshotOptions;

      if (options.viewport) {
        await page.setViewportSize(options.viewport);
      }

      if (options.delay) {
        await page.waitForTimeout(options.delay);
      }

      await page.screenshot(screenshotOptions);

      return filepath;
    } catch (error) {
      this.logger.error(
        `Error taking screenshot of ${page.url()}:`,
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Takes a screenshot and returns the buffer (for comparison purposes)
   */
  async takeScreenshotBuffer(
    page: Page,
    options: ScreenshotOptions & {
      viewport?: { width: number; height: number };
    },
  ): Promise<Buffer> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    if (options.skip) {
      throw new Error("Screenshot skipped");
    }

    try {
      // Take screenshot without saving to file
      const screenshotOptions = {
        fullPage: options.fullPage,
        type: "png" as const,
        timeout: 60000,
        mask: options.mask,
        omitBackground: options.omitBackground,
        scale: "css" as const,
        animations: "disabled",
        caret: "hide",
      } satisfies PageScreenshotOptions;

      if (options.viewport) {
        await page.setViewportSize(options.viewport);
      }

      if (options.delay) {
        await page.waitForTimeout(options.delay);
      }

      const buffer = await page.screenshot(screenshotOptions);
      return buffer;
    } catch (error) {
      this.logger.error(
        `Error taking screenshot of ${page.url()}:`,
        (error as Error).message,
      );
      throw error;
    }
  }

  async takeScreenshotWithComparison(
    page: Page,
    filename: string,
    referenceImage: Buffer,
    options: ScreenshotOptions & {
      saveDiffImage?: boolean;
      diffImageFilename?: string;
      viewport?: { width: number; height: number };
    },
  ): Promise<{
    screenshotPath: string;
    comparisonResult: CompareResult;
    diffImagePath?: string;
  }> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    try {
      // Generate filename and take screenshot - save to actual directory
      const filepath = this.getActualFilePath(filename);
      fs.mkdirSync(path.dirname(filepath), { recursive: true });

      // Take screenshot and get buffer
      const screenshotOptions = {
        fullPage: options.fullPage,
        type: "png" as const,
        timeout: 60000,
        mask: options.mask,
        omitBackground: options.omitBackground,
        scale: "css" as const,
        animations: "disabled",
        caret: "hide",
      } satisfies PageScreenshotOptions;

      const retryScreenshot = await this.retryScreenshot(page, referenceImage, {
        ...screenshotOptions,
        viewport: options.viewport,
      });

      if (!retryScreenshot.screenshotPath) {
        throw new Error("Screenshot buffer is undefined");
      }

      // Save screenshot to actual directory
      fs.writeFileSync(filepath, retryScreenshot.screenshotPath);
      this.logger.success(`Screenshot saved: ${filepath}`);

      if (retryScreenshot.passed) {
        this.logger.success(`Screenshot passed visual comparison`);
      } else {
        this.logger.error(`Screenshot failed visual comparison`);
      }

      let diffImagePath: string | undefined;

      // Save diff image if requested and there are differences
      if (
        options.saveDiffImage &&
        retryScreenshot.comparisonResult.diffBuffer &&
        !retryScreenshot.passed
      ) {
        const diffFilename = options.diffImageFilename || filename;
        // Save to diff directory
        diffImagePath = this.getDiffFilePath(diffFilename);

        fs.mkdirSync(path.dirname(diffImagePath), { recursive: true });
        fs.writeFileSync(
          diffImagePath,
          retryScreenshot.comparisonResult.diffBuffer,
        );

        this.logger.debug(`Diff image saved: ${diffImagePath}`);
      }

      // different sizes diff image
      if (retryScreenshot.comparisonResult.differentSizes) {
        this.logger.warn(`Screenshot has different sizes than reference image`);

        const diffFilename = options.diffImageFilename || filename;
        diffImagePath = this.getDiffFilePath(diffFilename);
        const diffBuffer = createDiffSizePngImage(200, 200);

        fs.mkdirSync(path.dirname(diffImagePath), { recursive: true });
        fs.writeFileSync(diffImagePath, diffBuffer);

        this.logger.debug(`Diff Size image saved: ${diffImagePath}`);
      }

      return {
        screenshotPath: filepath,
        comparisonResult: retryScreenshot.comparisonResult,
        diffImagePath,
      };
    } catch (error) {
      this.logger.error(
        `Error taking screenshot with comparison of ${page.url()}:`,
        (error as Error).message,
      );
      throw error;
    }
  }

  async retryScreenshot(
    page: Page,
    referenceImage: Buffer,
    options: ScreenshotOptions & {
      saveDiffImage?: boolean;
      diffImageFilename?: string;
      viewport?: { width: number; height: number };
    },
  ) {
    for (let i = 0; i < this.retries; i++) {
      try {
        const screenshotBuffer = await this.takeScreenshotBuffer(page, {
          ...options,
          delay: this.getIncBackoffDelay(i, options.delay || 0),
          viewport: options.viewport,
        });

        if (!screenshotBuffer) {
          throw new Error("Screenshot buffer is undefined");
        }

        const comparisonResult = await compareImages(
          screenshotBuffer,
          referenceImage,
          true,
          { ...this.diff, ...options },
        );

        // bail early if the images are different sizes
        if (comparisonResult.differentSizes) {
          return {
            screenshotPath: screenshotBuffer,
            comparisonResult,
            passed: false,
          };
        }

        // last retry
        if (i === this.retries - 1 && !comparisonResult.passed) {
          this.logger.error(
            `Failed to match screenshot after ${this.retries} retries`,
          );
          return {
            screenshotPath: screenshotBuffer,
            comparisonResult,
            passed: false,
          };
        }

        if (comparisonResult.passed) {
          return {
            screenshotPath: screenshotBuffer,
            comparisonResult,
            passed: true,
          };
        } else {
          this.logger.warn(
            `Comparison did not match. Retrying in ${this.getIncBackoffDelay(i + 1, options.delay || 0)}ms... \nComparison result: ${comparisonResult.numDiffPixels} pixels different (${comparisonResult.percentDifference.toFixed(2)}%)`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error taking screenshot after ${i + 1} retries:`,
          (error as Error).message,
        );
      }
    }

    return {
      screenshotPath: null,
      comparisonResult: null,
      passed: false,
    };
  }

  /**
   * Gets the exponential backoff delay
   */
  getIncBackoffDelay(i: number, delay: number): number {
    return i > 0 ? 500 * 2 ** (i - 1) + (delay || 0) : 0;
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
