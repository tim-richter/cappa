import type { Screenshot } from "@cappa/core";

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
