import { getConfig } from "@cappa/config";
import {
  buildPlaywrightImage,
  installedPlaywrightVersion,
  removePlaywrightContainers,
  removePlaywrightImages,
  resolveContainerOptions,
} from "@cappa/core";
import { getLogger } from "@cappa/logger";
import type { Command } from "commander";

type BrowserDownOptions = { cli?: string; images?: boolean };
type BrowserBuildOptions = { cli?: string };

/**
 * The container CLI to use: `--cli`, else the config's
 * `playwright({ container: { cli } })`, else `CAPPA_CONTAINER_CLI`, else
 * docker. A config that fails to load must not block cleanup.
 */
const resolveCli = async (cli: string | undefined): Promise<string> => {
  if (cli) return cli;
  let container: Parameters<typeof resolveContainerOptions>[0];
  try {
    container = (await getConfig()).browser?.provider?.options?.container;
  } catch (error) {
    getLogger().debug("Could not load the config:", error);
  }
  const configured =
    container && container !== true && typeof container.cli === "string"
      ? { cli: container.cli }
      : true;
  return resolveContainerOptions(configured)?.cli ?? "docker";
};

/**
 * `cappa browser down` — remove every Playwright container cappa started and,
 * with `--images`, every image it built.
 */
export const browserDown = async (options: BrowserDownOptions = {}) => {
  const logger = getLogger();
  const cli = await resolveCli(options.cli);
  const removed = await removePlaywrightContainers({ cli });

  if (removed.length === 0) {
    logger.info("No Playwright containers to remove.");
  }
  for (const name of removed) {
    logger.success(`Removed ${name}`);
  }

  if (!options.images) return;
  const images = await removePlaywrightImages({ cli });
  if (images.length === 0) {
    logger.info("No built Playwright images to remove.");
  }
  for (const id of images) {
    logger.success(`Removed image ${id}`);
  }
};

/**
 * `cappa browser build` — rebuild the configured `container.build` image
 * (the layer cache still applies), for changes cappa cannot see such as files
 * the Dockerfile `COPY`s, then remove the containers still running the old
 * build so the next capture starts a fresh one.
 */
export const browserBuild = async (options: BrowserBuildOptions = {}) => {
  const logger = getLogger();
  const config = await getConfig();
  const container = resolveContainerOptions(
    config.browser?.provider?.options?.container,
  );
  if (!container?.build) {
    throw new Error(
      "cappa browser build needs playwright({ container: { build } }) in cappa.config.ts — there is no Dockerfile to build.",
    );
  }
  const version = installedPlaywrightVersion();
  if (!version) {
    throw new Error(
      "cappa browser build needs the installed playwright-core, but its package.json could not be read.",
    );
  }

  const cli = options.cli ?? container.cli;
  const { tag } = await buildPlaywrightImage({
    cli,
    version,
    build: container.build,
    force: true,
    log: (message) => logger.info(message),
  });
  logger.success(`Built ${tag}`);

  const removed = await removePlaywrightContainers({ cli, image: tag });
  for (const name of removed) {
    logger.success(`Removed ${name}; the next capture starts a fresh one`);
  }
};

export const registerBrowserCommand = (program: Command) => {
  const browser = program
    .command("browser")
    .description(
      "Manage the Playwright container (browser.provider container)",
    );

  browser
    .command("build")
    .description(
      "Rebuild the playwright({ container: { build } }) image and replace its containers",
    )
    .option("--cli <cli>", "container CLI to use (docker, podman, nerdctl)")
    .action(browserBuild);

  browser
    .command("down")
    .description("Remove every Playwright container cappa started")
    .option("--cli <cli>", "container CLI to use (docker, podman, nerdctl)")
    .option("--images", "also remove the images cappa built")
    .action(browserDown);
};
