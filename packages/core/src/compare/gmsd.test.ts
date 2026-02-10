import { describe, expect, it } from "vitest";
import { PNG as CappaPNG } from "../features/png/png";
import { compareImagesGMSD } from "./gmsd";

// Test utilities
function createSolidColorPNG(
  width: number,
  height: number,
  color: [number, number, number, number] = [255, 0, 0, 255],
): Buffer {
  const png = CappaPNG.create(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = color[0]; // red
      png.data[idx + 1] = color[1]; // green
      png.data[idx + 2] = color[2]; // blue
      png.data[idx + 3] = color[3]; // alpha
    }
  }

  return png.toBuffer();
}

function createGradientPNG(width: number, height: number): Buffer {
  const png = CappaPNG.create(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = Math.floor((x / width) * 255); // red gradient
      png.data[idx + 1] = Math.floor((y / height) * 255); // green gradient
      png.data[idx + 2] = 128; // blue constant
      png.data[idx + 3] = 255; // alpha
    }
  }

  return png.toBuffer();
}

function createCheckerboardPNG(
  width: number,
  height: number,
  squareSize: number = 10,
): Buffer {
  const png = CappaPNG.create(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const squareX = Math.floor(x / squareSize);
      const squareY = Math.floor(y / squareSize);
      const isWhite = (squareX + squareY) % 2 === 0;

      const color = isWhite ? 255 : 0;
      png.data[idx] = color; // red
      png.data[idx + 1] = color; // green
      png.data[idx + 2] = color; // blue
      png.data[idx + 3] = 255; // alpha
    }
  }

  return png.toBuffer();
}

describe("compareImages", () => {
  it("should return 0 difference for identical images", async () => {
    const image = createGradientPNG(100, 100);
    const result = await compareImagesGMSD(image, image);
    expect(result.gmsd).toBeLessThan(0.01);
  });

  it("should return high difference for images with different gradients", async () => {
    const gradientImage = createGradientPNG(100, 100);
    const checkerImage = createCheckerboardPNG(100, 100);
    const result = await compareImagesGMSD(gradientImage, checkerImage);
    expect(result.gmsd).toBeGreaterThan(0.01);
  });

  it("should return 0 for solid color images (no gradients)", async () => {
    const redImage = createSolidColorPNG(100, 100, [255, 0, 0, 255]);
    const blueImage = createSolidColorPNG(100, 100, [0, 0, 255, 255]);
    const result = await compareImagesGMSD(redImage, blueImage);
    // Both have zero gradients, so GMSD = 0
    expect(result.gmsd).toBe(0);
  });

  it("should embed diff algorithm and options as PNG metadata", async () => {
    const gradientImage = createGradientPNG(100, 100);
    const checkerImage = createCheckerboardPNG(100, 100);

    const result = await compareImagesGMSD(gradientImage, checkerImage, true, {
      threshold: 0.15,
      downsample: 1,
      c: 170,
    });

    expect(result.diffBuffer).toBeDefined();

    const diffBuffer = result.diffBuffer;

    if (!diffBuffer) {
      throw new Error("Expected a diff buffer");
    }

    const diffPng = await CappaPNG.load(diffBuffer);

    expect(diffPng.metadata).toMatchObject({
      "cappa.diff.algorithm": "gmsd",
      "cappa.diff.threshold": "0.15",
      "cappa.diff.downsample": "1",
      "cappa.diff.c": "170",
    });
  });
});
