import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { MetadataEntries } from "./types";
import { extractTextMetadata, injectTextMetadata } from "./util";

/**
 * A wrapper around `sharp` that adds support for reading and writing
 * textual metadata (tEXt chunks). Used for fast PNG decode/encode.
 */
export class PNG {
  private width_: number;
  private height_: number;
  private data_: Buffer;
  private sourcePath?: string;
  private metadataEntries: MetadataEntries;

  private constructor(
    width: number,
    height: number,
    data: Buffer,
    sourcePath?: string,
    metadata?: MetadataEntries,
  ) {
    this.width_ = width;
    this.height_ = height;
    this.data_ = data;
    this.sourcePath = sourcePath;
    this.metadataEntries = { ...(metadata ?? {}) };
  }

  static create(width: number, height: number): PNG {
    const data = Buffer.alloc(width * height * 4, 0);
    return new PNG(width, height, data);
  }

  static async load(source: string | Buffer): Promise<PNG> {
    const buffer = typeof source === "string" ? await readFile(source) : source;
    const metadata = extractTextMetadata(buffer);

    const pipeline = sharp(buffer).ensureAlpha();
    const { data: raw, info } = await pipeline
      .raw()
      .toBuffer({ resolveWithObject: true });

    const data = Buffer.from(raw);
    const sourcePath = typeof source === "string" ? source : undefined;

    return new PNG(info.width, info.height, data, sourcePath, metadata);
  }

  get width(): number {
    return this.width_;
  }

  get height(): number {
    return this.height_;
  }

  get data(): Buffer {
    return this.data_;
  }

  get metadata(): MetadataEntries {
    return { ...this.metadataEntries };
  }

  setMetadata(key: string, value: string): void {
    this.metadataEntries = { ...this.metadataEntries, [key]: value };
  }

  replaceMetadata(metadata: MetadataEntries): void {
    this.metadataEntries = { ...metadata };
  }

  removeMetadata(key: string): void {
    const { [key]: _, ...remaining } = this.metadataEntries;
    this.metadataEntries = remaining;
  }

  clearMetadata(): void {
    this.metadataEntries = {};
  }

  async toBuffer(): Promise<Buffer> {
    const baseBuffer = await sharp(this.data_, {
      raw: { width: this.width_, height: this.height_, channels: 4 },
    })
      .png()
      .toBuffer();

    if (Object.keys(this.metadataEntries).length === 0) {
      return baseBuffer;
    }

    return injectTextMetadata(baseBuffer, this.metadataEntries);
  }

  async save(filepath?: string): Promise<void> {
    const targetPath = filepath ?? this.sourcePath;

    if (!targetPath) {
      throw new Error("No filepath provided for saving PNG");
    }

    await writeFile(targetPath, await this.toBuffer());
  }
}
