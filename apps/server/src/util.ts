import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Screenshot } from "@cappa/core";
import { ASSET_PREFIX } from "@cappa/protocol";

export const hereDir = () => {
  return path.dirname(fileURLToPath(import.meta.url));
};

export const resolveFromHere = (relative: string) => {
  return path.resolve(hereDir(), relative);
};

/** Loopback binds need no token; anything else is reachable from the network. */
export const isLoopbackHost = (host: string): boolean =>
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "::1" ||
  host === "[::1]" ||
  host.startsWith("127.");

/** A screenshot as the review UI consumes it. */
export type ScreenshotView = Omit<
  Screenshot,
  "actualPath" | "expectedPath" | "diffPath"
> & {
  approved: boolean;
  actualPath?: string;
  expectedPath?: string;
  diffPath?: string;
  next?: string;
  prev?: string;
};

/**
 * Turn the engine's on-disk view of screenshots into the shape the review UI
 * consumes: asset URLs instead of relative paths, plus `next`/`prev` links and
 * an `approved` flag.
 *
 * `next`/`prev` are computed over the *whole* list before any filtering, so
 * keyboard navigation walks every screenshot rather than only the current tab.
 */
export const transform = (screenshots: Screenshot[]): ScreenshotView[] =>
  withNextAndPrev(screenshots.map(toView));

const assetUrl = (relativePath?: string) =>
  relativePath ? `${ASSET_PREFIX}/${relativePath}` : undefined;

const toView = (screenshot: Screenshot): ScreenshotView => {
  const paths = screenshot as Partial<
    Record<"actualPath" | "expectedPath" | "diffPath", string>
  >;

  return {
    ...screenshot,
    // A screenshot matching its baseline has nothing left to approve, so the
    // flag is derived rather than stored — the index is read from disk on every
    // request and holds no session state.
    approved: screenshot.approved ?? screenshot.category === "passed",
    actualPath: assetUrl(paths.actualPath),
    expectedPath: assetUrl(paths.expectedPath),
    diffPath: assetUrl(paths.diffPath),
  } as ScreenshotView;
};

const withNextAndPrev = (screenshots: ScreenshotView[]): ScreenshotView[] =>
  screenshots.map((screenshot, index) => ({
    ...screenshot,
    next: screenshots[index + 1]?.id,
    prev: screenshots[index - 1]?.id,
  }));
