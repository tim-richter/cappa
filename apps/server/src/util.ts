import { stat } from "node:fs/promises";
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
 *
 * Asset URLs carry the file's mtime as `?v=`, so a re-captured screenshot gets
 * a new URL. Without it the browser keeps painting the image it already has
 * for an unchanged `src`, and the review UI shows the old capture next to the
 * new verdict.
 */
export const transform = async (
  screenshots: Screenshot[],
  outputDir: string,
): Promise<ScreenshotView[]> =>
  withNextAndPrev(
    await Promise.all(
      screenshots.map((screenshot) => toView(screenshot, outputDir)),
    ),
  );

const assetUrl = async (
  outputDir: string,
  relativePath?: string,
): Promise<string | undefined> => {
  if (!relativePath) {
    return undefined;
  }

  const url = `${ASSET_PREFIX}/${relativePath}`;

  try {
    const { mtimeMs } = await stat(path.resolve(outputDir, relativePath));
    return `${url}?v=${Math.trunc(mtimeMs)}`;
  } catch {
    // Not on disk (or not a local engine): the plain URL is still correct,
    // just not cache-busted.
    return url;
  }
};

const toView = async (
  screenshot: Screenshot,
  outputDir: string,
): Promise<ScreenshotView> => {
  const paths = screenshot as Partial<
    Record<"actualPath" | "expectedPath" | "diffPath", string>
  >;

  const [actualPath, expectedPath, diffPath] = await Promise.all([
    assetUrl(outputDir, paths.actualPath),
    assetUrl(outputDir, paths.expectedPath),
    assetUrl(outputDir, paths.diffPath),
  ]);

  return {
    ...screenshot,
    // A screenshot matching its baseline has nothing left to approve, so the
    // flag is derived rather than stored — the index is read from disk on every
    // request and holds no session state.
    approved: screenshot.approved ?? screenshot.category === "passed",
    actualPath,
    expectedPath,
    diffPath,
  } as ScreenshotView;
};

const withNextAndPrev = (screenshots: ScreenshotView[]): ScreenshotView[] =>
  screenshots.map((screenshot, index) => ({
    ...screenshot,
    next: screenshots[index + 1]?.id,
    prev: screenshots[index - 1]?.id,
  }));
