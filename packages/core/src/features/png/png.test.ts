import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PNG as PngjsPNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";

import { PNG as CappaPNG } from "./png";

type PngWithMetadata = PngjsPNG & { text?: Record<string, string> };

function createPngBuffer(metadata?: Record<string, string>) {
  const png = new PngjsPNG({ width: 2, height: 2 }) as PngWithMetadata;

  // Fill with opaque black pixels
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0; // Red
    png.data[i + 1] = 0; // Green
    png.data[i + 2] = 0; // Blue
    png.data[i + 3] = 255; // Alpha
  }

  if (metadata) {
    png.text = metadata;
  }

  return PngjsPNG.sync.write(png);
}

async function createPngBufferWithMetadata(metadata: Record<string, string>) {
  const png = await CappaPNG.load(createPngBuffer());
  png.replaceMetadata(metadata);

  return png.toBuffer();
}

describe("PNG", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("loads a PNG from a buffer including metadata", async () => {
    const buffer = await createPngBufferWithMetadata({ author: "cappa" });

    const png = await CappaPNG.load(buffer);

    expect(png.width).toBe(2);
    expect(png.height).toBe(2);
    expect(png.metadata).toEqual({ author: "cappa" });
  });

  it("loads a PNG from a file path", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cappa-png-"));
    temporaryDirectories.push(directory);
    const filepath = path.join(directory, "image.png");

    await writeFile(filepath, createPngBuffer());

    const png = await CappaPNG.load(filepath);

    expect(png.width).toBe(2);
    expect(png.height).toBe(2);
    expect(png.metadata).toEqual({});
  });

  it("adds and updates metadata entries and preserves them when written", async () => {
    const png = await CappaPNG.load(
      await createPngBufferWithMetadata({ author: "initial" }),
    );

    png.setMetadata("author", "updated");
    png.setMetadata("branch", "main");

    const reloaded = await CappaPNG.load(png.toBuffer());

    expect(reloaded.metadata).toEqual({ author: "updated", branch: "main" });
  });

  it("removes specific metadata entries", async () => {
    const png = await CappaPNG.load(
      await createPngBufferWithMetadata({
        author: "cappa",
        branch: "main",
        version: "1.0",
      }),
    );

    png.removeMetadata("branch");

    const reloaded = await CappaPNG.load(png.toBuffer());

    expect(reloaded.metadata).toEqual({ author: "cappa", version: "1.0" });
  });

  it("clears all metadata entries", async () => {
    const png = await CappaPNG.load(
      await createPngBufferWithMetadata({ author: "cappa", branch: "main" }),
    );

    png.clearMetadata();

    expect(png.metadata).toEqual({});
    expect(await CappaPNG.load(png.toBuffer()).then((p) => p.metadata)).toEqual(
      {},
    );
  });

  it("saves to a provided filepath with updated metadata", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cappa-png-"));
    temporaryDirectories.push(directory);
    const filepath = path.join(directory, "image.png");

    const png = await CappaPNG.load(createPngBuffer());
    png.setMetadata("commit", "abc123");

    await png.save(filepath);

    const savedBuffer = await readFile(filepath);
    const reloaded = await CappaPNG.load(savedBuffer);

    expect(reloaded.metadata).toEqual({ commit: "abc123" });
  });
});
