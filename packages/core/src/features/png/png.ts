import { readFile, writeFile } from "node:fs/promises";
import { type PackerOptions, PNG as PngjsPNG } from "pngjs";
import type { MetadataEntries, PngWithMetadata } from "./types";
import { extractTextMetadata, injectTextMetadata } from "./util";

/**
 * A wrapper around `pngjs` that adds support for reading and writing
 * textual metadata (tEXt chunks).
 */
export class PNG {
  private image: PngWithMetadata;
  private sourcePath?: string;
  private metadataEntries: MetadataEntries;

  private constructor(
    image: PngWithMetadata,
    sourcePath?: string,
    metadata?: MetadataEntries,
  ) {
    this.image = image;
    this.sourcePath = sourcePath;
    this.metadataEntries = { ...(metadata ?? {}) };
  }

  static async load(source: string | Buffer) {
    const buffer = typeof source === "string" ? await readFile(source) : source;
    const png = PngjsPNG.sync.read(buffer) as PngWithMetadata;

    const metadata = extractTextMetadata(buffer);

    return new PNG(
      png,
      typeof source === "string" ? source : undefined,
      metadata,
    );
  }

  get width() {
    return this.image.width;
  }

  get height() {
    return this.image.height;
  }

  get data() {
    return this.image.data;
  }

  get metadata(): MetadataEntries {
    return { ...this.metadataEntries };
  }

  setMetadata(key: string, value: string) {
    this.metadataEntries = { ...this.metadataEntries, [key]: value };
  }

  replaceMetadata(metadata: MetadataEntries) {
    this.metadataEntries = { ...metadata };
  }

  removeMetadata(key: string) {
    const { [key]: _, ...remaining } = this.metadataEntries;
    this.metadataEntries = remaining;
  }

  clearMetadata() {
    this.metadataEntries = {};
  }

  toBuffer(options?: PackerOptions) {
    const baseBuffer = PngjsPNG.sync.write(this.image, options);

    if (Object.keys(this.metadataEntries).length === 0) {
      return baseBuffer;
    }

    return injectTextMetadata(baseBuffer, this.metadataEntries);
  }

  async save(filepath?: string, options?: PackerOptions) {
    const targetPath = filepath ?? this.sourcePath;

    if (!targetPath) {
      throw new Error("No filepath provided for saving PNG");
    }

    await writeFile(targetPath, this.toBuffer(options));
  }
}
