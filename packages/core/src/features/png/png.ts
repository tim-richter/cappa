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

  /**
   * A copy of this image on a `width` × `height` canvas, anchored top-left,
   * with the added area filled with `fill` (RGBA, transparent by default).
   *
   * This is how two screenshots of different sizes are given a shared
   * coordinate space: a component that grew keeps its pixels where they were.
   */
  padTo(
    width: number,
    height: number,
    fill: readonly [number, number, number, number] = [0, 0, 0, 0],
  ): PNG {
    if (width < this.width_ || height < this.height_) {
      throw new Error(
        `Cannot pad a ${this.width_}x${this.height_} image to a smaller ${width}x${height} canvas`,
      );
    }

    if (width === this.width_ && height === this.height_) {
      return new PNG(width, height, Buffer.from(this.data_));
    }

    const data = Buffer.alloc(width * height * 4);
    const pixel = Buffer.from(fill);
    for (let offset = 0; offset < data.length; offset += 4) {
      pixel.copy(data, offset);
    }

    const rowBytes = this.width_ * 4;
    for (let y = 0; y < this.height_; y++) {
      this.data_.copy(data, y * width * 4, y * rowBytes, (y + 1) * rowBytes);
    }

    return new PNG(width, height, data);
  }

  /**
   * The most common colour along the right column and the bottom row — the
   * edges a top-left anchored {@link padTo} extends. For a screenshot that is
   * its background, which is what the area it never covered should read as.
   */
  edgeColor(): [number, number, number, number] {
    const counts = new Map<number, number>();
    let best = 0;
    let bestCount = 0;

    const count = (x: number, y: number) => {
      const value = this.data_.readUInt32BE((y * this.width_ + x) * 4);
      const next = (counts.get(value) ?? 0) + 1;
      counts.set(value, next);
      if (next > bestCount) {
        best = value;
        bestCount = next;
      }
    };

    if (this.width_ === 0 || this.height_ === 0) return [0, 0, 0, 0];

    for (let y = 0; y < this.height_; y++) count(this.width_ - 1, y);
    for (let x = 0; x < this.width_ - 1; x++) count(x, this.height_ - 1);

    return [
      (best >>> 24) & 0xff,
      (best >>> 16) & 0xff,
      (best >>> 8) & 0xff,
      best & 0xff,
    ];
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
