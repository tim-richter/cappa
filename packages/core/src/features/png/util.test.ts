import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PNG as CappaPNG } from "./png";
import { isValidPngSignature, readIhdrDimensions } from "./util";

describe("isValidPngSignature", () => {
  it("should return true for a valid PNG buffer", async () => {
    const png = await CappaPNG.create(10, 10).toBuffer();
    expect(isValidPngSignature(png)).toBe(true);
  });

  it("should return false for a non-PNG buffer", () => {
    expect(isValidPngSignature(Buffer.from("not a png"))).toBe(false);
  });

  it("should return false for a buffer shorter than 8 bytes", () => {
    expect(isValidPngSignature(Buffer.from([0x89, 0x50]))).toBe(false);
  });

  it("should return false for an empty buffer", () => {
    expect(isValidPngSignature(Buffer.alloc(0))).toBe(false);
  });
});

describe("readIhdrDimensions", () => {
  const testDir = path.join(os.tmpdir(), "cappa-util-test-");
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(testDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should read dimensions from a PNG buffer", async () => {
    const buf = await CappaPNG.create(123, 456).toBuffer();
    const { width, height } = await readIhdrDimensions(buf);
    expect(width).toBe(123);
    expect(height).toBe(456);
  });

  it("should read dimensions from a PNG file path", async () => {
    const buf = await CappaPNG.create(320, 240).toBuffer();
    const filePath = path.join(tempDir, "dims.png");
    fs.writeFileSync(filePath, buf);

    const { width, height } = await readIhdrDimensions(filePath);
    expect(width).toBe(320);
    expect(height).toBe(240);
  });

  it("should throw for a non-PNG buffer", async () => {
    await expect(readIhdrDimensions(Buffer.from("not a png"))).rejects.toThrow(
      "Not a valid PNG",
    );
  });

  it("should throw for a buffer smaller than 24 bytes", async () => {
    await expect(readIhdrDimensions(Buffer.alloc(10))).rejects.toThrow(
      "Not a valid PNG",
    );
  });
});
