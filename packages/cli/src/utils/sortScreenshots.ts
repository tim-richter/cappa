export const sortScreenshots = async (
  actualScreenshots: string[],
  expectedScreenshots: string[],
  diffScreenshots: string[],
  outputDir: string,
) => {
  const newScreenshots = await findNewScreenshots(
    actualScreenshots,
    expectedScreenshots,
  );
  const deletedScreenshots = await findDeletedScreenshots(
    actualScreenshots,
    expectedScreenshots,
  );
  const passedScreenshots = await findPassedScreenshots(
    diffScreenshots,
    actualScreenshots,
    expectedScreenshots,
  );
  const changedScreenshots = diffScreenshots;

  const screenshotRepresentations = [
    ...newScreenshots.map((screenshot) =>
      createScreenshotRepresentation(screenshot, "new", outputDir),
    ),
    ...deletedScreenshots.map((screenshot) =>
      createScreenshotRepresentation(screenshot, "deleted", outputDir),
    ),
    ...passedScreenshots.map((screenshot) =>
      createScreenshotRepresentation(screenshot, "passed", outputDir),
    ),
    ...changedScreenshots.map((screenshot) =>
      createScreenshotRepresentation(screenshot, "changed", outputDir),
    ),
  ];
  return screenshotRepresentations;
};

/**
 * New screenshots are screenshots that are in the actual directory but not in the expected directory.
 */
const findNewScreenshots = async (
  actualScreenshots: string[],
  expectedScreenshots: string[],
) => {
  return actualScreenshots.filter(
    (actualScreenshot) => !expectedScreenshots.includes(actualScreenshot),
  );
};

/**
 * Deleted screenshots are screenshots that are in the expected directory but not in the actual directory.
 */
const findDeletedScreenshots = async (
  actualScreenshots: string[],
  expectedScreenshots: string[],
) => {
  return expectedScreenshots.filter(
    (expectedScreenshot) => !actualScreenshots.includes(expectedScreenshot),
  );
};

/**
 * Passed screenshots are screenshots that are not in the diff directory and in the actual and expected directories.
 */
const findPassedScreenshots = async (
  diffScreenshots: string[],
  actualScreenshots: string[],
  expectedScreenshots: string[],
) => {
  return actualScreenshots.filter((actualScreenshot) => {
    const diffScreenshot = diffScreenshots.find((diffScreenshot) =>
      diffScreenshot.includes(actualScreenshot),
    );
    return !diffScreenshot && expectedScreenshots.includes(actualScreenshot);
  });
};

const createScreenshotRepresentation = (
  screenshot: string,
  category: "new" | "deleted" | "changed" | "passed",
  outputDir: string,
) => {
  return {
    name: screenshot.replace(outputDir, ""),
    url: screenshot,
    category,
  };
};
