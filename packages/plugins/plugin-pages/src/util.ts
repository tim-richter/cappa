import type { Page } from "playwright-core";
import type { WaitStrategy } from "./types";

/**
 * Default wait strategy applied when no overrides are set.
 */
export const defaultWaitStrategy: Required<WaitStrategy> = {
  waitForSelector: "",
  waitForTimeout: 0,
  waitForNetworkIdle: true,
  waitForStable: true,
};

/**
 * Merge a page-level wait strategy with plugin-level defaults.
 */
export function resolveWaitStrategy(
  pluginDefaults?: WaitStrategy,
  pageOverrides?: WaitStrategy,
): Required<WaitStrategy> {
  return {
    ...defaultWaitStrategy,
    ...pluginDefaults,
    ...pageOverrides,
  };
}

/**
 * Inject styles that freeze animations, transitions, carets, and scrollbars
 * to produce deterministic screenshots.
 */
export async function freezeUI(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        -moz-animation: none !important;
        -moz-transition: none !important;
        transition: none !important;
        animation: none !important;
      }
      *, input, textarea { caret-color: transparent !important }
      *:focus { outline: none !important }
      *:focus-visible { outline: none !important }
      *:focus-within { outline: none !important }
      * { text-rendering: optimizeLegibility !important }
      ::-webkit-scrollbar { display: none !important }
      html { scroll-behavior: auto !important }
      svg, svg * {
        shape-rendering: crispEdges !important;
        text-rendering: geometricPrecision !important;
        vector-effect: non-scaling-stroke !important;
      }
      img { image-rendering: crisp-edges !important }
    `,
  });
}

/**
 * Wait for general visual stability: fonts, images, and DOM idle.
 */
export async function waitForVisualIdle(page: Page): Promise<void> {
  await page.waitForLoadState("load");

  // Wait for fonts and images
  await page.evaluate(async () => {
    await (document as any).fonts?.ready?.catch(() => {});
    const imgs = Array.from(document.images).filter((i) => !i.complete);
    await Promise.all(
      imgs.map(
        (i) =>
          new Promise((res) => {
            i.onload = i.onerror = () => res(null);
          }),
      ),
    );
  });

  // Wait for 2 animation frames + idle period with no DOM mutations
  await page.evaluate(
    ({ minIdleMs }) =>
      new Promise<void>((resolve) => {
        let timer: number | null = null;
        let last = performance.now();

        const done = () => {
          if (timer) cancelAnimationFrame(timer);
          resolve();
        };

        const mo = new MutationObserver(() => {
          last = performance.now();
        });
        mo.observe(document, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
        });

        const tick = () => {
          if (performance.now() - last >= minIdleMs) {
            mo.disconnect();
            done();
          } else {
            timer = requestAnimationFrame(tick);
          }
        };

        requestAnimationFrame(() => requestAnimationFrame(tick));
      }),
    { minIdleMs: 100 },
  );
}

/**
 * Apply the resolved wait strategy to a page after navigation.
 */
export async function applyWaitStrategy(
  page: Page,
  strategy: Required<WaitStrategy>,
): Promise<void> {
  if (strategy.waitForNetworkIdle) {
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
      // Network idle timeout is non-fatal — proceed with capture
    });
  }

  if (strategy.waitForSelector) {
    await page.waitForSelector(strategy.waitForSelector, { timeout: 15000 });
  }

  if (strategy.waitForStable) {
    await waitForVisualIdle(page);
  }

  if (strategy.waitForTimeout && strategy.waitForTimeout > 0) {
    await page.waitForTimeout(strategy.waitForTimeout);
  }
}

/**
 * Derive a filesystem-safe filename from a URL.
 *
 * Examples:
 * - `https://example.com` → `example-com.png`
 * - `https://example.com/pricing` → `example-com/pricing.png`
 * - `https://example.com/docs/getting-started` → `example-com/docs/getting-started.png`
 */
export function deriveFilenameFromUrl(url: string): string {
  const parsed = new URL(url);

  const hostPart = parsed.hostname.replace(/\./g, "-");

  // Remove leading/trailing slashes and split
  const pathParts = parsed.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  if (pathParts.length === 0) {
    return `${hostPart}.png`;
  }

  const sanitized = pathParts.map((part) =>
    part.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-"),
  );

  return `${hostPart}/${sanitized.join("/")}.png`;
}

/**
 * Sanitize a user-provided name into a valid filename.
 */
export function sanitizeName(name: string): string {
  const parts = name.split("/").filter(Boolean);

  const sanitized = parts.map((part) =>
    part
      .replace(/\.png$/i, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""),
  );

  return `${sanitized.join("/")}.png`;
}
