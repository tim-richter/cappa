import { open } from "node:fs/promises";
import { crc32, createTextChunk, isValidPngSignature } from "./util";

/**
 * A screenshot's pixel ratio — image pixels per CSS pixel — stored in the PNG
 * itself.
 *
 * Kept in the file rather than beside it because `approve` is a plain copy:
 * the baseline carries the ratio it was captured at through approve, git and
 * CI artifacts with no bookkeeping.
 *
 * Two chunks, both before the image data:
 * - a `tEXt` chunk keyed `cappa:pixelRatio` — the source of truth. Only cappa
 *   writes it, so an image another tool stamped with a DPI is never misread.
 * - a standard `pHYs` chunk, which image viewers read as DPI, so a 2×
 *   screenshot opens at its CSS size in tools that honour it.
 *
 * Only written for ratios other than 1. A PNG without the key is 1×, which is
 * what every screenshot taken with `scale: "css"` is — so those stay
 * byte-for-byte what they were, and `fastBufferCheck` keeps matching them.
 */
export const PIXEL_RATIO_KEY = "cappa:pixelRatio";

/** Pixels per metre at 96 DPI, the CSS reference pixel density. */
const PPM_AT_1X = 96 / 0.0254;

const SIGNATURE_LENGTH = 8;
const IHDR_END = SIGNATURE_LENGTH + 8 + 13 + 4;
/** Ancillary chunks before IDAT are few; bound every walk regardless. */
const MAX_CHUNKS_BEFORE_IDAT = 64;

const roundRatio = (ratio: number) => Math.round(ratio * 100) / 100;

const createPhysChunk = (ratio: number): Buffer => {
  const ppm = Math.round(PPM_AT_1X * ratio);
  const chunk = Buffer.alloc(4 + 4 + 9 + 4);
  chunk.writeUInt32BE(9, 0);
  chunk.write("pHYs", 4, "ascii");
  chunk.writeUInt32BE(ppm, 8);
  chunk.writeUInt32BE(ppm, 12);
  chunk.writeUInt8(1, 16); // unit: metre
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 17)), 17);
  return chunk;
};

const isRatioText = (type: string, data: Buffer) =>
  type === "tEXt" &&
  data.length > PIXEL_RATIO_KEY.length &&
  data.toString("latin1", 0, PIXEL_RATIO_KEY.length + 1) ===
    `${PIXEL_RATIO_KEY}\0`;

const parseRatioText = (data: Buffer): number | undefined => {
  const value = Number(data.toString("latin1", PIXEL_RATIO_KEY.length + 1));
  return Number.isFinite(value) && value > 0 ? roundRatio(value) : undefined;
};

type Chunk = { type: string; start: number; end: number; data: Buffer };

/** The chunks between IHDR and the first IDAT. */
function* chunksBeforeImage(buffer: Buffer): Generator<Chunk> {
  let offset = IHDR_END;
  for (let i = 0; i < MAX_CHUNKS_BEFORE_IDAT; i++) {
    if (offset + 8 > buffer.length) return;
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (type === "IDAT" || type === "IEND" || end > buffer.length) return;
    yield {
      type,
      start: offset,
      end,
      data: buffer.subarray(offset + 8, offset + 8 + length),
    };
    offset = end;
  }
}

const hasIhdr = (buffer: Buffer) =>
  isValidPngSignature(buffer) &&
  buffer.length >= IHDR_END &&
  buffer.toString("ascii", 12, 16) === "IHDR";

/**
 * Return `buffer` stamped with `ratio`, replacing any ratio it carried.
 *
 * Ratio 1 removes cappa's chunks instead (see above); a `pHYs` some other tool
 * wrote is left alone unless cappa is writing its own. Anything that is not a
 * PNG comes back untouched. No pixel data is re-encoded.
 */
export function withPixelRatio(buffer: Buffer, ratio: number): Buffer {
  if (!hasIhdr(buffer)) return buffer;

  const stamp = ratio > 0 && roundRatio(ratio) !== 1;
  const chunks = [...chunksBeforeImage(buffer)];
  const ours = chunks.some((chunk) => isRatioText(chunk.type, chunk.data));
  if (!stamp && !ours) return buffer;

  const drop = chunks.filter(
    (chunk) =>
      isRatioText(chunk.type, chunk.data) ||
      (chunk.type === "pHYs" && (stamp || ours)),
  );

  const parts: Buffer[] = [buffer.subarray(0, IHDR_END)];
  if (stamp) {
    parts.push(
      createTextChunk(PIXEL_RATIO_KEY, String(roundRatio(ratio))),
      createPhysChunk(ratio),
    );
  }
  let copyFrom = IHDR_END;
  for (const chunk of drop) {
    parts.push(buffer.subarray(copyFrom, chunk.start));
    copyFrom = chunk.end;
  }
  parts.push(buffer.subarray(copyFrom));

  return Buffer.concat(parts);
}

async function readHead(path: string): Promise<Buffer | undefined> {
  const fh = await open(path, "r");
  try {
    // IHDR first, then walk chunk headers until IDAT, reading only those.
    const head = Buffer.alloc(IHDR_END);
    const { bytesRead } = await fh.read(head, 0, IHDR_END, 0);
    if (bytesRead < IHDR_END || !hasIhdr(head)) return undefined;

    const parts: Buffer[] = [head];
    const header = Buffer.alloc(8);
    let offset = IHDR_END;
    for (let i = 0; i < MAX_CHUNKS_BEFORE_IDAT; i++) {
      const read = await fh.read(header, 0, 8, offset);
      if (read.bytesRead < 8) break;
      const length = header.readUInt32BE(0);
      const type = header.toString("ascii", 4, 8);
      if (type === "IDAT" || type === "IEND") break;
      const chunk = Buffer.alloc(12 + length);
      await fh.read(chunk, 0, chunk.length, offset);
      parts.push(chunk);
      offset += chunk.length;
    }
    return Buffer.concat(parts);
  } finally {
    await fh.close();
  }
}

/**
 * The pixel ratio a screenshot was captured at: 1 when the PNG carries no
 * ratio, and also when the file cannot be read — a missing ratio must never
 * break listing or comparing screenshots.
 */
export async function readPixelRatio(source: string | Buffer): Promise<number> {
  try {
    const buffer = typeof source === "string" ? await readHead(source) : source;
    if (!buffer || !hasIhdr(buffer)) return 1;
    for (const chunk of chunksBeforeImage(buffer)) {
      if (isRatioText(chunk.type, chunk.data)) {
        return parseRatioText(chunk.data) ?? 1;
      }
    }
    return 1;
  } catch {
    return 1;
  }
}

/** The ratios of a baseline and the screenshot compared against it. */
export type PixelRatioPair = { expected: number; actual: number };

const formatRatio = (ratio: number) => `${ratio}×`;

/**
 * Why a screenshot cannot match its baseline when the two were captured at
 * different pixel ratios — `screenshot.scale` or `deviceScaleFactor` changed.
 */
export function describePixelRatioMismatch(
  expected: number,
  actual: number,
): string {
  return (
    `Baseline was captured at ${formatRatio(expected)} pixel ratio, this screenshot at ${formatRatio(actual)}, ` +
    "so their sizes cannot match. If the change of screenshot.scale or deviceScaleFactor is intended, " +
    "approve the new screenshots; otherwise restore the previous setting."
  );
}
