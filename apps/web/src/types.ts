export interface Screenshot {
  name: string;
  url: string;
  category: "changed" | "new" | "deleted" | "passed";
}

export type ScreenshotPaths = {
  actual: Screenshot[];
  expected: Screenshot[];
  diff: Screenshot[];
};
