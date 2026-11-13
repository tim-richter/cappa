import { getConfig } from "@cappa/config";
import {
  removePlaywrightContainers,
  resolveContainerOptions,
} from "@cappa/core";
import { getLogger } from "@cappa/logger";
import type { Command } from "commander";

type BrowserDownOptions = { cli?: string };

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
  return (
    resolveContainerOptions(container && container !== true ? container : true)
      ?.cli ?? "docker"
  );
};

/** `cappa browser down` — remove every Playwright container cappa started. */
export const browserDown = async (options: BrowserDownOptions = {}) => {
  const logger = getLogger();
  const cli = await resolveCli(options.cli);
  const removed = await removePlaywrightContainers({ cli });

  if (removed.length === 0) {
    logger.info("No Playwright containers to remove.");
    return;
  }
  for (const name of removed) {
    logger.success(`Removed ${name}`);
  }
};

export const registerBrowserCommand = (program: Command) => {
  const browser = program
    .command("browser")
    .description(
      "Manage the Playwright container (browser.provider container)",
    );

  browser
    .command("down")
    .description("Remove every Playwright container cappa started")
    .option("--cli <cli>", "container CLI to use (docker, podman, nerdctl)")
    .action(browserDown);
};
