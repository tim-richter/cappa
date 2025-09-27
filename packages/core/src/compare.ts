import fs from "node:fs";
import blazediff from "@blazediff/core";
import type { BlazeDiffOptions } from "@blazediff/types";
import { PNG } from "pngjs";

export type CompareOptions = BlazeDiffOptions;

export interface CompareResult {
  numDiffPixels: number;
  totalPixels: number;
  percentDifference: number;
  diffBuffer?: Buffer; // PNG buffer of the diff image
  passed: boolean; // Whether the comparison passed based on threshold
}

/**
 * Compare two PNG images and return the difference
 * @param image1 - First image (file path or Buffer)
 * @param image2 - Second image (file path or Buffer)
 * @param options - Comparison options
 * @param maxDifferencePercent - Maximum allowed difference percentage (0-100). Default: 0.1
 * @returns Comparison result
 */
export async function compareImages(
  image1: string | Buffer,
  image2: string | Buffer,
  options: BlazeDiffOptions = {
    threshold: 0.1,
  },
  maxDifferencePercent: number = 0,
): Promise<CompareResult> {
  // Load images as PNG objects
  const png1 = await loadPNG(image1);
  const png2 = await loadPNG(image2);

  // Check if images have the same dimensions
  if (png1.width !== png2.width || png1.height !== png2.height) {
    throw new Error(
      `Images have different dimensions: ${png1.width}x${png1.height} vs ${png2.width}x${png2.height}`,
    );
  }

  const { width, height } = png1;
  const totalPixels = width * height;

  // Create diff image
  const diff = new PNG({ width, height });

  // Compare images using pixelmatch
  const numDiffPixels = blazediff(
    png1.data,
    png2.data,
    diff.data,
    width,
    height,
    options,
  );

  const percentDifference = (numDiffPixels / totalPixels) * 100;
  const passed = percentDifference <= maxDifferencePercent;

  // Convert diff image to buffer
  const diffBuffer = PNG.sync.write(diff);

  return {
    numDiffPixels,
    totalPixels,
    percentDifference,
    diffBuffer,
    passed,
  };
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
 * @param maxDifferencePercent - Maximum allowed difference percentage (0-100). Default: 0.1
 * @param options - Comparison options
 * @returns Whether the images are similar enough
 */
export async function imagesMatch(
  image1: string | Buffer,
  image2: string | Buffer,
  maxDifferencePercent: number = 0.1,
  options: BlazeDiffOptions = {},
): Promise<boolean> {
  const result = await compareImages(
    image1,
    image2,
    options,
    maxDifferencePercent,
  );
  return result.passed;
}
