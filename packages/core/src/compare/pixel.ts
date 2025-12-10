import fs from "node:fs";
import blazediff from "@blazediff/core";
import type { BlazeDiffOptions } from "@blazediff/types";
import { getLogger } from "@cappa/logger";
import { PNG } from "pngjs";
import type { DiffConfig } from "../types";

export type CompareOptions = BlazeDiffOptions;

export interface CompareResult {
  numDiffPixels: number;
  totalPixels: number;
  percentDifference: number;
  diffBuffer?: Buffer; // PNG buffer of the diff image
  passed: boolean; // Whether the comparison passed based on threshold
  error?: string; // Error message if the comparison failed
  differentSizes: boolean; // Whether the images have different sizes
}

const compare = (
  image1: Uint8Array | Uint8ClampedArray,
  image2: Uint8Array | Uint8ClampedArray,
  diff: Uint8Array | Uint8ClampedArray | undefined,
  width: number,
  height: number,
  options?: BlazeDiffOptions,
) => {
  return blazediff(image1, image2, diff, width, height, options);
};

/**
 * Compare two PNG images and return the difference
 * @param image1 - First image (file path or Buffer)
 * @param image2 - Second image (file path or Buffer)
 * @param withDiff - Whether to create a diff image
 * @param options - Comparison options
 * @returns Comparison result
 */
export async function compareImages(
  image1: string | Buffer,
  image2: string | Buffer,
  withDiff: boolean = false,
  options: DiffConfig = {},
): Promise<CompareResult> {
  const png1 = await loadPNG(image1);
  const png2 = await loadPNG(image2);

  const { width, height } = png1;

  if (width !== png2.width || height !== png2.height) {
    return {
      numDiffPixels: 0,
      totalPixels: 0,
      percentDifference: 0,
      passed: false,
      differentSizes: true,
    };
  }

  const diff = withDiff ? new PNG({ width, height }) : undefined;

  try {
    const numDiffPixels = compare(
      png1.data,
      png2.data,
      diff?.data,
      width,
      height,
      options,
    );

    const totalPixels = width * height;
    const percentDifference = (numDiffPixels / totalPixels) * 100;

    // Convert diff image to buffer
    const diffBuffer = diff ? PNG.sync.write(diff) : undefined;

    return {
      numDiffPixels,
      totalPixels,
      percentDifference,
      diffBuffer,
      passed: isPassed(percentDifference, numDiffPixels, options),
      differentSizes: false,
    };
  } catch (error) {
    getLogger().error((error as Error).message || "Unknown error");

    return {
      numDiffPixels: 0,
      totalPixels: 0,
      percentDifference: 0,
      passed: false,
      differentSizes: false,
      error: (error as Error).message || "Unknown error",
    };
  }
}

/**
 * Load a PNG image from file path or Buffer
 */
async function loadPNG(source: string | Buffer): Promise<PNG> {
  if (Buffer.isBuffer(source)) {
    return PNG.sync.read(source);
  } else {
    const buffer = fs.readFileSync(source);
    return PNG.sync.read(buffer);
  }
}

/**
 * Save a comparison result diff image to file
 * @param result - Comparison result containing diffBuffer
 * @param outputPath - Path to save the diff image
 */
export function saveDiffImage(result: CompareResult, outputPath: string): void {
  if (!result.diffBuffer) {
    throw new Error("No diff buffer available in comparison result");
  }

  fs.writeFileSync(outputPath, result.diffBuffer);
}

/**
 * Quick comparison function that returns only pass/fail
 * @param image1 - First image (file path or Buffer)
 * @param image2 - Second image (file path or Buffer)
 * @param options - Comparison options
 * @returns Whether the images match
 */
export async function imagesMatch(
  image1: string | Buffer,
  image2: string | Buffer,
  options: DiffConfig = {},
): Promise<boolean> {
  const result = await compareImages(image1, image2, false, options);

  return result.passed;
}

/**
 * Check if the comparison passed based on the options
 * @param percentDifference - Percentage difference between the images
 * @param numDiffPixels - Number of different pixels
 * @param options - Comparison options
 * @returns Whether the comparison passed
 */
const isPassed = (
  percentDifference: number,
  numDiffPixels: number,
  options: DiffConfig,
) => {
  if (options.maxDiffPercentage && options.maxDiffPixels) {
    return (
      percentDifference <= options.maxDiffPercentage &&
      numDiffPixels <= options.maxDiffPixels
    );
  }

  if (options.maxDiffPercentage) {
    return percentDifference <= options.maxDiffPercentage;
  }

  if (options.maxDiffPixels) {
    return numDiffPixels <= options.maxDiffPixels;
  }

  // fallback to 0 pixels
  return numDiffPixels === 0;
};

/**
 * Create different size png image with all pixels red
 * @returns
 */
export function createDiffSizePngImage(width: number, height: number): Buffer {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 255; // red
      png.data[idx + 1] = 0; // green
      png.data[idx + 2] = 0; // blue
      png.data[idx + 3] = 255; // alpha
    }
  }

  return PNG.sync.write(png);
}
