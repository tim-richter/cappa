import fs from "node:fs";
import fsp, { glob } from "node:fs/promises";
import path from "node:path";
import { getLogger } from "@cappa/logger";
import { imagesMatch } from "./compare/pixel";
import { extractTextMetadata, injectTextMetadata } from "./features/png/util";
import { mapWithConcurrency } from "./mapWithConcurrency";
import type { DiffConfig, DiffOptions, Screenshot } from "./types";

const APPROVE_SCREENSHOTS_CONCURRENCY = 8;

/**
 * Class for interacting with the local file system to store the screenshots.
 */
export class ScreenshotFileSystem {
  private readonly actual: string;
  private readonly expected: string;
  private readonly diff: string;

  constructor(outputDir: string) {
    this.actual = path.resolve(outputDir, "actual");
    this.expected = path.resolve(outputDir, "expected");
    this.diff = path.resolve(outputDir, "diff");

    this.ensureParentDirSync(this.actual);
    this.ensureParentDirSync(this.expected);
    this.ensureParentDirSync(this.diff);
  }

  clearActual() {
    this.removeDir(this.actual);
  }

  clearDiff() {
    this.removeDir(this.diff);
  }

  getActualScreenshots(): Promise<string[]> {
    return Array.fromAsync(glob(path.resolve(this.actual, "**/*.png")));
  }

  getExpectedScreenshots(): Promise<string[]> {
    return Array.fromAsync(glob(path.resolve(this.expected, "**/*.png")));
  }

  getDiffScreenshots(): Promise<string[]> {
    return Array.fromAsync(glob(path.resolve(this.diff, "**/*.png")));
  }

  clearActualAndDiff() {
    this.clearActual();
    this.clearDiff();
  }

  /**
   * Approve a screenshot based on its actual file path.
   * @param actualFilePath - The path to the actual screenshot file.
   * @returns The paths to the actual, expected, and diff screenshot files.
   */
  async approveFromActualPath(actualFilePath: string) {
    const actualAbsolute = this.resolveActualPath(actualFilePath);
    const relativePath = path.relative(this.actual, actualAbsolute);

    if (relativePath.startsWith("..")) {
      throw new Error(
        `Cannot approve screenshot outside of actual directory: ${actualFilePath}`,
      );
    }

    return this.approveRelative(relativePath);
  }

  /**
   * Apply baseline updates for grouped screenshots (same rules as `cappa approve`).
   */
  async approveScreenshots(
    screenshots: Screenshot[],
    diff: DiffOptions,
  ): Promise<void> {
    const outputDir = path.dirname(this.actual);

    await mapWithConcurrency(
      APPROVE_SCREENSHOTS_CONCURRENCY,
      screenshots,
      (screenshot) => this.approveOneScreenshot(screenshot, outputDir, diff),
    );
  }

  private async approveOneScreenshot(
    screenshot: Screenshot,
    outputDir: string,
    diff: DiffOptions,
  ): Promise<void> {
    const logger = getLogger();

    logger.debug(`Approving screenshot with category: ${screenshot.category}`);

    if (screenshot.category === "new") {
      logger.debug(`Approving new screenshot: ${screenshot.actualPath}`);
      await this.approveFromActualPath(
        path.resolve(outputDir, screenshot.actualPath),
      );
      return;
    }

    if (screenshot.category === "deleted") {
      logger.debug(`Deleting expected screenshot: ${screenshot.expectedPath}`);
      await fsp.unlink(path.resolve(outputDir, screenshot.expectedPath));
      return;
    }

    if (screenshot.category === "changed") {
      logger.debug(`Deleting diff screenshot: ${screenshot.diffPath}`);
      await fsp.unlink(path.resolve(outputDir, screenshot.diffPath));
      await this.approveFromActualPath(
        path.resolve(outputDir, screenshot.actualPath),
      );
      return;
    }

    if (screenshot.category === "passed") {
      if (!screenshot.expectedPath) {
        throw new Error("Expected path is required for passed screenshots");
      }

      const matches = await imagesMatch(
        path.resolve(outputDir, screenshot.actualPath),
        path.resolve(outputDir, screenshot.expectedPath),
        diff.type === "gmsd"
          ? { threshold: diff.threshold }
          : (diff as DiffConfig),
      );

      if (!matches) {
        await this.approveFromActualPath(
          path.resolve(outputDir, screenshot.actualPath),
        );
      }
    }
  }

  /**
   * Approve a screenshot based on its name.
   * @param name - The name of the screenshot. Can include '.png' extension.
   * @returns The paths to the actual, expected, and diff screenshot files.
   */
  async approveByName(name: string) {
    const relativeWithExtension = name.endsWith(".png") ? name : `${name}.png`;

    return this.approveRelative(relativeWithExtension);
  }

