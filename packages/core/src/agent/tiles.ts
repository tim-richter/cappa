import path from "node:path";
import type { BoundingBox } from "@blazediff/interpret-native";
import sharp, { type OverlayOptions } from "sharp";

/**
 * Evidence images for a judge, sized for a model's context window rather than
 * for a human's screen.
 *
 * A full-page screenshot is easily 1920x8000 — expensive to read and mostly
 * unchanged. A judge needs two things instead: where the changes are
 * (`locator.png`, a small outlined thumbnail) and what each one looks like
 * before and after (`regions.png`, tight crops side by side). Together they
 * are typically one to two orders of magnitude smaller than the full images.
 */

export type TileOptions = {
  expectedPath: string;
  actualPath: string;
  /** Diff image to outline the regions on; falls back to the actual image. */
  diffPath?: string;
  /** Regions, largest first — row order in `regions.png` follows this. */
  regions: readonly BoundingBox[];
  outDir: string;
  /** Regions rendered into `regions.png`. Default 8. */
  maxRegions?: number;
  /**
   * Minimum context kept around each region, in pixels; grows with the
   * region's size. Default 24.
   */
  padding?: number;
  /** Largest width a single crop is rendered at. Default 640. */
  maxCropWidth?: number;
};

export type TileResult = {
  /** Absolute path, or undefined when nothing could be drawn. */
  locator?: string;
  /** Absolute path, or undefined when there were no regions. */
  regions?: string;
  /** How many regions `regions.png` holds (≤ `maxRegions`). */
  renderedRegions: number;
};

const LOCATOR_MAX_WIDTH = 400;
const LOCATOR_MAX_HEIGHT = 1200;
const GUTTER = 12;
const ROW_GUTTER = 16;
const LABEL_HEIGHT = 18;
const BACKGROUND = { r: 128, g: 128, b: 128 };

const escapeXml = (text: string) =>
  text.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** A caption strip, so a row reads as "#2 expected | #2 actual" at a glance. */
const label = (text: string, width: number): Buffer =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_HEIGHT}"><rect width="100%" height="100%" fill="#222"/><text x="4" y="13" font-family="sans-serif" font-size="12" fill="#fff">${escapeXml(text)}</text></svg>`,
  );

