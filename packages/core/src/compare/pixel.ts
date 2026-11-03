import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type BlazeDiffOptions,
  type BlazeDiffResult,
  compare as blazediffCompare,
} from "@blazediff/core-native";
import { type InterpretResult, interpret } from "@blazediff/interpret-native";
import { getLogger } from "@cappa/logger";
import { writeCommonCanvas } from "../features/png/canvas";
import { PNG } from "../features/png/png";
import {
  injectTextMetadata,
  isValidPngSignature,
  readIhdrDimensions,
} from "../features/png/util";
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
  /**
   * Whether the images have different sizes.
   *
   * When they do, both are compared on a canvas padded to the larger width
   * and height (anchored top-left, each padded with its own background), so
   * the pixel counts, the diff image and the interpretation still describe
   * what changed. Such a comparison never passes, even with no differing
   * pixels — the size change is itself the finding.
   */
  differentSizes: boolean;
  /** Both images' own dimensions — set when `differentSizes` is. */
  dimensions?: {
    expected: { width: number; height: number };
    actual: { width: number; height: number };
  };
  interpretation?: InterpretResult; // Structured diff analysis (when `interpret` is enabled)
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

  if (!isValidPngSignature(source)) {
    throw new Error("Invalid PNG buffer: missing PNG signature");
  }

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
 * @param image1 - Baseline (expected) image (file path or Buffer)
 * @param image2 - Current (actual) image (file path or Buffer). Order matters
 *   for `interpret`: content only in `image2` is reported as an addition.
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

    const wantInterpret = !!(options as CompareOptions).interpret && withDiff;

    let nativeResult: BlazeDiffResult;

    try {
      // Never pass `interpret` to `compare` — the native binding skips writing
      // the diff image when interpret mode is on.  Interpretation is fetched in
      // a separate call below when needed.
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
        return await compareOnCommonCanvas(p1, p2, withDiff, options, state);
      }
    }

    const { width, height } = await readIhdrDimensions(p1);
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

    const diffBuffer =
      withDiff && diffPath ? await readDiffImage(diffPath, options) : undefined;

    const numDiffPixels = nativeResult.diffCount;
    const percentDifference = nativeResult.diffPercentage;

    const interpretation = wantInterpret
      ? await interpretBestEffort(p1, p2, options)
      : undefined;

    return {
      numDiffPixels,
      totalPixels,
      percentDifference,
      diffBuffer,
      passed: isPassed(percentDifference, numDiffPixels, options),
      differentSizes: false,
      interpretation,
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

async function readDiffImage(
  diffPath: string,
  options: DiffConfig,
): Promise<Buffer | undefined> {
  let rawDiff: Buffer;
  try {
    rawDiff = await fsp.readFile(diffPath);
  } catch {
    // blazediff writes no diff image when the images match
    return undefined;
  }

  return injectTextMetadata(rawDiff, diffMetadataFor(options));
}

function diffMetadataFor(options: DiffConfig): Record<string, string> {
  const diffMetadata: Record<string, string> = {
    "cappa.diff.algorithm": "pixel",
  };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      diffMetadata[`cappa.diff.${key}`] = String(value);
    }
  }
  return diffMetadata;
}

/**
 * The diff for a size change whose padded images match: only background was
 * added or removed. blazediff writes nothing for a match, so this draws one in
 * the same spirit — the image faded out, with the area only one of the two
 * images covers tinted — rather than leave the reviewer a placeholder.
 */
async function renderSizeOnlyDiff(
  paddedActualPath: string,
  dimensions: NonNullable<CompareResult["dimensions"]>,
): Promise<PNG> {
  const image = await PNG.load(paddedActualPath);
  const sharedWidth = Math.min(
    dimensions.expected.width,
    dimensions.actual.width,
  );
  const sharedHeight = Math.min(
    dimensions.expected.height,
    dimensions.actual.height,
  );

  const data = image.data;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const gray =
        0.299 * (data[i] ?? 0) +
        0.587 * (data[i + 1] ?? 0) +
        0.114 * (data[i + 2] ?? 0);
      const faded = 255 + ((gray - 255) * 0.1 * (data[i + 3] ?? 0)) / 255;
      const outside = x >= sharedWidth || y >= sharedHeight;
      data[i] = outside ? 255 : faded;
      data[i + 1] = outside ? faded * 0.75 : faded;
      data[i + 2] = outside ? faded * 0.75 : faded;
      data[i + 3] = 255;
    }
  }

  return image;
}

async function interpretBestEffort(
  expectedPath: string,
  actualPath: string,
  options: DiffConfig,
): Promise<InterpretResult | undefined> {
  try {
    return await interpret(expectedPath, actualPath, undefined, {
      source: "pixel",
      threshold: options.threshold,
      antialiasing: options.includeAA ?? false,
    });
  } catch {
    // Interpretation is best-effort; don't fail the comparison.
    return undefined;
  }
}

/**
 * Compare two images of different sizes on a shared canvas.
 *
 * blazediff refuses a size mismatch outright (`layout-diff`), which used to
 * leave a changed screenshot with no pixel count, no diff image and no
 * regions — exactly the screenshots where something grew or shrank and a
 * reviewer most needs to see where. Padding both to the larger width and
 * height keeps every pixel at its original coordinates, so the diff, the
 * interpretation's region boxes and the review UI all line up with the
 * top-left of either image.
 */
async function compareOnCommonCanvas(
  expectedPath: string,
  actualPath: string,
  withDiff: boolean,
  options: DiffConfig,
  state: TempState,
): Promise<CompareResult> {
  const root = await ensureTempRoot(state);
  const canvas = await writeCommonCanvas(expectedPath, actualPath, root);
  const { dimensions, width, height } = canvas;
  const paddedExpected = canvas.expectedPath;
  const paddedActual = canvas.actualPath;
  const diffPath = withDiff ? path.join(root, "diff-canvas.png") : undefined;

  let nativeResult: BlazeDiffResult;
  try {
    nativeResult = await blazediffCompare(
      paddedExpected,
      paddedActual,
      diffPath,
      toNativeOptions(options),
    );
  } catch (error) {
    const message = (error as Error).message || "Unknown error";
    getLogger().error(message);
    return {
      numDiffPixels: 0,
      totalPixels: 0,
      percentDifference: 0,
      passed: false,
      differentSizes: true,
      dimensions,
      error: message,
    };
  }

  const matched = nativeResult.match;
  const numDiffPixels =
    "diffCount" in nativeResult ? nativeResult.diffCount : 0;
  const percentDifference =
    "diffPercentage" in nativeResult ? nativeResult.diffPercentage : 0;

  let diffBuffer: Buffer | undefined;
  if (withDiff && diffPath) {
    if (matched) {
      const image = await renderSizeOnlyDiff(canvas.actualPath, dimensions);
      diffBuffer = injectTextMetadata(
        await image.toBuffer(),
        diffMetadataFor(options),
      );
    } else {
      diffBuffer = await readDiffImage(diffPath, options);
    }
  }

  const interpretation =
    !matched && (options as CompareOptions).interpret && withDiff
      ? await interpretBestEffort(paddedExpected, paddedActual, options)
      : undefined;

  return {
    numDiffPixels,
    totalPixels: width * height,
    percentDifference,
    diffBuffer,
    passed: false,
    differentSizes: true,
    dimensions,
    interpretation,
  };
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
 * @param image1 - Baseline (expected) image (file path or Buffer)
 * @param image2 - Current (actual) image (file path or Buffer). Order matters
 *   for `interpret`: content only in `image2` is reported as an addition.
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
