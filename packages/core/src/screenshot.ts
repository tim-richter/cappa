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
import { ScreenshotFileSystem } from "./filesystem";
import type {
  DiffConfig,
  ScreenshotOptions,
  ScreenshotSettings,
  ScreenshotVariant,
  ScreenshotVariantWithUrl,
} from "./types";

const defaultDiffConfig: DiffConfig = {
  threshold: 0.1,
  includeAA: false,
  fastBufferCheck: true,
  maxDiffPixels: 0,
  maxDiffPercentage: 0,
};

export interface ScreenshotCaptureDetails {
  filename: string;
  filepath?: string;
  comparisonResult?: CompareResult;
  diffImagePath?: string;
  skipped?: boolean;
}

export interface ScreenshotVariantCaptureDetails
  extends ScreenshotCaptureDetails {
  id: string;
  label?: string;
}

export interface ScreenshotCaptureResult {
  base: ScreenshotCaptureDetails;
  variants: ScreenshotVariantCaptureDetails[];
}

export interface ScreenshotCaptureExtras {
  saveDiffImage?: boolean;
  diffImageFilename?: string;
  variants?: Record<
    string,
    {
      saveDiffImage?: boolean;
      diffImageFilename?: string;
    }
  >;
}

class ScreenshotTool {
  browserType: "chromium" | "firefox" | "webkit";
  headless: boolean;
  viewport: { width: number; height: number };
  outputDir: string;
  browser: Browser | null = null;
  context: BrowserContext | null = null;
  page: Page | null = null;
  concurrency: number;
  contexts: BrowserContext[] = [];
  pages: Page[] = [];
  diff: DiffConfig;
  logger: Logger;
  retries: number;
  filesystem: ScreenshotFileSystem;

  constructor(options: {
    browserType?: "chromium" | "firefox" | "webkit";
    headless?: boolean;
    viewport?: { width: number; height: number };
    outputDir?: string;
    diff?: DiffConfig;
    retries?: number;
    concurrency?: number;
  }) {
    this.browserType = options.browserType || "chromium";
    this.headless = options.headless !== false; // Default to headless
    this.viewport = options.viewport || { width: 1920, height: 1080 };
    this.outputDir = options.outputDir || "./screenshots";
    this.diff = { ...defaultDiffConfig, ...options.diff };
    this.concurrency = Math.max(1, options.concurrency || 1);

    this.logger = getLogger();
    this.retries = options.retries || 2;
    this.filesystem = new ScreenshotFileSystem(this.outputDir);
  }

  /**
   * Initialize playwright and page
   */
  async init() {
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

    // Create N contexts and pages
    this.contexts = [];
    this.pages = [];

    for (let i = 0; i < this.concurrency; i++) {
      const context = await this.browser.newContext({
        reducedMotion: "reduce",
        deviceScaleFactor: 2,
        userAgent: `${await defaultUserAgent} CappaStorybook`,
        viewport: this.viewport,
      });
      const page = await context.newPage();

      this.contexts.push(context);
      this.pages.push(page);
    }

    // Backward compatibility
    this.context = this.contexts[0] ?? null;
    this.page = this.pages[0] ?? null;
  }

