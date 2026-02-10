import fs from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";
import { extractTextMetadata, injectTextMetadata } from "./features/png/util";

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

    this.ensureParentDir(this.actual);
    this.ensureParentDir(this.expected);
    this.ensureParentDir(this.diff);
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
  approveFromActualPath(actualFilePath: string) {
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
   * Approve a screenshot based on its name.
   * @param name - The name of the screenshot. Can include '.png' extension.
   * @returns The paths to the actual, expected, and diff screenshot files.
   */
  approveByName(name: string) {
    const relativeWithExtension = name.endsWith(".png") ? name : `${name}.png`;

    return this.approveRelative(relativeWithExtension);
  }

  /**
   * Approve a screenshot based on a relative path.
   * @param relativePath - The relative path to the screenshot.
   * @returns The paths to the actual, expected, and diff screenshot files.
   */
  private approveRelative(relativePath: string) {
    const actualPath = path.resolve(this.actual, relativePath);
    const expectedPath = path.resolve(this.expected, relativePath);
    const diffPath = path.resolve(this.diff, relativePath);

    this.ensureParentDir(expectedPath);

    fs.copyFileSync(actualPath, expectedPath);

    if (fs.existsSync(diffPath)) {
      this.copyDiffMetadataToExpected(diffPath, expectedPath);
      fs.unlinkSync(diffPath);
    }

    return {
      actualPath,
      expectedPath,
      diffPath,
    };
  }

  private copyDiffMetadataToExpected(diffPath: string, expectedPath: string) {
    const diffExtension = path.extname(diffPath).toLowerCase();
    const expectedExtension = path.extname(expectedPath).toLowerCase();

    if (diffExtension !== ".png" || expectedExtension !== ".png") {
      return;
    }

    try {
      const diffBuffer = fs.readFileSync(diffPath);
      const diffMetadata = extractTextMetadata(diffBuffer);

      if (Object.keys(diffMetadata).length === 0) {
        return;
      }

      const expectedBuffer = fs.readFileSync(expectedPath);
      const expectedMetadata = extractTextMetadata(expectedBuffer);

      const mergedMetadata = {
        ...expectedMetadata,
        ...diffMetadata,
      };

      const expectedWithMetadata = injectTextMetadata(
        expectedBuffer,
        mergedMetadata,
      );
      fs.writeFileSync(expectedPath, expectedWithMetadata);
    } catch {
      // Ignore metadata transfer errors to keep approval resilient.
    }
  }

  /**
   * Ensure the parent directory of a file exists. If not, it creates it.
   * @param filePath - The path to the file.
   */
  ensureParentDir(filePath: string) {
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
  writeActualFile(filename: string, data: Buffer): void {
    const filepath = this.getActualFilePath(filename);
    this.ensureParentDir(filepath);
    fs.writeFileSync(filepath, data);
  }

  /**
   * Write a file to the diff directory
   */
  writeDiffFile(filename: string, data: Buffer): void {
    const filepath = this.getDiffFilePath(filename);
    this.ensureParentDir(filepath);
    fs.writeFileSync(filepath, data);
  }

  /**
   * Check if an expected file exists
   */
  hasExpectedFile(filename: string): boolean {
    const expectedPath = this.getExpectedFilePath(filename);
    return fs.existsSync(expectedPath);
  }

  /**
   * Read an expected file
   */
  readExpectedFile(filename: string): Buffer {
    const expectedPath = this.getExpectedFilePath(filename);
    if (!fs.existsSync(expectedPath)) {
      throw new Error(`Expected image not found: ${expectedPath}`);
    }
    return fs.readFileSync(expectedPath);
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
