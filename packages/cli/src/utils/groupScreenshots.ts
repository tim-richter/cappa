import { createHash } from "node:crypto";
import path from "node:path";
import type { Screenshot } from "@cappa/core";

export const groupScreenshots = (
  actualScreenshots: string[],
  expectedScreenshots: string[],
  diffScreenshots: string[],
  outputDir: string,
) => {
  const screenshotRepresentations: Screenshot[] = [];

  actualScreenshots.forEach((screenshot) => {
    const relativePath = path.relative(outputDir + "/actual", screenshot);
    const name = path
      .relative(outputDir + "/actual", screenshot)
      .replace(".png", "");
    const id = createHash("sha256").update(relativePath).digest("hex");

    const expectedScreenshot = expectedScreenshots.find(
      (expectedScreenshot) => {
        const expectedName = path.relative(
          outputDir + "/expected",
          expectedScreenshot,
        );
        return expectedName === relativePath;
      },
    );

    const diffScreenshot = diffScreenshots.find((diffScreenshot) => {
      const diffName = path.relative(outputDir + "/diff", diffScreenshot);
      return diffName === relativePath;
    });

    screenshotRepresentations.push({
      id: id,
      name: name,
      category: buildCategory(expectedScreenshot, diffScreenshot),
      expectedPath: expectedScreenshot ? path.relative(outputDir, expectedScreenshot) : undefined,
      diffPath: diffScreenshot ? path.relative(outputDir, diffScreenshot) : undefined,
      actualPath: path.relative(outputDir, screenshot),
      approved: false,
    });
  });

  expectedScreenshots.forEach((expectedScreenshot) => {
    const relativePath = path.relative(
      outputDir + "/expected",
      expectedScreenshot,
    );
    const name = path
      .relative(outputDir + "/expected", expectedScreenshot)
      .replace(".png", "");
    const id = createHash("sha256").update(relativePath).digest("hex");

    const actualScreenshot = actualScreenshots.find((actualScreenshot) => {
      const actualName = path.relative(outputDir + "/actual", actualScreenshot);
      return actualName === relativePath;
    });

    // If the actual screenshot exists, it means we already added it to the screenshotRepresentations
    if (actualScreenshot) {
      return;
    }

    screenshotRepresentations.push({
      id: id,
      name: name,
      category: "deleted",
      actualPath: undefined,
      expectedPath: path.relative(outputDir, expectedScreenshot),
      diffPath: undefined,
      approved: false,
    });
  });

  return screenshotRepresentations;
};

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
