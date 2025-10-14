import fs from "node:fs";
import path from "node:path";

export class ScreenshotFileSystem {
  private readonly actualDir: string;
  private readonly expectedDir: string;
  private readonly diffDir: string;

  constructor(outputDir: string) {
    this.actualDir = path.resolve(outputDir, "actual");
    this.expectedDir = path.resolve(outputDir, "expected");
    this.diffDir = path.resolve(outputDir, "diff");
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

  approveByName(name: string) {
    const relativeWithExtension = name.endsWith(".png") ? name : `${name}.png`;

    return this.approveRelative(relativeWithExtension);
  }

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

  private ensureParentDir(filePath: string) {
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private removeDir(dir: string) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  private resolveActualPath(filePath: string) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    return path.resolve(this.actualDir, filePath);
  }
}
