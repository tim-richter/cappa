import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";
import { ensurePlaywrightContainer } from "./container";
import { DEFAULT_CONTAINER_IMAGE } from "./playwright";

/**
 * Real container, real image pull (~1.5 GB on first run). Opt in with
 * `CAPPA_CONTAINER_IT=1`; `CAPPA_CONTAINER_CLI` picks docker/podman/nerdctl.
 */
const enabled = process.env.CAPPA_CONTAINER_IT === "1";

const require = createRequire(import.meta.url);
const version = (require("playwright-core/package.json") as { version: string })
  .version;
const packageDir = realpathSync(
  path.dirname(require.resolve("playwright-core/package.json")),
);

describe.skipIf(!enabled)("ensurePlaywrightContainer (real CLI)", () => {
  it("starts, reuses, serves a matching browser and stops", async () => {
    const options = {
      version,
      packageDir,
      cli: process.env.CAPPA_CONTAINER_CLI ?? "docker",
      image: DEFAULT_CONTAINER_IMAGE,
      runArgs: [],
      readyTimeout: 600_000,
    };

    const container = await ensurePlaywrightContainer(options);
    try {
      const again = await ensurePlaywrightContainer(options);
      expect(again.reused).toBe(true);
      expect(again.wsEndpoint).toBe(container.wsEndpoint);

      const browser = await chromium.connect(container.wsEndpoint);
      try {
        const page = await browser.newPage();
        await page.setContent("<h1>hello from the container</h1>");
        expect(await page.textContent("h1")).toBe("hello from the container");
        expect((await page.screenshot()).byteLength).toBeGreaterThan(0);
      } finally {
        await browser.close();
      }
    } finally {
      await container.stop();
    }
  }, 900_000);
});