  /**
   * Approve a screenshot based on a relative path.
   * @param relativePath - The relative path to the screenshot.
   * @returns The paths to the actual, expected, and diff screenshot files.
   */
  private async approveRelative(relativePath: string) {
    const actualPath = path.resolve(this.actual, relativePath);
    const expectedPath = path.resolve(this.expected, relativePath);
    const diffPath = path.resolve(this.diff, relativePath);

    await this.ensureParentDir(expectedPath);

    await fsp.copyFile(actualPath, expectedPath);

    try {
      await fsp.access(diffPath);
    } catch {
      return {
        actualPath,
        expectedPath,
        diffPath,
      };
    }

    await this.copyDiffMetadataToExpected(diffPath, expectedPath);
    await fsp.unlink(diffPath);

    return {
      actualPath,
      expectedPath,
      diffPath,
    };
  }

  private async copyDiffMetadataToExpected(
    diffPath: string,
    expectedPath: string,
  ): Promise<void> {
    const diffExtension = path.extname(diffPath).toLowerCase();
    const expectedExtension = path.extname(expectedPath).toLowerCase();

    if (diffExtension !== ".png" || expectedExtension !== ".png") {
      return;
    }

    try {
      const diffBuffer = await fsp.readFile(diffPath);
      const diffMetadata = extractTextMetadata(diffBuffer);

      if (Object.keys(diffMetadata).length === 0) {
        return;
      }

      const expectedBuffer = await fsp.readFile(expectedPath);
      const expectedMetadata = extractTextMetadata(expectedBuffer);

      const mergedMetadata = {
        ...expectedMetadata,
        ...diffMetadata,
      };

      const expectedWithMetadata = injectTextMetadata(
        expectedBuffer,
        mergedMetadata,
      );
      await fsp.writeFile(expectedPath, expectedWithMetadata);
    } catch {
      // Ignore metadata transfer errors to keep approval resilient.
    }
  }

  /**
   * Ensure the parent directory of a file exists. If not, it creates it.
   * @param filePath - The path to the file.
   */
  async ensureParentDir(filePath: string) {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
  }

  /**
   * Synchronous version used only during constructor initialization.
   */
  private ensureParentDirSync(filePath: string) {
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Remove a directory and all its contents.
   * @param dir - The path to the directory.
   */
  private removeDir(dir: string) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /**
   * Get the actual directory path
   */
  getActualDir(): string {
    return this.actual;
  }

  /**
   * Get the expected directory path
   */
  getExpectedDir(): string {
    return this.expected;
  }

  /**
   * Get the diff directory path
   */
  getDiffDir(): string {
    return this.diff;
  }

  /**
   * Get the path to an actual screenshot file
   */
  getActualFilePath(filename: string): string {
    return path.resolve(this.actual, filename);
  }

  /**
   * Get the path to an expected screenshot file
   */
  getExpectedFilePath(filename: string): string {
    return path.resolve(this.expected, filename);
  }

  /**
   * Get the path to a diff screenshot file
   */
  getDiffFilePath(filename: string): string {
    return path.resolve(this.diff, filename);
  }

  /**
   * Write a file to the actual directory
   */
  async writeActualFile(filename: string, data: Buffer): Promise<void> {
    const filepath = this.getActualFilePath(filename);
    await this.ensureParentDir(filepath);
    await fsp.writeFile(filepath, data);
  }

  /**
   * Write a file to the diff directory
   */
  async writeDiffFile(filename: string, data: Buffer): Promise<void> {
    const filepath = this.getDiffFilePath(filename);
    await this.ensureParentDir(filepath);
    await fsp.writeFile(filepath, data);
  }

  /**
   * Check if an expected file exists
   */
  async hasExpectedFile(filename: string): Promise<boolean> {
    const expectedPath = this.getExpectedFilePath(filename);
    try {
      await fsp.access(expectedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read an expected file
   */
  async readExpectedFile(filename: string): Promise<Buffer> {
    const expectedPath = this.getExpectedFilePath(filename);
    try {
      return await fsp.readFile(expectedPath);
    } catch {
      throw new Error(`Expected image not found: ${expectedPath}`);
    }
  }

  /**
   * Resolve the actual path of a screenshot file.
   * @param filePath - The path to the screenshot file.
   * @returns The actual path of the screenshot file.
   */
  private resolveActualPath(filePath: string) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    return path.resolve(this.actual, filePath);
  }

  getRelativePath(directory: "actual" | "expected" | "diff", filePath: string) {
    const relativePath = path.relative(this[directory], filePath);

    if (relativePath.startsWith("..")) {
      throw new Error(
        `Cannot resolve relative path outside of ${directory} directory: ${filePath}`,
      );
    }

    return relativePath;
  }
}
