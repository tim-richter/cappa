import type { Screenshot } from "@cappa/core";

export const findPreviewScreenshot = (screenshot: Screenshot) => {
  if (screenshot.category === "new") {
    return screenshot.actualPath;
  }

  if (screenshot.category === "deleted") {
    return screenshot.expectedPath;
  }

  if (screenshot.category === "changed") {
    return screenshot.diffPath;
  }

  return screenshot.expectedPath;
};
