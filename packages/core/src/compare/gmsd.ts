import fs from "node:fs";
import gmsd, { type GmsdOptions } from "@blazediff/gmsd";
import type { BlazeDiffOptions } from "@blazediff/types";
import { getLogger } from "@cappa/logger";
import { PNG } from "../features/png/png";
import type { DiffConfigGMSD } from "../types";

export type CompareOptions = BlazeDiffOptions;

export interface CompareResult {
  gmsd: number;
  diffBuffer?: Buffer; // PNG buffer of the diff image
  passed: boolean; // Whether the comparison passed based on threshold
  error?: string; // Error message if the comparison failed
}

const compare = (
  image1: Uint8Array | Uint8ClampedArray,
  image2: Uint8Array | Uint8ClampedArray,
  diff: Uint8Array | Uint8ClampedArray | undefined,
  width: number,
  height: number,
  options?: GmsdOptions,
) => {
  return gmsd(image1, image2, diff, width, height, options);
};

/**
 * Compare two PNG images and return the difference
 * @param image1 - First image (file path or Buffer)
 * @param image2 - Second image (file path or Buffer)
 * @param withDiff - Whether to create a diff image
 * @param options - Comparison options
 * @returns Comparison result
 */
export async function compareImagesGMSD(
  image1: string | Buffer,
  image2: string | Buffer,
  withDiff: boolean = false,
  options: DiffConfigGMSD = {},
): Promise<CompareResult> {
  const png1 = await loadPNG(image1);
  const png2 = await loadPNG(image2);

  const { width, height } = png1;

  const diff = withDiff ? PNG.create(width, height) : undefined;

  try {
    const gmsd = compare(png1.data, png2.data, diff?.data, width, height, {
      downsample: options.downsample ?? 0,
      c: options.c ?? 170,
    });

    // Convert diff image to buffer
    const diffBuffer = diff
      ? annotateDiffImage(diff, options).toBuffer()
      : undefined;

    return {
      gmsd,
      diffBuffer,
      passed: gmsd <= (options.threshold ?? 0.1),
    };
  } catch (error) {
    getLogger().error((error as Error).message || "Unknown error");

    return {
      gmsd: Infinity,
      passed: false,
      error: (error as Error).message || "Unknown error",
    };
  }
}

/**
 * Load a PNG image from file path or Buffer
 */
async function loadPNG(source: string | Buffer): Promise<PNG> {
  return PNG.load(source);
}

function annotateDiffImage(image: PNG, options: DiffConfigGMSD) {
  image.setMetadata("cappa.diff.algorithm", "gmsd");

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }

    image.setMetadata(`cappa.diff.${key}`, String(value));
  }

  return image;
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
export async function imagesMatchGMSD(
  image1: string | Buffer,
  image2: string | Buffer,
  options: DiffConfigGMSD = {},
): Promise<boolean> {
  const result = await compareImagesGMSD(image1, image2, false, options);

  return result.passed;
}
