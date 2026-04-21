import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type BlazeDiffOptions,
  type BlazeDiffResult,
  compare as blazediffCompare,
} from "@blazediff/core-native";
import { getLogger } from "@cappa/logger";
import { PNG } from "../features/png/png";
import type { DiffConfig } from "../types";

/** Pixel diff options: Cappa `DiffConfig` plus optional native-only output tuning. */
export type CompareOptions = DiffConfig &
  Partial<Pick<BlazeDiffOptions, "diffMask" | "compression" | "quality">>;

export interface CompareResult {
  numDiffPixels: number;
  totalPixels: number;
  percentDifference: number;
  diffBuffer?: Buffer; // PNG buffer of the diff image
  passed: boolean; // Whether the comparison passed based on threshold
  error?: string; // Error message if the comparison failed
  differentSizes: boolean; // Whether the images have different sizes
}

type TempState = { tempRoot?: string };

async function ensureTempRoot(state: TempState): Promise<string> {
  if (!state.tempRoot) {
    state.tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-pxl-"));
  }
  return state.tempRoot;
}

async function resolveInputPath(
  source: string | Buffer,
  fileName: string,
  state: TempState,
): Promise<string> {
  if (typeof source === "string") {
    await fsp.access(source, fs.constants.R_OK);
    return path.resolve(source);
  }

  await PNG.load(source);
  const root = await ensureTempRoot(state);
  const dest = path.join(root, fileName);
  await fsp.writeFile(dest, source);
  return dest;
}

function toNativeOptions(config: DiffConfig): BlazeDiffOptions {
  const extra = config as CompareOptions;
  const out: BlazeDiffOptions = {
    threshold: extra.threshold,
    antialiasing: extra.includeAA ?? false,
  };

  if (extra.diffMask !== undefined) {
    out.diffMask = extra.diffMask;
  }
  if (extra.compression !== undefined) {
    out.compression = extra.compression;
  }
  if (extra.quality !== undefined) {
    out.quality = extra.quality;
  }

  return out;
}

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
  const state: TempState = {};
  let diffPath: string | undefined;

  try {
    const p1 = await resolveInputPath(image1, "expected.png", state);
    const p2 = await resolveInputPath(image2, "actual.png", state);

    if (withDiff) {
      const root = await ensureTempRoot(state);
      diffPath = path.join(root, "diff.png");
    }

    let nativeResult: BlazeDiffResult;

    try {
      nativeResult = await blazediffCompare(
        p1,
        p2,
        withDiff ? diffPath : undefined,
        toNativeOptions(options),
      );
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

    if (nativeResult.match === false) {
      if (nativeResult.reason === "file-not-exists") {
        throw new Error(`File not found: ${nativeResult.file}`);
      }

      if (nativeResult.reason === "layout-diff") {
        return {
          numDiffPixels: 0,
          totalPixels: 0,
          percentDifference: 0,
          passed: false,
          differentSizes: true,
        };
      }
    }

    const { width, height } = await PNG.load(p1);
    const totalPixels = width * height;

    if (nativeResult.match) {
      return {
        numDiffPixels: 0,
        totalPixels,
        percentDifference: 0,
        diffBuffer: undefined,
        passed: isPassed(0, 0, options),
        differentSizes: false,
      };
    }

    let diffBuffer: Buffer | undefined;
    if (withDiff && diffPath) {
      const raw = await fsp.readFile(diffPath);
      const diffPng = await PNG.load(raw);
      diffBuffer = await annotateDiffImage(diffPng, options).toBuffer();
    }

    const numDiffPixels = nativeResult.diffCount;
    const percentDifference = nativeResult.diffPercentage;

    return {
      numDiffPixels,
      totalPixels,
      percentDifference,
      diffBuffer,
      passed: isPassed(percentDifference, numDiffPixels, options),
      differentSizes: false,
    };
  } finally {
    if (state.tempRoot) {
      await fsp
        .rm(state.tempRoot, { recursive: true, force: true })
        .catch(() => {
          // ignore cleanup errors
        });
    }
  }
}

function annotateDiffImage(image: PNG, options: DiffConfig) {
  image.setMetadata("cappa.diff.algorithm", "pixel");

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
export async function createDiffSizePngImage(
  width: number,
  height: number,
): Promise<Buffer> {
  const png = PNG.create(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 255; // red
      png.data[idx + 1] = 0; // green
      png.data[idx + 2] = 0; // blue
      png.data[idx + 3] = 255; // alpha
    }
  }

  return png.toBuffer();
}
