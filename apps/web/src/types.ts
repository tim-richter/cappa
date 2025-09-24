export interface Screenshot {
  id: string;
  name: string;
  category: "new" | "deleted" | "changed" | "passed";
  actualPath?: string;
  expectedPath?: string;
  diffPath?: string;
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
