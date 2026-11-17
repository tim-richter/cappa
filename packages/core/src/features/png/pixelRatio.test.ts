import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { readPixelRatio, withPixelRatio } from "./pixelRatio";

let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 4, height: 3, channels: 4, background: "#f00" },
  })
    .png()
    .toBuffer();
});

describe("withPixelRatio / readPixelRatio", () => {
  it("reads 1 from a PNG without pHYs", async () => {
    expect(await readPixelRatio(png)).toBe(1);
  });

  it("round-trips a ratio through a buffer", async () => {
    expect(await readPixelRatio(withPixelRatio(png, 2))).toBe(2);
    expect(await readPixelRatio(withPixelRatio(png, 1.5))).toBe(1.5);
  });

  it("round-trips a ratio through a file", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-ratio-"));
    const file = path.join(dir, "a.png");
    await fsp.writeFile(file, withPixelRatio(png, 3));

    expect(await readPixelRatio(file)).toBe(3);
  });

  it("leaves a 1× PNG byte-for-byte unchanged", () => {
    expect(withPixelRatio(png, 1).equals(png)).toBe(true);
  });

  it("replaces an existing pHYs rather than adding a second", async () => {
    const twice = withPixelRatio(withPixelRatio(png, 2), 3);

    expect(await readPixelRatio(twice)).toBe(3);
    expect(twice.toString("latin1").split("pHYs")).toHaveLength(2);
    const cleared = withPixelRatio(twice, 1);
    expect(await readPixelRatio(cleared)).toBe(1);
    expect(cleared.includes("pHYs")).toBe(false);
    expect(cleared.includes("cappa:pixelRatio")).toBe(false);
  });

  it("ignores a pHYs another tool wrote", async () => {
    // sharp stamps its own 72-DPI pHYs; that is not a capture ratio.
    expect(png.includes("pHYs")).toBe(true);
    expect(await readPixelRatio(png)).toBe(1);
  });

  it("keeps the image decodable with its pixels intact", async () => {
    const stamped = withPixelRatio(png, 2);
    const { data: before } = await sharp(png).raw().toBuffer({
      resolveWithObject: true,
    });
    const { data: after, info } = await sharp(stamped).raw().toBuffer({
      resolveWithObject: true,
    });

    expect(info.width).toBe(4);
    expect(after.equals(before)).toBe(true);
    expect((await sharp(stamped).metadata()).density).toBe(192);
  });

  it("returns non-PNG input untouched and reads it as 1×", async () => {
    const junk = Buffer.from("not a png");
    expect(withPixelRatio(junk, 2)).toBe(junk);
    expect(await readPixelRatio(junk)).toBe(1);
    expect(await readPixelRatio("/does/not/exist.png")).toBe(1);
  });
});
