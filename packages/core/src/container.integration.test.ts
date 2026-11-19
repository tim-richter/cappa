import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";
import {
  ensurePlaywrightContainer,
  removePlaywrightContainers,
} from "./container";
import { DEFAULT_CONTAINER_IMAGE, resolveContainerOptions } from "./playwright";

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

/** The bookworm recipe from the docs: Debian, `--only-shell`, a `pwuser`. */
const BOOKWORM_DOCKERFILE = `FROM node:24-bookworm-slim
ARG PLAYWRIGHT_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx -y playwright-core@\${PLAYWRIGHT_VERSION} install chromium --with-deps --only-shell \\
 && chmod -R a+rX /ms-playwright \\
 && useradd --create-home pwuser
`;

describe.skipIf(!enabled)("ensurePlaywrightContainer build (real CLI)", () => {
  it("builds the image once, then reuses it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cappa-build-it-"));
    writeFileSync(path.join(dir, "Dockerfile"), BOOKWORM_DOCKERFILE);
    const cli = process.env.CAPPA_CONTAINER_CLI ?? "docker";
    const resolved = resolveContainerOptions(
      { cli, build: "Dockerfile", readyTimeout: 600_000 },
      {},
      dir,
    );
    if (!resolved) throw new Error("unreachable");
    const messages: string[] = [];
    const options = {
      ...resolved,
      version,
      packageDir,
      log: (message: string) => messages.push(message),
    };

    const container = await ensurePlaywrightContainer(options);
    try {
      expect(container.image).toMatch(/^cappa-browser:v/);
      expect(messages.some((m) => m.startsWith("Building"))).toBe(true);

      const browser = await chromium.connect(container.wsEndpoint);
      try {
        const page = await browser.newPage();
        await page.setContent("<h1>built</h1>");
        expect(await page.textContent("h1")).toBe("built");
      } finally {
        await browser.close();
      }

      // A fresh container from the existing image: no second build.
      await container.stop();
      messages.length = 0;
      const again = await ensurePlaywrightContainer(options);
      expect(again.image).toBe(container.image);
      expect(messages.some((m) => m.startsWith("Building"))).toBe(false);
    } finally {
      await removePlaywrightContainers({ cli, image: container.image });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 1_800_000);
});
