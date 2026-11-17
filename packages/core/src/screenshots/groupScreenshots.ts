import { createHash } from "node:crypto";
import path from "node:path";
import { readPixelRatio } from "../features/png/pixelRatio";
import { readDiffMeta } from "../filesystem";
import type { Screenshot } from "../types";

export const groupScreenshots = async (
  actualScreenshots: string[],
  expectedScreenshots: string[],
  diffScreenshots: string[],
  outputDir: string,
): Promise<Screenshot[]> => {
  const screenshotRepresentations: Screenshot[] = [];

  // Build Maps for O(1) lookups instead of O(n) .find() calls
  const expectedByRelativePath = new Map<string, string>();
  for (const screenshot of expectedScreenshots) {
    const relativePath = path.relative(`${outputDir}/expected`, screenshot);
    expectedByRelativePath.set(relativePath, screenshot);
  }

  const diffByRelativePath = new Map<string, string>();
  for (const screenshot of diffScreenshots) {
    const relativePath = path.relative(`${outputDir}/diff`, screenshot);
    diffByRelativePath.set(relativePath, screenshot);
  }

  const actualRelativePaths = new Set<string>();

  for (const screenshot of actualScreenshots) {
    const relativePath = path.relative(`${outputDir}/actual`, screenshot);
    actualRelativePaths.add(relativePath);

    const name = relativePath.replace(".png", "");
    const id = createHash("sha256").update(relativePath).digest("hex");

    const expectedScreenshot = expectedByRelativePath.get(relativePath);
    const diffScreenshot = diffByRelativePath.get(relativePath);

    // Load the diff metadata sidecar (stats + interpretation) for changed
    // screenshots so it can be surfaced in the review UI and CLI.
    const [diffMeta, actualPixelRatio, expectedPixelRatio] = await Promise.all([
      diffScreenshot ? readDiffMeta(diffScreenshot) : undefined,
      readPixelRatio(screenshot),
      expectedScreenshot ? readPixelRatio(expectedScreenshot) : 1,
    ]);

    screenshotRepresentations.push({
      id: id,
      name: name,
      category: buildCategory(expectedScreenshot, diffScreenshot),
      expectedPath: expectedScreenshot
        ? path.relative(outputDir, expectedScreenshot)
        : undefined,
      diffPath: diffScreenshot
        ? path.relative(outputDir, diffScreenshot)
        : undefined,
      actualPath: path.relative(outputDir, screenshot),
      ...(diffMeta ? { diffMeta } : {}),
      ...pixelRatios(actualPixelRatio, expectedPixelRatio),
    } as Screenshot);
  }

  for (const expectedScreenshot of expectedScreenshots) {
    const relativePath = path.relative(
      `${outputDir}/expected`,
      expectedScreenshot,
    );

    // If the actual screenshot exists, it means we already added it
    if (actualRelativePaths.has(relativePath)) {
      continue;
    }

    const name = relativePath.replace(".png", "");
    const id = createHash("sha256").update(relativePath).digest("hex");

    screenshotRepresentations.push({
      id: id,
      name: name,
      category: "deleted",
      expectedPath: path.relative(outputDir, expectedScreenshot),
      ...pixelRatios(1, await readPixelRatio(expectedScreenshot)),
    });
  }

  return screenshotRepresentations.sort((a, b) => {
    return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  });
};

/** Ratios other than 1 only: absent means 1, which keeps 1× listings as they were. */
const pixelRatios = (actual: number, expected: number) => ({
  ...(actual !== 1 ? { actualPixelRatio: actual } : {}),
  ...(expected !== 1 ? { expectedPixelRatio: expected } : {}),
});

const buildCategory = (
  expectedScreenshot: string | undefined,
  diffScreenshot: string | undefined,
) => {
  if (expectedScreenshot && diffScreenshot) {
    return "changed";
  }
  if (expectedScreenshot) {
    return "passed";
  }

  return "new";
};

const CATEGORY_ORDER: Record<Screenshot["category"], number> = {
  new: 0,
  deleted: 1,
  changed: 2,
  passed: 3,
};
