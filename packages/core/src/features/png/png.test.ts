import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PNG as CappaPNG } from "./png";

async function createPngBuffer(metadata?: Record<string, string>) {
  const png = CappaPNG.create(2, 2);

  // Fill with opaque black pixels
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0; // Red
    png.data[i + 1] = 0; // Green
    png.data[i + 2] = 0; // Blue
    png.data[i + 3] = 255; // Alpha
  }

  if (metadata) {
    png.replaceMetadata(metadata);
  }

  return png.toBuffer();
}

async function createPngBufferWithMetadata(metadata: Record<string, string>) {
  const png = await CappaPNG.load(await createPngBuffer());
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

    await writeFile(filepath, await createPngBuffer());

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

    const reloaded = await CappaPNG.load(await png.toBuffer());

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

    const reloaded = await CappaPNG.load(await png.toBuffer());

    expect(reloaded.metadata).toEqual({ author: "cappa", version: "1.0" });
  });

  it("clears all metadata entries", async () => {
    const png = await CappaPNG.load(
      await createPngBufferWithMetadata({ author: "cappa", branch: "main" }),
    );

    png.clearMetadata();

    expect(png.metadata).toEqual({});
    expect(
      await CappaPNG.load(await png.toBuffer()).then((p) => p.metadata),
    ).toEqual({});
  });

  it("saves to a provided filepath with updated metadata", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cappa-png-"));
    temporaryDirectories.push(directory);
    const filepath = path.join(directory, "image.png");

    const png = await CappaPNG.load(await createPngBuffer());
    png.setMetadata("commit", "abc123");

    await png.save(filepath);

    const savedBuffer = await readFile(filepath);
    const reloaded = await CappaPNG.load(savedBuffer);

    expect(reloaded.metadata).toEqual({ commit: "abc123" });
  });

  describe("edgeColor", () => {
    it("is the most common colour on the right column and bottom row", () => {
      const png = CappaPNG.create(3, 3);
      png.data.fill(255);
      // A dark pixel in the middle and one on an edge do not outvote the
      // white background.
      png.data.set([0, 0, 0, 255], (1 * 3 + 1) * 4);
      png.data.set([0, 0, 0, 255], (2 * 3 + 2) * 4);

      expect(png.edgeColor()).toEqual([255, 255, 255, 255]);
    });
  });

  describe("padTo", () => {
    const solid = (width: number, height: number) => {
      const png = CappaPNG.create(width, height);
      png.data.fill(255);
      return png;
    };

    it("anchors the image top-left on a transparent canvas", () => {
      const padded = solid(2, 1).padTo(3, 2);

      expect(padded.width).toBe(3);
      expect(padded.height).toBe(2);
      const pixel = (x: number, y: number) => [
        ...padded.data.subarray((y * 3 + x) * 4, (y * 3 + x) * 4 + 4),
      ];
      expect(pixel(0, 0)).toEqual([255, 255, 255, 255]);
      expect(pixel(1, 0)).toEqual([255, 255, 255, 255]);
      expect(pixel(2, 0)).toEqual([0, 0, 0, 0]);
      expect(pixel(0, 1)).toEqual([0, 0, 0, 0]);
    });

    it("returns an independent copy when the size is unchanged", () => {
      const source = solid(2, 2);
      const padded = source.padTo(2, 2);

      padded.data[0] = 0;
      expect(source.data[0]).toBe(255);
    });

    it("fills the added area with the given colour", () => {
      const padded = solid(1, 1).padTo(2, 1, [10, 20, 30, 255]);

      expect([...padded.data.subarray(4, 8)]).toEqual([10, 20, 30, 255]);
    });

    it("refuses to shrink", () => {
      expect(() => solid(4, 4).padTo(3, 4)).toThrow(/smaller/);
    });
  });
});
