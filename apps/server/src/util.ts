import path from "node:path";
import { fileURLToPath } from "node:url";

export const hereDir = () => {
  return path.dirname(fileURLToPath(import.meta.url));
};

export const resolveFromHere = (relative: string) => {
  return path.resolve(hereDir(), relative);
};
