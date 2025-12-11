import type { PNG as PngjsPNG } from "pngjs";

export type MetadataEntries = Record<string, string>;

export type PngWithMetadata = PngjsPNG & { text?: MetadataEntries };