  /**
   * Closes browser
   * If not closed, the process will not exit
   */
  async close() {
    for (const context of this.contexts) {
      await context.close();
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
   * Takes a screenshot of the page
   */
  async takeScreenshot(
    page: Page,
    filename: string,
    options: ScreenshotSettings,
  ) {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    if (options.skip) {
      return;
    }

    try {
      // Generate filename - save to actual directory
      const filepath = this.filesystem.getActualFilePath(filename);

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

      await this.withViewport(page, options.viewport, async () => {
        if (options.delay) {
          await page.waitForTimeout(options.delay);
        }

        await page.screenshot(screenshotOptions);
      });

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
   * Sets the viewport size and executes the action, ensuring the original viewport is restored
   * even if the action throws an error.
   */
  private async withViewport<T>(
    page: Page,
    viewport: ScreenshotSettings["viewport"],
    action: () => Promise<T>,
  ): Promise<T> {
    if (!viewport) {
      return action();
    }

    const previousViewport = page.viewportSize();

    // Check if the new viewport is the same as the current one
    if (
      previousViewport &&
      previousViewport.width === viewport.width &&
      previousViewport.height === viewport.height
    ) {
      return action();
    }

    await page.setViewportSize(viewport);

    try {
      return await action();
    } finally {
      // Always restore the original viewport, even if the action throws an error
      if (previousViewport) {
        await page.setViewportSize(previousViewport);
      }
    }
  }

  /**
   * Takes a screenshot and returns the buffer (for comparison purposes)
   */
  async takeScreenshotBuffer(
    page: Page,
    options: ScreenshotSettings,
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

      const buffer = await this.withViewport(
        page,
        options.viewport,
        async () => {
          if (options.delay) {
            await page.waitForTimeout(options.delay);
          }

          return page.screenshot(screenshotOptions);
        },
      );

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
    options: ScreenshotSettings & {
      saveDiffImage?: boolean;
      diffImageFilename?: string;
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
      const filepath = this.filesystem.getActualFilePath(filename);

      const screenshotSettings: ScreenshotSettings = {
        fullPage: options.fullPage,
        mask: options.mask,
        omitBackground: options.omitBackground,
        delay: options.delay,
        viewport: options.viewport,
      };

      const retryScreenshot = await this.retryScreenshot(
        page,
        referenceImage,
        screenshotSettings,
      );

      if (!retryScreenshot.screenshotPath) {
        throw new Error("Screenshot buffer is undefined");
      }

      // Save screenshot to actual directory
      this.filesystem.writeActualFile(filename, retryScreenshot.screenshotPath);
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
        diffImagePath = this.filesystem.getDiffFilePath(diffFilename);

        this.filesystem.writeDiffFile(
          diffFilename,
          retryScreenshot.comparisonResult.diffBuffer,
        );

        this.logger.debug(`Diff image saved: ${diffImagePath}`);
      }

      // different sizes diff image
      if (retryScreenshot.comparisonResult.differentSizes) {
        this.logger.warn(`Screenshot has different sizes than reference image`);

        const diffFilename = options.diffImageFilename || filename;
        diffImagePath = this.filesystem.getDiffFilePath(diffFilename);
        const diffBuffer = createDiffSizePngImage(200, 200);

        this.filesystem.writeDiffFile(diffFilename, diffBuffer);

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
    options: ScreenshotSettings,
  ) {
    for (let i = 0; i < this.retries; i++) {
      try {
        const screenshotBuffer = await this.takeScreenshotBuffer(page, {
          ...options,
          delay: this.getIncBackoffDelay(i, options.delay || 0),
        });

        if (!screenshotBuffer) {
          throw new Error("Screenshot buffer is undefined");
        }

        const comparisonResult = await compareImages(
          screenshotBuffer,
          referenceImage,
          true,
          this.diff,
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

  getVariantFilename(filename: string, variant: ScreenshotVariant): string {
    if (variant.filename) {
      return variant.filename;
    }

    const parsed = path.parse(filename);
    const sanitizedId = variant.id
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = sanitizedId || "variant";
    const ext = parsed.ext || ".png";
    const variantName = `${parsed.name}--${suffix}${ext}`;

    return parsed.dir ? path.join(parsed.dir, variantName) : variantName;
  }

  /**
   * Captures a single screenshot with the given options
   */
  private async captureSingleScreenshot(
    page: Page,
    filename: string,
    options: ScreenshotSettings,
    extras: {
      saveDiffImage?: boolean;
      diffImageFilename?: string;
    } = {},
  ): Promise<ScreenshotCaptureDetails> {
    const result: ScreenshotCaptureDetails = { filename };

    if (options.skip) {
      result.skipped = true;
      return result;
    }

    const saveDiff = extras.saveDiffImage ?? false;
    const diffFilename = extras.diffImageFilename ?? filename;

    if (this.filesystem.hasExpectedFile(filename)) {
      const { screenshotPath, comparisonResult, diffImagePath } =
        await this.takeScreenshotWithComparison(
          page,
          filename,
          this.filesystem.readExpectedFile(filename),
          {
            ...options,
            saveDiffImage: saveDiff,
            diffImageFilename: diffFilename,
          },
        );

      result.filepath = screenshotPath;
      result.comparisonResult = comparisonResult;
      result.diffImagePath = diffImagePath;
    } else {
      result.filepath = await this.takeScreenshot(page, filename, options);
    }

    return result;
  }

  async capture(
    page: Page,
    filename: string,
    options: ScreenshotOptions,
    extras: ScreenshotCaptureExtras = {},
  ): Promise<ScreenshotCaptureResult> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const { variants = [], ...baseOptions } = options;
    const baseResult: ScreenshotCaptureDetails = { filename };
    const variantResults: ScreenshotVariantCaptureDetails[] = [];

    const baseSaveDiff = extras.saveDiffImage ?? false;
    const baseDiffFilename = extras.diffImageFilename ?? filename;

    if (baseOptions.skip) {
      return {
        base: { ...baseResult, skipped: true },
        variants: variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          filename: this.getVariantFilename(filename, variant),
          skipped: true,
        })),
      };
    }

    // Capture base screenshot
    const baseCaptureResult = await this.captureSingleScreenshot(
      page,
      filename,
      baseOptions,
      {
        saveDiffImage: baseSaveDiff,
        diffImageFilename: baseDiffFilename,
      },
    );

    baseResult.filepath = baseCaptureResult.filepath;
    baseResult.comparisonResult = baseCaptureResult.comparisonResult;
    baseResult.diffImagePath = baseCaptureResult.diffImagePath;
    baseResult.skipped = baseCaptureResult.skipped;

    for (const variant of variants) {
      const variantFilename = this.getVariantFilename(filename, variant);
      const variantOptions: ScreenshotSettings = {
        ...baseOptions,
        ...variant.options,
      };

      const variantResult: ScreenshotVariantCaptureDetails = {
        id: variant.id,
        label: variant.label,
        filename: variantFilename,
      };

      if (variantOptions.skip) {
        variantResult.skipped = true;
        variantResults.push(variantResult);
        continue;
      }

      const variantExtra = extras.variants?.[variant.id];
      const variantSaveDiff = variantExtra?.saveDiffImage ?? baseSaveDiff;
      const variantDiffFilename =
        variantExtra?.diffImageFilename ?? variantFilename;

      const variantCaptureResult = await this.captureSingleScreenshot(
        page,
        variantFilename,
        variantOptions,
        {
          saveDiffImage: variantSaveDiff,
          diffImageFilename: variantDiffFilename,
        },
      );

      variantResult.filepath = variantCaptureResult.filepath;
      variantResult.comparisonResult = variantCaptureResult.comparisonResult;
      variantResult.diffImagePath = variantCaptureResult.diffImagePath;
      variantResult.skipped = variantCaptureResult.skipped;

      variantResults.push(variantResult);
    }

    return {
      base: baseResult,
      variants: variantResults,
    };
  }

  /**
   * Applies SVG and UI optimizations for screenshots
   */
  private async applyScreenshotOptimizations(page: Page) {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          -moz-animation: none !important;
          -moz-transition: none !important;
          transition: none !important; 
          animation: none !important;
        }
        *, input, textarea { caret-color: transparent !important }
        *:focus { outline: none !important }
        *:focus-visible { outline: none !important }
        *:focus-within { outline: none !important }
        * { text-rendering: optimizeLegibility !important }
        ::-webkit-scrollbar { display: none !important }
        html { scroll-behavior: auto !important }
        svg, svg * {
          shape-rendering: crispEdges !important;
          text-rendering: geometricPrecision !important;
          vector-effect: non-scaling-stroke !important;
        }
        img { image-rendering: crisp-edges !important }
      `,
    });
  }

  /**
   * Captures screenshots for multiple variants, each with their own URL
   */
  async captureWithVariants(
    page: Page,
    baseFilename: string,
    baseUrl: string,
    baseOptions: ScreenshotSettings,
    variants: ScreenshotVariantWithUrl[],
    extras: ScreenshotCaptureExtras = {},
  ): Promise<ScreenshotCaptureResult> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const baseResult: ScreenshotCaptureDetails = { filename: baseFilename };
    const variantResults: ScreenshotVariantCaptureDetails[] = [];

    const baseSaveDiff = extras.saveDiffImage ?? false;
    const baseDiffFilename = extras.diffImageFilename ?? baseFilename;

    // Capture base screenshot
    getLogger().debug(`Going to base URL: ${baseUrl}`);
    await page.goto(baseUrl);
    await this.applyScreenshotOptimizations(page);
    const baseCaptureResult = await this.captureSingleScreenshot(
      page,
      baseFilename,
      baseOptions,
      {
        saveDiffImage: baseSaveDiff,
        diffImageFilename: baseDiffFilename,
      },
    );

    baseResult.filepath = baseCaptureResult.filepath;
    baseResult.comparisonResult = baseCaptureResult.comparisonResult;
    baseResult.diffImagePath = baseCaptureResult.diffImagePath;
    baseResult.skipped = baseCaptureResult.skipped;

    // Capture variant screenshots
    for (const variant of variants) {
      const variantFilename =
        variant.filename || this.getVariantFilename(baseFilename, variant);
      const variantOptions: ScreenshotSettings = {
        ...baseOptions,
        ...variant.options,
      };

      const variantResult: ScreenshotVariantCaptureDetails = {
        id: variant.id,
        label: variant.label,
        filename: variantFilename,
      };

      if (variantOptions.skip) {
        variantResult.skipped = true;
        variantResults.push(variantResult);
        continue;
      }

      // Navigate to variant URL and apply optimizations
      getLogger().debug(`Going to variant URL: ${variant.url}`);
      await page.goto(variant.url);
      await this.applyScreenshotOptimizations(page);

      const variantExtra = extras.variants?.[variant.id];
      const variantSaveDiff = variantExtra?.saveDiffImage ?? baseSaveDiff;
      const variantDiffFilename =
        variantExtra?.diffImageFilename ?? variantFilename;

      const variantCaptureResult = await this.captureSingleScreenshot(
        page,
        variantFilename,
        variantOptions,
        {
          saveDiffImage: variantSaveDiff,
          diffImageFilename: variantDiffFilename,
        },
      );

      variantResult.filepath = variantCaptureResult.filepath;
      variantResult.comparisonResult = variantCaptureResult.comparisonResult;
      variantResult.diffImagePath = variantCaptureResult.diffImagePath;
      variantResult.skipped = variantCaptureResult.skipped;

      variantResults.push(variantResult);
    }

    return {
      base: baseResult,
      variants: variantResults,
    };
  }

  /**
   * Gets the exponential backoff delay
   */
  getIncBackoffDelay(i: number, delay: number): number {
    return i > 0 ? 500 * 2 ** (i - 1) + (delay || 0) : 0;
  }

  /**
   * Get a page from the pool by index
   */
  getPageFromPool(index: number): Page {
    if (index < 0) {
      throw new Error(`Page index ${index} must be non-negative`);
    }

    if (index >= this.pages.length) {
      throw new Error(
        `Page index ${index} exceeds pool size ${this.pages.length}`,
      );
    }

    if (!this.pages[index]) {
      throw new Error(`Page index ${index} is undefined`);
    }

    return this.pages[index];
  }
}

export default ScreenshotTool;