export const padAndClamp = (
  bbox: BoundingBox,
  padding: number | { x: number; y: number },
  width: number,
  height: number,
): BoundingBox => {
  const padX = typeof padding === "number" ? padding : padding.x;
  const padY = typeof padding === "number" ? padding : padding.y;
  const x = Math.max(0, Math.floor(bbox.x - padX));
  const y = Math.max(0, Math.floor(bbox.y - padY));
  const right = Math.min(width, Math.ceil(bbox.x + bbox.width + padX));
  const bottom = Math.min(height, Math.ceil(bbox.y + bbox.height + padY));
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Context kept around a region: proportional to its size, within bounds.
 *
 * A fixed margin is too tight for small regions — a changed letter cropped
 * with 24px around it says nothing about whether a button label got
 * truncated — and wasteful for large ones.
 */
export const contextPadding = (
  bbox: BoundingBox,
  minimum: number,
): { x: number; y: number } => ({
  x: clamp(bbox.width, minimum * 2, 160),
  y: clamp(bbox.height, minimum, 96),
});

/** Scale that fits `width`x`height` into the bounds without upscaling. */
const fitScale = (
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) => Math.min(1, maxWidth / width, maxHeight / height);

const readSize = async (file: string) => {
  const { width, height } = await sharp(file).metadata();
  if (!width || !height) {
    throw new Error(`Unable to read image dimensions: ${file}`);
  }
  return { width, height };
};

const renderCrop = async (
  file: string,
  box: BoundingBox,
  scale: number,
): Promise<Buffer> => {
  const crop = sharp(file).extract({
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
  });
  if (scale < 1) {
    crop.resize(
      Math.max(1, Math.round(box.width * scale)),
      Math.max(1, Math.round(box.height * scale)),
    );
  }
  return crop.png().toBuffer();
};

const renderRegions = async (
  options: TileOptions,
  width: number,
  height: number,
): Promise<{ file: string; count: number } | undefined> => {
  const padding = options.padding ?? 24;
  const maxCropWidth = options.maxCropWidth ?? 640;
  const regions = options.regions.slice(0, options.maxRegions ?? 8);

  if (regions.length === 0) return undefined;

  const rows = await Promise.all(
    regions.map(async (region) => {
      const box = padAndClamp(
        region,
        contextPadding(region, padding),
        width,
        height,
      );
      const scale = Math.min(1, maxCropWidth / box.width);
      const [expected, actual] = await Promise.all([
        renderCrop(options.expectedPath, box, scale),
        renderCrop(options.actualPath, box, scale),
      ]);
      return {
        expected,
        actual,
        width: Math.max(1, Math.round(box.width * scale)),
        height: Math.max(1, Math.round(box.height * scale)),
      };
    }),
  );

  // Wide enough for the captions even when a crop is a sliver.
  const columnWidth = (row: { width: number }) => Math.max(row.width, 96);
  const canvasWidth = Math.max(
    ...rows.map((row) => columnWidth(row) * 2 + GUTTER),
  );
  const canvasHeight =
    rows.reduce((sum, row) => sum + LABEL_HEIGHT + row.height, 0) +
    ROW_GUTTER * (rows.length - 1);

  const composites: OverlayOptions[] = [];
  let top = 0;
  rows.forEach((row, index) => {
    const column = columnWidth(row);
    const right = column + GUTTER;
    composites.push(
      { input: label(`#${index + 1} expected`, column), left: 0, top },
      { input: label(`#${index + 1} actual`, column), left: right, top },
      { input: row.expected, left: 0, top: top + LABEL_HEIGHT },
      { input: row.actual, left: right, top: top + LABEL_HEIGHT },
    );
    top += LABEL_HEIGHT + row.height + ROW_GUTTER;
  });

  const file = path.join(options.outDir, "regions.png");
  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite(composites)
    .png()
    .toFile(file);

  return { file, count: rows.length };
};

const renderLocator = async (
  options: TileOptions,
  width: number,
  height: number,
): Promise<string> => {
  const scale = fitScale(width, height, LOCATOR_MAX_WIDTH, LOCATOR_MAX_HEIGHT);
  const locatorWidth = Math.max(1, Math.round(width * scale));
  const locatorHeight = Math.max(1, Math.round(height * scale));

  // Numbered so a region in the thumbnail can be matched to its row in
  // `regions.png` and its entry in `request.json` without counting boxes.
  const shapes = options.regions
    .map((region, index) => {
      const x = Math.round(region.x * scale);
      const y = Math.round(region.y * scale);
      const w = Math.max(2, Math.round(region.width * scale));
      const h = Math.max(2, Math.round(region.height * scale));
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="red" stroke-width="2"/><text x="${x + 2}" y="${Math.max(12, y - 3)}" font-family="sans-serif" font-size="12" font-weight="bold" fill="red" stroke="#fff" stroke-width="3" paint-order="stroke">${index + 1}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${locatorWidth}" height="${locatorHeight}">${shapes}</svg>`;

  const file = path.join(options.outDir, "locator.png");
  await sharp(options.diffPath ?? options.actualPath)
    .resize(locatorWidth, locatorHeight, { fit: "fill" })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toFile(file);

  return file;
};

/**
 * Write `locator.png` and `regions.png` into `outDir`.
 *
 * Expected and actual must have the same dimensions — region boxes are only
 * meaningful when both images share a coordinate space. Use
 * {@link renderOverview} when they do not.
 */
export const renderJudgmentTiles = async (
  options: TileOptions,
): Promise<TileResult> => {
  const { width, height } = await readSize(options.actualPath);

  const [regions, locator] = await Promise.all([
    renderRegions(options, width, height),
    renderLocator(options, width, height),
  ]);

  return {
    locator,
    regions: regions?.file,
    renderedRegions: regions?.count ?? 0,
  };
};

/**
 * Write `overview.png`: expected and actual, scaled down side by side.
 *
 * For screenshots whose dimensions changed, where no region can be located,
 * this is what the judge looks at instead of two full-size images.
 */
export const renderOverview = async (options: {
  expectedPath: string;
  actualPath: string;
  outDir: string;
}): Promise<string> => {
  const [expectedSize, actualSize] = await Promise.all([
    readSize(options.expectedPath),
    readSize(options.actualPath),
  ]);

  // One scale for both, so a height difference stays visible as one.
  const scale = Math.min(
    fitScale(
      expectedSize.width,
      expectedSize.height,
      LOCATOR_MAX_WIDTH,
      LOCATOR_MAX_HEIGHT,
    ),
    fitScale(
      actualSize.width,
      actualSize.height,
      LOCATOR_MAX_WIDTH,
      LOCATOR_MAX_HEIGHT,
    ),
  );

  const scaled = (size: { width: number; height: number }) => ({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  });
  const expected = scaled(expectedSize);
  const actual = scaled(actualSize);

  const [expectedBuffer, actualBuffer] = await Promise.all([
    sharp(options.expectedPath)
      .resize(expected.width, expected.height, { fit: "fill" })
      .png()
      .toBuffer(),
    sharp(options.actualPath)
      .resize(actual.width, actual.height, { fit: "fill" })
      .png()
      .toBuffer(),
  ]);

  const file = path.join(options.outDir, "overview.png");
  await sharp({
    create: {
      width: expected.width + GUTTER + actual.width,
      height: LABEL_HEIGHT + Math.max(expected.height, actual.height),
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite([
      {
        input: label(
          `expected ${expectedSize.width}x${expectedSize.height}`,
          expected.width,
        ),
        left: 0,
        top: 0,
      },
      {
        input: label(
          `actual ${actualSize.width}x${actualSize.height}`,
          actual.width,
        ),
        left: expected.width + GUTTER,
        top: 0,
      },
      { input: expectedBuffer, left: 0, top: LABEL_HEIGHT },
      {
        input: actualBuffer,
        left: expected.width + GUTTER,
        top: LABEL_HEIGHT,
      },
    ])
    .png()
    .toFile(file);

  return file;
};
