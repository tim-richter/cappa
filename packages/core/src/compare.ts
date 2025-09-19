import fs from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface CompareOptions {
  threshold?: number; // Matching threshold, ranges from 0 to 1. Smaller is more sensitive. Default: 0.1
  includeAA?: boolean; // If true, disables detecting and ignoring anti-aliased pixels. Default: false
  alpha?: number; // Blending factor of unchanged pixels in the diff output. Default: 0.1
  aaColor?: [number, number, number]; // The color of anti-aliased pixels in the diff output. Default: [255, 255, 0]
  diffColor?: [number, number, number]; // The color of differing pixels in the diff output. Default: [255, 0, 0]
  diffColorAlt?: [number, number, number]; // Alternative color for dark on light differences. Default: null
}

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
  options: CompareOptions = {},
  maxDifferencePercent: number = 0.1
): Promise<CompareResult> {
  const {
    threshold = 0.1,
    includeAA = false,
    alpha = 0.1,
    aaColor = [255, 255, 0],
    diffColor = [255, 0, 0],
    diffColorAlt,
  } = options;

  // Load images as PNG objects
  const png1 = await loadPNG(image1);
  const png2 = await loadPNG(image2);

  // Check if images have the same dimensions
  if (png1.width !== png2.width || png1.height !== png2.height) {
    throw new Error(
      `Images have different dimensions: ${png1.width}x${png1.height} vs ${png2.width}x${png2.height}`
    );
  }

  const { width, height } = png1;
  const totalPixels = width * height;

  // Create diff image
  const diff = new PNG({ width, height });

  // Compare images using pixelmatch
  const numDiffPixels = pixelmatch(
    png1.data,
    png2.data,
    diff.data,
    width,
    height,
    {
      threshold,
      includeAA,
      alpha,
      aaColor,
      diffColor,
      diffColorAlt,
    }
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
  options: CompareOptions = {}
): Promise<boolean> {
  const result = await compareImages(image1, image2, options, maxDifferencePercent);
  return result.passed;
}
