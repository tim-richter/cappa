import { glob } from "node:fs/promises";
import path from "node:path";
import type { Screenshot } from "../types";
import { groupScreenshots } from "./groupScreenshots";

const listPngs = async (dir: string): Promise<string[]> =>
  Array.fromAsync(await glob(path.resolve(dir, "**/*.png")));

/**
 * Read the `actual/`, `expected/` and `diff/` directories of `outputDir` and
 * group them into the screenshot representations used by the CLI commands
 * (including the diff metadata sidecar with the optional interpretation).
 */
export const collectScreenshots = async (
  outputDir: string,
): Promise<Screenshot[]> => {
  const [actualScreenshots, expectedScreenshots, diffScreenshots] =
    await Promise.all([
      listPngs(path.resolve(outputDir, "actual")),
      listPngs(path.resolve(outputDir, "expected")),
      listPngs(path.resolve(outputDir, "diff")),
    ]);

  return groupScreenshots(
    actualScreenshots,
    expectedScreenshots,
    diffScreenshots,
    outputDir,
  );
};
