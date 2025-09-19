export interface Screenshot {
  name: string;
  url: string;
  category: "new" | "deleted" | "changed" | "passed";
}

export type ScreenshotPaths = {
  new: Screenshot[];
  deleted: Screenshot[];
  passed: Screenshot[];
  changed: Screenshot[];
};

export enum View {
  Grid = "grid",
  List = "list",
}