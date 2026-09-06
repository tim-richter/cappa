import path from "node:path";
import { ScreenshotFileSystem } from "./filesystem";
import type { DiffMetadata } from "./types";

/** The three buckets a screenshot can live in. */
export type ScreenshotBucket = "actual" | "expected" | "diff";

/**
 * Byte storage for screenshots, addressed by bucket + relative key
 * (`button--primary.png`, `nested/card.png`).
 *
 * `ScreenshotFileSystem` is local-disk by construction, which is correct for
 * the CLI and a local server but not for an engine running on a machine the
 * reviewer cannot reach. This interface is the seam: an object-store
 * implementation later is an implementation, not a fork.
 *
 * Only `FsScreenshotStore` exists today — nothing in the codebase depends on a
 * second implementation, and none is planned in this change.
 */
export interface ScreenshotStore {
  has(bucket: ScreenshotBucket, key: string): Promise<boolean>;
  read(bucket: ScreenshotBucket, key: string): Promise<Buffer>;
  write(bucket: ScreenshotBucket, key: string, data: Buffer): Promise<void>;
  /** Relative keys, recursively. */
  list(bucket: ScreenshotBucket): Promise<string[]>;
  remove(bucket: ScreenshotBucket, key: string): Promise<void>;
  /** Drop every object in a bucket. */
  clear(bucket: ScreenshotBucket): Promise<void>;
  readMeta(key: string): Promise<DiffMetadata | undefined>;
  writeMeta(key: string, meta: DiffMetadata): Promise<void>;
}

/**
 * `ScreenshotStore` over the local filesystem, delegating to
 * `ScreenshotFileSystem` so both views stay consistent.
 */
export class FsScreenshotStore implements ScreenshotStore {
  private readonly fs: ScreenshotFileSystem;

  constructor(outputDirOrFs: string | ScreenshotFileSystem) {
    this.fs =
      typeof outputDirOrFs === "string"
        ? new ScreenshotFileSystem(outputDirOrFs)
        : outputDirOrFs;
  }

  private dirFor(bucket: ScreenshotBucket): string {
    if (bucket === "actual") return this.fs.getActualDir();
    if (bucket === "expected") return this.fs.getExpectedDir();
    return this.fs.getDiffDir();
  }

  private pathFor(bucket: ScreenshotBucket, key: string): string {
    if (bucket === "actual") return this.fs.getActualFilePath(key);
    if (bucket === "expected") return this.fs.getExpectedFilePath(key);
    return this.fs.getDiffFilePath(key);
  }

  async has(bucket: ScreenshotBucket, key: string): Promise<boolean> {
    if (bucket === "expected") {
      return this.fs.hasExpectedFile(key);
    }

    const fsp = await import("node:fs/promises");
    try {
      await fsp.access(this.pathFor(bucket, key));
      return true;
    } catch {
      return false;
    }
  }

  async read(bucket: ScreenshotBucket, key: string): Promise<Buffer> {
    if (bucket === "expected") {
      return this.fs.readExpectedFile(key);
    }

    const fsp = await import("node:fs/promises");
    return fsp.readFile(this.pathFor(bucket, key));
  }

  async write(
    bucket: ScreenshotBucket,
    key: string,
    data: Buffer,
  ): Promise<void> {
    if (bucket === "actual") {
      await this.fs.writeActualFile(key, data);
      return;
    }
    if (bucket === "diff") {
      await this.fs.writeDiffFile(key, data);
      return;
    }

    const filePath = this.pathFor(bucket, key);
    await this.fs.ensureParentDir(filePath);
    const fsp = await import("node:fs/promises");
    await fsp.writeFile(filePath, data);
  }

  async list(bucket: ScreenshotBucket): Promise<string[]> {
    const files =
      bucket === "actual"
        ? await this.fs.getActualScreenshots()
        : bucket === "expected"
          ? await this.fs.getExpectedScreenshots()
          : await this.fs.getDiffScreenshots();

    const dir = this.dirFor(bucket);
    return files.map((file) => path.relative(dir, file));
  }

  async remove(bucket: ScreenshotBucket, key: string): Promise<void> {
    const fsp = await import("node:fs/promises");
    await fsp.rm(this.pathFor(bucket, key), { force: true });
  }

  async clear(bucket: ScreenshotBucket): Promise<void> {
    if (bucket === "actual") {
      this.fs.clearActual();
      return;
    }
    if (bucket === "diff") {
      this.fs.clearDiff();
      return;
    }

    throw new Error(
      "Refusing to clear the expected/ bucket: it holds the approved baselines",
    );
  }

  async readMeta(key: string): Promise<DiffMetadata | undefined> {
    const { readDiffMeta } = await import("./filesystem");
    return readDiffMeta(this.fs.getDiffFilePath(key));
  }

  async writeMeta(key: string, meta: DiffMetadata): Promise<void> {
    await this.fs.writeDiffMetaFile(key, meta);
  }
}
