import { glob } from "node:fs/promises";
import path from "node:path";
import { getLogger } from "@cappa/logger";
import { createServer } from "@cappa/server";
import { getConfig } from "../features/config";
import { groupScreenshots } from "../utils/groupScreenshots";

export const review = async () => {
  const logger = getLogger();

  const config = await getConfig();

  const actualScreenshotsPromise = glob(
    path.resolve(config.outputDir, "actual", "**/*.png"),
  );
  const expectedScreenshotsPromise = glob(
    path.resolve(config.outputDir, "expected", "**/*.png"),
  );
  const diffScreenshotsPromise = glob(
    path.resolve(config.outputDir, "diff", "**/*.png"),
  );

  const [actualScreenshots, expectedScreenshots, diffScreenshots] =
    await Promise.all([
      actualScreenshotsPromise,
      expectedScreenshotsPromise,
      diffScreenshotsPromise,
    ]);

  const groupedScreenshots = await groupScreenshots(
    await Array.fromAsync(actualScreenshots),
    await Array.fromAsync(expectedScreenshots),
    await Array.fromAsync(diffScreenshots),
    config.outputDir,
  );

  const server = await createServer({
    isProd: true,
    outputDir: path.resolve(config.outputDir),
    screenshots: groupedScreenshots,
    logger: getLogger().level >= 4,
  });

  logger.success("Review UI available at http://localhost:3000");
  await server.listen({ port: 3000 });
};
