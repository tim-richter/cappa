import type { MetadataEntries } from "./types";

type ParsedChunk = {
  type: string;
  data: Buffer;
  length: number;
  offset: number;
};

// Magic Bytes:
// The first 8 bytes of every valid PNG file.
// Used to verify that the file is actually a PNG before processing.
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// A pre-calculated lookup table for the CRC32 algorithm.
// We use this to quickly calculate the checksum for each chunk we write.
// Without this table, calculating CRC bit-by-bit would be significantly slower.
const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }

  return c >>> 0;
});

/**
 * Chunk Parser Generator
 *
 * A PNG file is essentially a list of chunks.
 * Structure of a chunk:
 * 1. Length (4 bytes): The size of the data field.
 * 2. Type (4 bytes): ASCII name (e.g., 'IHDR', 'tEXt', 'IEND').
 * 3. Data (Length bytes): The actual payload.
 * 4. CRC (4 bytes): Checksum.
 */
function* readChunks(buffer: Buffer): Generator<ParsedChunk> {
  let offset = pngSignature.length;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd > buffer.length) {
      return;
    }

    const data = buffer.subarray(dataStart, dataEnd);

    yield { type, data, length, offset };

    offset = dataEnd + 4; // Skip CRC

    if (type === "IEND") {
      return;
    }
  }
}

/**
 * Constructs a raw binary `tEXt` chunk.
 */
export function createTextChunk(key: string, value: string) {
  const keyBuffer = Buffer.from(key, "latin1");
  const valueBuffer = Buffer.from(value, "latin1");
  const data = Buffer.concat([keyBuffer, Buffer.from([0]), valueBuffer]);
  const lengthBuffer = Buffer.alloc(4);
  const typeBuffer = Buffer.from("tEXt");

  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

/**
 * Calculates the CRC32 checksum for a buffer.
 * Used to ensure data integrity.
 */
export function crc32(buffer: Buffer) {
  let crc = 0 ^ -1;

  for (let i = 0; i < buffer.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: we know the index is valid
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]!) & 0xff]!;
  }

  return (crc ^ -1) >>> 0;
}

/**
 * Helper to locate the IEND chunk, which marks the end of a PNG stream.
 */
function findIendChunk(buffer: Buffer): ParsedChunk | undefined {
  for (const chunk of readChunks(buffer)) {
    if (chunk.type === "IEND") {
      return chunk;
    }
  }

  return undefined;
}

/**
 * Inserts metadata chunks into a PNG buffer.
 * It places them right before the final `IEND` chunk.
 */
export function injectTextMetadata(buffer: Buffer, metadata: MetadataEntries) {
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    return buffer;
  }

  const iendChunk = findIendChunk(buffer);
  if (!iendChunk) {
    return buffer;
  }

  const textChunks = Object.entries(metadata).map(([key, value]) =>
    createTextChunk(key, value),
  );

  return Buffer.concat([
    buffer.subarray(0, iendChunk.offset),
    ...textChunks,
    buffer.subarray(iendChunk.offset),
  ]);
}

/**
 * Scans a raw PNG buffer and extracts key-value pairs from `tEXt` chunks.
 */
export function extractTextMetadata(buffer: Buffer): MetadataEntries {
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    return {};
  }

  const metadata: MetadataEntries = {};

  for (const chunk of readChunks(buffer)) {
    if (chunk.type !== "tEXt") {
      continue;
    }

    const separatorIndex = chunk.data.indexOf(0);
    if (separatorIndex < 0) {
      continue;
    }

    const key = chunk.data.toString("latin1", 0, separatorIndex);
    const value = chunk.data.toString("latin1", separatorIndex + 1);

    metadata[key] = value;
  }

  return metadata;
}
