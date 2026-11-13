import type {
  BrowserContextOptions,
  ConnectOptions,
  LaunchOptions,
} from "playwright-core";

/**
 * Options for the `playwright()` browser provider.
 *
 * Same names and semantics as `@vitest/browser-playwright`, so a
 * `connectOptions` block can be copied between a Vitest browser-mode config
 * and `cappa.config.ts`.
 */
export type PlaywrightProviderOptions = {
  /** Passed to `browserType.launch()`. `headless` is ignored — use `browser.headless`. */
  launchOptions?: Omit<LaunchOptions, "headless">;
  /**
   * Passed to `browserType.connect()`. Only used when `wsEndpoint` is set;
   * otherwise cappa launches locally. `launchOptions` and `headless` are
   * forwarded via the `x-playwright-launch-options` header (honoured by
   * `playwright run-server`).
   */
  connectOptions?: ConnectOptions & { wsEndpoint?: string };
  /**
   * Passed to `browser.newContext()`, merged over cappa's defaults
   * (`reducedMotion: "reduce"`, `deviceScaleFactor: 2`). `viewport` is
   * omitted — use `screenshot.viewport`. A custom `userAgent` keeps cappa's
   * `CappaStorybook` suffix, which `isCappa()` depends on.
   */
  contextOptions?: Omit<BrowserContextOptions, "viewport">;
  /** `context.setDefaultTimeout()` for plugin actions. Default: none. */
  actionTimeout?: number;
};

export type BrowserProvider = {
  name: "playwright";
  options: PlaywrightProviderOptions;
};

export type BrowserName = "chromium" | "firefox" | "webkit";

export type BrowserInstance = { browser: BrowserName };

/** `UserConfig.browser`. */
export type BrowserConfig = {
  /** @default playwright() */
  provider?: BrowserProvider;
  /** @default true */
  headless?: boolean;
  /** Exactly one entry for now. @default [{ browser: "chromium" }] */
  instances?: [BrowserInstance];
};

/** `BrowserConfig` with every default filled in. */
export type ResolvedBrowserConfig = {
  provider: BrowserProvider;
  headless: boolean;
  instances: [BrowserInstance];
};

/**
 * The Playwright browser provider.
 *
 * @example
 * browser: {
 *   provider: playwright({
 *     connectOptions: { wsEndpoint: process.env.CAPPA_BROWSER_WS },
 *   }),
 * }
 */
export const playwright = (
  options: PlaywrightProviderOptions = {},
): BrowserProvider => ({ name: "playwright", options });

const BROWSER_NAMES: readonly BrowserName[] = ["chromium", "firefox", "webkit"];

/**
 * Fill in `browser` defaults and reject what cappa cannot do yet.
 *
 * Idempotent, so it is safe to run on an already-resolved config.
 */
export function resolveBrowserConfig(
  config: BrowserConfig | undefined = {},
): ResolvedBrowserConfig {
  const provider = config.provider ?? playwright();
  if (provider.name !== "playwright") {
    throw new Error(
      `Invalid browser config: unknown provider "${String(provider.name)}". Use playwright() from "@cappa/core/playwright".`,
    );
  }

  const instances = (config.instances ?? [{ browser: "chromium" }]) as
    | BrowserInstance[]
    | undefined;
  if (!Array.isArray(instances) || instances.length !== 1) {
    throw new Error(
      `Invalid browser config: browser.instances must have exactly one entry (got ${
        Array.isArray(instances) ? instances.length : typeof instances
      }). Capturing with several browsers in one run is not supported yet.`,
    );
  }

  const [instance] = instances as [BrowserInstance];
  if (!BROWSER_NAMES.includes(instance.browser)) {
    throw new Error(
      `Invalid browser config: unsupported browser "${String(instance.browser)}". Use one of ${BROWSER_NAMES.join(", ")}.`,
    );
  }

  return {
    provider: { name: "playwright", options: provider.options ?? {} },
    headless: config.headless ?? true,
    instances: [{ browser: instance.browser }],
  };
}
