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
  /**
   * Run the browser in the official Playwright container image matching the
   * installed `playwright-core` version, started (or reused) by cappa through
   * a container CLI. `true` uses every default. Ignored while
   * `connectOptions.wsEndpoint` is set, so an env var can still point
   * elsewhere. Defaults `connectOptions.exposeNetwork` to `"<loopback>"`.
   */
  container?: boolean | ContainerOptions;
};

/** `PlaywrightProviderOptions.container` as an object. */
export type ContainerOptions = {
  /**
   * Container CLI: anything with docker's `run`/`inspect`/`port`/`pull`/
   * `logs`/`rm` subcommands — `docker`, `podman`, `nerdctl`.
   * @default process.env.CAPPA_CONTAINER_CLI ?? "docker"
   */
  cli?: string;
  /**
   * Image to run; `{version}` is replaced with the `playwright-core` version.
   * A custom image (extra fonts, say) should be built `FROM` the official one
   * for the same version.
   * @default "mcr.microsoft.com/playwright:v{version}-noble"
   */
  image?: string;
  /** Extra arguments for `<cli> run`, placed before the image. */
  runArgs?: string[];
  /**
   * Leave the container running after cappa exits, so the next run connects
   * instantly. `cappa browser down` removes it.
   * @default true
   */
  keepAlive?: boolean;
  /**
   * How long to wait for the server, in ms — the first start pulls the image.
   * @default 300_000
   */
  readyTimeout?: number;
};

/** `ContainerOptions` with every default filled in. */
export type ResolvedContainerOptions = Required<ContainerOptions>;

export const DEFAULT_CONTAINER_IMAGE =
  "mcr.microsoft.com/playwright:v{version}-noble";

/**
 * Validate `container` and fill in its defaults, or `null` when it is off.
 */
export function resolveContainerOptions(
  container: PlaywrightProviderOptions["container"],
  env: Record<string, string | undefined> = process.env,
): ResolvedContainerOptions | null {
  if (container === undefined || container === false) return null;
  const invalid = (detail: string) =>
    new Error(`Invalid browser config: playwright({ container }) ${detail}.`);

  if (container !== true && (typeof container !== "object" || !container)) {
    throw invalid("must be a boolean or an object");
  }
  const options = container === true ? {} : container;

  const cli = options.cli ?? env.CAPPA_CONTAINER_CLI ?? "docker";
  if (typeof cli !== "string" || cli.trim() === "") {
    throw invalid("cli must be a non-empty string");
  }
  const image = options.image ?? DEFAULT_CONTAINER_IMAGE;
  if (typeof image !== "string" || image.trim() === "") {
    throw invalid("image must be a non-empty string");
  }
  const runArgs = options.runArgs ?? [];
  if (!Array.isArray(runArgs) || runArgs.some((a) => typeof a !== "string")) {
    throw invalid("runArgs must be an array of strings");
  }
  const keepAlive = options.keepAlive ?? true;
  if (typeof keepAlive !== "boolean") {
    throw invalid("keepAlive must be a boolean");
  }
  const readyTimeout = options.readyTimeout ?? 300_000;
  if (
    typeof readyTimeout !== "number" ||
    !Number.isFinite(readyTimeout) ||
    readyTimeout <= 0
  ) {
    throw invalid("readyTimeout must be a positive number");
  }

  return { cli: cli.trim(), image, runArgs, keepAlive, readyTimeout };
}

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

  resolveContainerOptions(provider.options?.container, {});

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
