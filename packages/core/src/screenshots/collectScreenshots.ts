import { glob } from "node:fs/promises";
import path from "node:path";
import { freshAgentReview, readAgentReviewIndex } from "../agent/reviewIndex";
import type { Screenshot } from "../types";
import { groupScreenshots } from "./groupScreenshots";
import { readCaptureManifest } from "./manifest";

const listPngs = async (dir: string): Promise<string[]> =>
  Array.fromAsync(await glob(path.resolve(dir, "**/*.png")));

/**
 * Read the `actual/`, `expected/` and `diff/` directories of `outputDir` and
 * group them into the screenshot representations used by the CLI commands
 * (including the diff metadata sidecar with the optional interpretation).
 *
 * The capture manifest is folded in here so every consumer — the CLI, the
 * server, the review UI — sees the same `taskId`, and so a screenshot captured
 * before manifests existed simply has none rather than a wrong one. The last
 * `cappa agent check` verdict is folded in the same way, as `review`, while it
 * still describes the images on disk.
 */
export const collectScreenshots = async (
  outputDir: string,
): Promise<Screenshot[]> => {
  const [
    actualScreenshots,
    expectedScreenshots,
    diffScreenshots,
    manifest,
    reviewIndex,
  ] = await Promise.all([
    listPngs(path.resolve(outputDir, "actual")),
    listPngs(path.resolve(outputDir, "expected")),
    listPngs(path.resolve(outputDir, "diff")),
    readCaptureManifest(outputDir),
    readAgentReviewIndex(outputDir),
  ]);

  const screenshots = await groupScreenshots(
    actualScreenshots,
    expectedScreenshots,
    diffScreenshots,
    outputDir,
  );

  return Promise.all(
    screenshots.map(async (screenshot) => {
      const origin = manifest.screenshots[screenshot.name];
      const withOrigin: Screenshot = origin
        ? { ...screenshot, taskId: origin.taskId, plugin: origin.plugin }
        : screenshot;

      if (withOrigin.category !== "changed" || !reviewIndex) {
        return withOrigin;
      }

      const review = await freshAgentReview(reviewIndex, outputDir, withOrigin);
      return review ? { ...withOrigin, review } : withOrigin;
    }),
  );
};
