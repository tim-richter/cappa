import path from "node:path";
import { PNG } from "./png";

export type Size = { width: number; height: number };

export type CommonCanvas = {
  /** The padded copy of the expected image. */
  expectedPath: string;
  /** The padded copy of the actual image. */
  actualPath: string;
  /** The shared canvas: the larger width and the larger height of the two. */
  width: number;
  height: number;
  /** Both images' own dimensions, before padding. */
  dimensions: { expected: Size; actual: Size };
};

/**
 * Write copies of two images, padded to a shared canvas, into `dir`.
 *
 * Both are anchored top-left and padded up to the larger width and the larger
 * height, so every pixel keeps its original coordinates and a region found on
 * the canvas points at the same spot in either image.
 *
 * Each image is padded with its own background — the most common colour on
 * the edges being extended — rather than with transparency. Area an image
 * never covered then reads as empty rather than as content: a list that grew
 * by one item diffs as that item (an addition), not as a whole strip that
 * changed, and a component that only gained whitespace diffs as nothing at
 * all, leaving the size change itself as the finding.
 */
export async function writeCommonCanvas(
  expected: string | Buffer,
  actual: string | Buffer,
  dir: string,
): Promise<CommonCanvas> {
  const [expectedPng, actualPng] = await Promise.all([
    PNG.load(expected),
    PNG.load(actual),
  ]);

  const width = Math.max(expectedPng.width, actualPng.width);
  const height = Math.max(expectedPng.height, actualPng.height);
  const expectedPath = path.join(dir, "expected-canvas.png");
  const actualPath = path.join(dir, "actual-canvas.png");

  await Promise.all([
    expectedPng
      .padTo(width, height, expectedPng.edgeColor())
      .save(expectedPath),
    actualPng.padTo(width, height, actualPng.edgeColor()).save(actualPath),
  ]);

  return {
    expectedPath,
    actualPath,
    width,
    height,
    dimensions: {
      expected: { width: expectedPng.width, height: expectedPng.height },
      actual: { width: actualPng.width, height: actualPng.height },
    },
  };
}
