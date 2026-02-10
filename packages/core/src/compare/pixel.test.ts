import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PNG as CappaPNG } from "../features/png/png";
import {
  type CompareOptions,
  type CompareResult,
  compareImages,
  imagesMatch,
  saveDiffImage,
} from "./pixel";

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

describe("compare", () => {
  const testDir = path.join(__dirname, "__test-images__");

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test image files
    const redImage = createSolidColorPNG(100, 100, [255, 0, 0, 255]);
    const blueImage = createSolidColorPNG(100, 100, [0, 0, 255, 255]);
    const gradientImage = createGradientPNG(100, 100);
    const checkerImage = createCheckerboardPNG(100, 100);
    const smallImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);

    fs.writeFileSync(path.join(testDir, "red.png"), redImage);
    fs.writeFileSync(path.join(testDir, "blue.png"), blueImage);
    fs.writeFileSync(path.join(testDir, "gradient.png"), gradientImage);
    fs.writeFileSync(path.join(testDir, "checker.png"), checkerImage);
    fs.writeFileSync(path.join(testDir, "small.png"), smallImage);
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("compareImages", () => {
    it("should return 0% difference for identical images", async () => {
      const image = createSolidColorPNG(50, 50, [255, 0, 0, 255]);

      const result = await compareImages(image, image);

      expect(result.numDiffPixels).toBe(0);
      expect(result.totalPixels).toBe(2500);
      expect(result.percentDifference).toBe(0);
      expect(result.passed).toBe(true);
      expect(result.diffBuffer).toEqual(undefined);
    });

    it("should return 100% difference for completely different images", async () => {
      const redImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);
      const blueImage = createSolidColorPNG(50, 50, [0, 0, 255, 255]);

      const result = await compareImages(redImage, blueImage);

      expect(result.numDiffPixels).toBe(2500);
      expect(result.totalPixels).toBe(2500);
      expect(result.percentDifference).toBe(100);
      expect(result.passed).toBe(false);
    });

    it("should work with file paths", async () => {
      const redPath = path.join(testDir, "red.png");
      const bluePath = path.join(testDir, "blue.png");

      const result = await compareImages(redPath, bluePath);

      expect(result.numDiffPixels).toBe(10000);
      expect(result.totalPixels).toBe(10000);
      expect(result.percentDifference).toBe(100);
      expect(result.passed).toBe(false);
    });

    it("should work with mixed file path and buffer", async () => {
      const redPath = path.join(testDir, "red.png");
      const blueBuffer = createSolidColorPNG(100, 100, [0, 0, 255, 255]);

      const result = await compareImages(redPath, blueBuffer);

      expect(result.percentDifference).toBe(100);
      expect(result.passed).toBe(false);
    });

    it("should respect maxDiffPercentage parameter", async () => {
      const redImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);
      const blueImage = createSolidColorPNG(50, 50, [0, 0, 255, 255]);

      const result1 = await compareImages(redImage, blueImage, false, {
        maxDiffPercentage: 50,
      });
      const result2 = await compareImages(redImage, blueImage, false, {
        maxDiffPercentage: 100,
      });

      expect(result1.passed).toBe(false); // 100% > 50%
      expect(result2.passed).toBe(true); // 100% < 100%
    });

    it("should apply threshold option correctly", async () => {
      // Create two slightly different images
      const image1 = createSolidColorPNG(50, 50, [100, 100, 100, 255]);
      const image2 = createSolidColorPNG(50, 50, [105, 105, 105, 255]); // Slightly lighter

      const strictResult = await compareImages(image1, image2, false, {
        threshold: 0.01,
      });
      const lenientResult = await compareImages(image1, image2, false, {
        threshold: 0.5,
      });

      expect(strictResult.numDiffPixels).toBeGreaterThan(
        lenientResult.numDiffPixels,
      );
    });

    it("should throw error for mismatched dimensions", async () => {
      const largeImage = createSolidColorPNG(100, 100, [255, 0, 0, 255]);
      const smallImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);

      const result = await compareImages(largeImage, smallImage);

      expect(result.differentSizes).toBe(true);
      expect(result.numDiffPixels).toBe(0);
      expect(result.totalPixels).toBe(0);
      expect(result.percentDifference).toBe(0);
      expect(result.passed).toBe(false);
    });

    it("should handle custom compare options", async () => {
      const image1 = createCheckerboardPNG(50, 50, 5);
      const image2 = createCheckerboardPNG(50, 50, 6); // Slightly different pattern

      const options: CompareOptions = {
        threshold: 0.2,
        includeAA: true,
        alpha: 0.2,
        aaColor: [0, 255, 0],
        diffColor: [255, 0, 255],
        diffColorAlt: [0, 255, 255],
      };

      const result = await compareImages(image1, image2, false, options);

      expect(result).toBeDefined();
      expect(result.diffBuffer).toEqual(undefined);
    });

    it("should handle identical file paths", async () => {
      const redPath = path.join(testDir, "red.png");

      const result = await compareImages(redPath, redPath);

      expect(result.numDiffPixels).toBe(0);
      expect(result.percentDifference).toBe(0);
      expect(result.passed).toBe(true);
    });
  });

  describe("imagesMatch", () => {
    it("should return true for identical images", async () => {
      const image = createSolidColorPNG(50, 50, [255, 0, 0, 255]);

      const matches = await imagesMatch(image, image);

      expect(matches).toBe(true);
    });

    it("should return false for completely different images", async () => {
      const redImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);
      const blueImage = createSolidColorPNG(50, 50, [0, 0, 255, 255]);

      const matches = await imagesMatch(redImage, blueImage);

      expect(matches).toBe(false);
    });

    it("should respect maxDifferencePercent", async () => {
      const redImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);
      const blueImage = createSolidColorPNG(50, 50, [0, 0, 255, 255]);

      const strictMatch = await imagesMatch(redImage, blueImage, {
        maxDiffPercentage: 50,
      });
      const lenientMatch = await imagesMatch(redImage, blueImage, {
        maxDiffPercentage: 150,
      });

      expect(strictMatch).toBe(false);
      expect(lenientMatch).toBe(true);
    });

    it("should work with file paths", async () => {
      const redPath = path.join(testDir, "red.png");
      const checkerPath = path.join(testDir, "checker.png");

      const matches = await imagesMatch(redPath, checkerPath);

      expect(matches).toBe(false);
    });

    it("should pass through compare options", async () => {
      const image1 = createSolidColorPNG(50, 50, [100, 100, 100, 255]);
      const image2 = createSolidColorPNG(50, 50, [105, 105, 105, 255]);

      const strictMatch = await imagesMatch(image1, image2, {
        maxDiffPercentage: 50,
        threshold: 0.01,
      });
      const lenientMatch = await imagesMatch(image1, image2, {
        maxDiffPercentage: 50,
        threshold: 0.5,
      });

      // With lenient threshold, more pixels should be considered "same"
      expect(lenientMatch).toBe(true);
      expect(strictMatch).toBe(false);
    });
  });

  describe("saveDiffImage", () => {
    it("should embed diff algorithm and options as PNG metadata", async () => {
      const redImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);
      const blueImage = createSolidColorPNG(50, 50, [0, 0, 255, 255]);

      const result = await compareImages(redImage, blueImage, true, {
        threshold: 0.2,
        includeAA: true,
      });

      expect(result.diffBuffer).toBeDefined();

      const diffBuffer = result.diffBuffer;

      if (!diffBuffer) {
        throw new Error("Expected a diff buffer");
      }

      const diffPng = await CappaPNG.load(diffBuffer);

      expect(diffPng.metadata).toMatchObject({
        "cappa.diff.algorithm": "pixel",
        "cappa.diff.threshold": "0.2",
        "cappa.diff.includeAA": "true",
      });
    });

    it("should save diff image to file", async () => {
      const redImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);
      const blueImage = createSolidColorPNG(50, 50, [0, 0, 255, 255]);

      const result = await compareImages(redImage, blueImage, true);
      const outputPath = path.join(testDir, "diff-output.png");

      saveDiffImage(result, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify the saved file is a valid PNG
      const savedBuffer = fs.readFileSync(outputPath);
      await expect(CappaPNG.load(savedBuffer)).resolves.toBeDefined();

      // Clean up
      fs.unlinkSync(outputPath);
    });

    it("should throw error when no diff buffer available", () => {
      const result: CompareResult = {
        numDiffPixels: 0,
        totalPixels: 100,
        percentDifference: 0,
        passed: true,
        differentSizes: false,
        // diffBuffer is undefined
      };

      expect(() => saveDiffImage(result, "test.png")).toThrow(
        "No diff buffer available in comparison result",
      );
    });
  });

  describe("error handling", () => {
    it("should handle non-existent file paths", async () => {
      const nonExistentPath = path.join(testDir, "does-not-exist.png");
      const validImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);

      await expect(
        compareImages(nonExistentPath, validImage),
      ).rejects.toThrow();
    });

    it("should handle invalid image buffers", async () => {
      const invalidBuffer = Buffer.from("not a png");
      const validImage = createSolidColorPNG(50, 50, [255, 0, 0, 255]);

      await expect(compareImages(invalidBuffer, validImage)).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle 1x1 pixel images", async () => {
      const image1 = createSolidColorPNG(1, 1, [255, 0, 0, 255]);
      const image2 = createSolidColorPNG(1, 1, [0, 0, 255, 255]);

      const result = await compareImages(image1, image2);

      expect(result.totalPixels).toBe(1);
      expect(result.numDiffPixels).toBe(1);
      expect(result.percentDifference).toBe(100);
    });

    it("should handle very large difference percentages", async () => {
      const redImage = createSolidColorPNG(10, 10, [255, 0, 0, 255]);
      const blueImage = createSolidColorPNG(10, 10, [0, 0, 255, 255]);

      const result = await compareImages(redImage, blueImage, false);

      expect(result.passed).toBe(false);
      expect(result.percentDifference).toBe(100);
    });

    it("should handle zero difference threshold", async () => {
      const image = createSolidColorPNG(10, 10, [255, 0, 0, 255]);

      const result = await compareImages(image, image, false, {
        maxDiffPercentage: 0,
      });

      expect(result.passed).toBe(true);
      expect(result.percentDifference).toBe(0);
    });
  });
});
