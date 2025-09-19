import fs from "node:fs/promises";
import path from "node:path";
import { resolveFromHere } from "./util";

const IMAGE_EXT = new Set([".png", ".jpg"]);

export const getAllScreenshots = async (outputDir: string) => {
  const entries: Array<{ name: string; url: string; size: number }> = [];

  const dir = await fs.opendir(resolveFromHere(outputDir));

  for await (const d of dir) {
    if (!d.isFile()) continue;
    const ext = path.extname(d.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const stat = await fs.stat(path.join(outputDir, d.name));

    entries.push({
      name: d.name,
      url: encodeURIComponent(d.name),
      size: stat.size,
    });
  }

  return entries;
};
