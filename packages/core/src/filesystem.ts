import fs from "node:fs";
import path from "node:path";

/**
 * Class for interacting with the local file system to store the screenshots.
 */
export class ScreenshotFileSystem {
  private readonly actualDir: string;
  private readonly expectedDir: string;
  private readonly diffDir: string;

  constructor(outputDir: string) {
    this.actualDir = path.resolve(outputDir, "actual");
    this.expectedDir = path.resolve(outputDir, "expected");
    this.diffDir = path.resolve(outputDir, "diff");

    this.ensureParentDir(this.actualDir);
    this.ensureParentDir(this.expectedDir);
    this.ensureParentDir(this.diffDir);
  }

  clearActual() {
    this.removeDir(this.actualDir);
  }

  clearDiff() {
    this.removeDir(this.diffDir);
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
    const relativePath = path.relative(this.actualDir, actualAbsolute);

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
    const actualPath = path.resolve(this.actualDir, relativePath);
    const expectedPath = path.resolve(this.expectedDir, relativePath);
    const diffPath = path.resolve(this.diffDir, relativePath);

    this.ensureParentDir(expectedPath);

    fs.copyFileSync(actualPath, expectedPath);

    if (fs.existsSync(diffPath)) {
      fs.unlinkSync(diffPath);
    }

    return {
      actualPath,
      expectedPath,
      diffPath,
    };
  }

  /**
   * Ensure the parent directory of a file exists. If not, it creates it.
   * @param filePath - The path to the file.
   */
  private ensureParentDir(filePath: string) {
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
    return this.actualDir;
  }

  /**
   * Get the expected directory path
   */
  getExpectedDir(): string {
    return this.expectedDir;
  }

  /**
   * Get the diff directory path
   */
  getDiffDir(): string {
    return this.diffDir;
  }

  /**
   * Get the path to an actual screenshot file
   */
  getActualFilePath(filename: string): string {
    return path.resolve(this.actualDir, filename);
  }

  /**
   * Get the path to an expected screenshot file
   */
  getExpectedFilePath(filename: string): string {
    return path.resolve(this.expectedDir, filename);
  }

  /**
   * Get the path to a diff screenshot file
   */
  getDiffFilePath(filename: string): string {
    return path.resolve(this.diffDir, filename);
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

    return path.resolve(this.actualDir, filePath);
  }
}
