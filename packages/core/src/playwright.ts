import { existsSync, statSync } from "node:fs";
import path from "node:path";
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
   * for the same version — or let cappa build it with `build`. Not allowed
   * together with `build`.
   * @default "mcr.microsoft.com/playwright:v{version}-noble"
   */
  image?: string;
  /**
   * Build the image from a Dockerfile instead of pulling one. A string is the
   * Dockerfile path. Paths resolve against the cwd; `context` defaults to the
   * Dockerfile's directory.
   *
   * Cappa passes the installed `playwright-core` version as the
   * `PLAYWRIGHT_VERSION` build arg (so it is reserved in `args`), tags the
   * result `cappa-browser:v<version>-<hash>` and rebuilds only when the
   * version, the Dockerfile's contents, `context`, `target` or `args` change.
   * `cappa browser build` forces a rebuild, for edits cappa cannot see (files
   * the Dockerfile `COPY`s).
   *
   * The image must provide `node` on `PATH`, a `pwuser` user, and browsers for
   * `PLAYWRIGHT_VERSION` that `pwuser` can find (e.g. via
   * `PLAYWRIGHT_BROWSERS_PATH`). Not allowed together with `image`.
   */
  build?: string | ContainerBuildOptions;
  /** Extra arguments for `<cli> run`, placed before the image. */
  runArgs?: string[];
  /**
   * Leave the container running after cappa exits, so the next run connects
   * instantly. `cappa browser down` removes it.
   * @default true
   */
  keepAlive?: boolean;
  /**
   * How long to wait for the server to come up, in ms. Counted from once the
   * image exists, so a first pull or build does not use it up.
   * @default 300_000
   */
  readyTimeout?: number;
};

/** `ContainerOptions.build` as an object. */
export type ContainerBuildOptions = {
  /** Path to the Dockerfile. */
  dockerfile: string;
  /** Build context. @default the Dockerfile's directory */
  context?: string;
  /** Stage to build, for a multi-stage Dockerfile. */
  target?: string;
  /** Extra build args. `PLAYWRIGHT_VERSION` is reserved — cappa sets it. */
  args?: Record<string, string>;
};

/** `ContainerBuildOptions` with absolute paths and defaults filled in. */
export type ResolvedContainerBuild = {
  dockerfile: string;
  context: string;
  target: string | null;
  args: Record<string, string>;
};

/** `ContainerOptions` with every default filled in. */
export type ResolvedContainerOptions = Required<
  Omit<ContainerOptions, "build">
> & {
  /** `null` unless the image is built from a Dockerfile. */
  build: ResolvedContainerBuild | null;
};

/** Build arg cappa sets to the installed `playwright-core` version. */
export const PLAYWRIGHT_VERSION_BUILD_ARG = "PLAYWRIGHT_VERSION";

export const DEFAULT_CONTAINER_IMAGE =
  "mcr.microsoft.com/playwright:v{version}-noble";

/**
 * Validate `container` and fill in its defaults, or `null` when it is off.
 * `build` paths resolve against `cwd`.
 */
export function resolveContainerOptions(
  container: PlaywrightProviderOptions["container"],
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
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
  if (options.build !== undefined && options.image !== undefined) {
    throw invalid(
      "cannot set both image and build — build the image from a Dockerfile, or run a ready-made one",
    );
  }
  const build =
    options.build === undefined
      ? null
      : resolveContainerBuild(options.build, cwd, invalid);
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

  return { cli: cli.trim(), image, build, runArgs, keepAlive, readyTimeout };
}

function resolveContainerBuild(
  build: unknown,
  cwd: string,
  invalid: (detail: string) => Error,
): ResolvedContainerBuild {
  const options = (
    typeof build === "string" ? { dockerfile: build } : build
  ) as Partial<ContainerBuildOptions> | null;
  if (typeof options !== "object" || !options) {
    throw invalid("build must be a Dockerfile path or an object");
  }

  const { dockerfile, context, args = {} } = options;
  // `null` is the resolved form of "unset", so resolving stays idempotent.
  const target = options.target ?? undefined;
  if (typeof dockerfile !== "string" || dockerfile.trim() === "") {
    throw invalid("build.dockerfile must be a non-empty string");
  }
  if (
    context !== undefined &&
    (typeof context !== "string" || context.trim() === "")
  ) {
    throw invalid("build.context must be a non-empty string");
  }
  if (
    target !== undefined &&
    (typeof target !== "string" || target.trim() === "")
  ) {
    throw invalid("build.target must be a non-empty string");
  }
  if (
    typeof args !== "object" ||
    !args ||
    Array.isArray(args) ||
    Object.values(args).some((value) => typeof value !== "string")
  ) {
    throw invalid("build.args must be an object of strings");
  }
  if (Object.hasOwn(args, PLAYWRIGHT_VERSION_BUILD_ARG)) {
    throw invalid(
      `build.args.${PLAYWRIGHT_VERSION_BUILD_ARG} is reserved — cappa sets it to the installed playwright-core version`,
    );
  }

  const dockerfilePath = path.resolve(cwd, dockerfile);
  if (!existsSync(dockerfilePath) || !statSync(dockerfilePath).isFile()) {
    throw invalid(`build.dockerfile ${dockerfilePath} does not exist`);
  }

  return {
    dockerfile: dockerfilePath,
    context:
      context === undefined
        ? path.dirname(dockerfilePath)
        : path.resolve(cwd, context),
    target: target ?? null,
    args: { ...args },
  };
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
