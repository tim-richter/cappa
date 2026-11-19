import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile as fsReadFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  PLAYWRIGHT_VERSION_BUILD_ARG,
  type ResolvedContainerBuild,
  type ResolvedContainerOptions,
} from "./playwright";

/**
 * Runs a Playwright image for an exact `playwright-core` version — the
 * official one, a custom one, or one built from the project's Dockerfile —
 * through a container CLI (docker, podman, nerdctl, …) and hands back the
 * `run-server` endpoint.
 *
 * Only subcommands all of those CLIs share are used: `version`, `image
 * inspect`, `pull`, `build`, `images`, `rmi`, `inspect`, `run`, `port`,
 * `logs`, `ps` and `rm`.
 */

/**
 * Label on every container cappa starts and every image it builds;
 * `removePlaywrightContainers` / `removePlaywrightImages` find them by it.
 */
export const CONTAINER_LABEL = "dev.cappa.playwright";

/** Label carrying the image a container runs, so a rebuild can find its containers. */
export const CONTAINER_IMAGE_LABEL = `${CONTAINER_LABEL}.image`;

/** Repository of images cappa builds from `container.build`. */
export const BUILT_IMAGE_REPOSITORY = "cappa-browser";

/** Port `run-server` listens on inside the container. */
const SERVER_PORT = 3000;

/** Where the host's `playwright-core` is mounted inside the container. */
const PACKAGE_MOUNT = "/opt/playwright-core";

export type ExecResult = { stdout: string; stderr: string };
export type Exec = (file: string, args: string[]) => Promise<ExecResult>;

export type PlaywrightContainer = {
  /** `ws://127.0.0.1:<port>/` — pass to `browserType.connect()`. */
  wsEndpoint: string;
  /** Container name, `cappa-playwright-v<version>-<hash>`. */
  name: string;
  /** The image with `{version}` filled in. */
  image: string;
  /** `true` when an already running container was picked up. */
  reused: boolean;
  /** Remove the container. */
  stop(): Promise<void>;
};

export type EnsureContainerOptions = Omit<
  ResolvedContainerOptions,
  "keepAlive" | "build"
> & {
  /** Build the image from a Dockerfile instead of using `image`. */
  build?: ResolvedContainerBuild | null;
  /** Exact `playwright-core` version, e.g. `1.63.0`. */
  version: string;
  /**
   * The host's `playwright-core` directory (symlinks resolved). Mounted
   * read-only and run as the server, so the container needs no npm access and
   * runs exactly the client's version — the image only supplies OS and
   * browsers.
   */
  packageDir: string;
  log?: (message: string) => void;
  /** Injection points for tests. */
  exec?: Exec;
  readFile?: (file: string) => Promise<string>;
  probe?: (url: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const defaultExec: Exec = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      // Build output can be long; it is only captured, for error messages.
      { maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
        } else {
          resolve({ stdout: String(stdout), stderr: String(stderr) });
        }
      },
    );
  });

/** `true` once `run-server` answers plain HTTP with `Running`. */
const defaultProbe = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok && (await response.text()).includes("Running");
  } catch {
    return false;
  }
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const errorText = (error: unknown): string => {
  const stderr = (error as { stderr?: unknown })?.stderr;
  if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
  return error instanceof Error ? error.message : String(error);
};

const isNotFound = (error: unknown) =>
  (error as NodeJS.ErrnoException)?.code === "ENOENT";

const defaultReadFile = (file: string) => fsReadFile(file, "utf8");

/** The last `lines` lines of `text`. */
const tail = (text: string, lines = 30) =>
  text.split("\n").slice(-lines).join("\n");

/** `exec` bound to `cli`, with a missing CLI turned into advice. */
const cliRunner =
  (cli: string, exec: Exec) =>
  async (args: string[]): Promise<ExecResult> => {
    try {
      return await exec(cli, args);
    } catch (error) {
      if (isNotFound(error)) {
        throw new Error(
          `Container CLI "${cli}" not found. Install it, or set playwright({ container: { cli } }) / CAPPA_CONTAINER_CLI to the one you use (docker, podman, nerdctl).`,
          { cause: error },
        );
      }
      throw error;
    }
  };

/** The installed `playwright-core` version, or `null` if it cannot be read. */
export const installedPlaywrightVersion = (): string | null => {
  try {
    const require = createRequire(import.meta.url);
    return (require("playwright-core/package.json") as { version: string })
      .version;
  } catch {
    return null;
  }
};

/** The installed `playwright-core` directory, symlinks resolved, or `null`. */
export const installedPlaywrightPackageDir = (): string | null => {
  try {
    const require = createRequire(import.meta.url);
    return realpathSync(
      path.dirname(require.resolve("playwright-core/package.json")),
    );
  } catch {
    return null;
  }
};

const safeVersion = (version: string) => version.replace(/[^\w.-]/g, "_");

/**
 * `cappa-browser:v<version>-<hash>` for an image built from `build`. The hash
 * covers everything cappa can see change — the Dockerfile's contents, the
 * context path, target, args and version — so editing any of them builds a
 * new image instead of silently reusing a stale one. Files the Dockerfile
 * `COPY`s are not covered; `cappa browser build` rebuilds for those.
 */
export const buildImageTag = (
  version: string,
  build: ResolvedContainerBuild,
  dockerfileContents: string,
) => {
  const args = Object.entries(build.args).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        version,
        dockerfileContents,
        build.context,
        build.target,
        args,
      ]),
    )
    .digest("hex")
    .slice(0, 8);
  return `${BUILT_IMAGE_REPOSITORY}:v${safeVersion(version)}-${hash}`;
};

/** `<cli> build` arguments for `build`, tagged `tag`. */
export const buildCommandArgs = (
  version: string,
  build: ResolvedContainerBuild,
  tag: string,
) => [
  "build",
  "-f",
  build.dockerfile,
  "-t",
  tag,
  "--build-arg",
  `${PLAYWRIGHT_VERSION_BUILD_ARG}=${version}`,
  ...Object.entries(build.args).flatMap(([key, value]) => [
    "--build-arg",
    `${key}=${value}`,
  ]),
  ...(build.target ? ["--target", build.target] : []),
  "--label",
  `${CONTAINER_LABEL}=${version}`,
  build.context,
];

export type BuildImageOptions = {
  cli: string;
  version: string;
  build: ResolvedContainerBuild;
  /** Build even when the tag already exists (layer cache still applies). */
  force?: boolean;
  log?: (message: string) => void;
  exec?: Exec;
  readFile?: (file: string) => Promise<string>;
};

/**
 * Make sure the image for `build` exists — reusing it when the tag is
 * present, building it otherwise — and return its tag.
 */
export async function buildPlaywrightImage(
  options: BuildImageOptions,
): Promise<{ tag: string; built: boolean }> {
  const {
    cli,
    version,
    build,
    force = false,
    log = () => {},
    exec = defaultExec,
    readFile = defaultReadFile,
  } = options;
  const run = cliRunner(cli, exec);

  const tag = buildImageTag(
    version,
    build,
    await readDockerfile(build, readFile),
  );

  if (!force) {
    const present = await run(["image", "inspect", tag]).then(
      () => true,
      (error) => {
        if (error instanceof Error && error.message.startsWith("Container CLI"))
          throw error;
        return false;
      },
    );
    if (present) return { tag, built: false };
  }

  log(
    force
      ? `Building ${tag} from ${build.dockerfile}`
      : `Building ${tag} from ${build.dockerfile} (first run only; this can take a few minutes)`,
  );
  try {
    await run(buildCommandArgs(version, build, tag));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Container CLI"))
      throw error;
    throw new Error(
      `Could not build ${tag} from ${build.dockerfile}.\n\n${tail(errorText(error))}`,
      { cause: error },
    );
  }
  return { tag, built: true };
}

/** `{version}` filled in. */
export const containerImage = (image: string, version: string) =>
  image.replaceAll("{version}", version);

/**
 * Deterministic per version, image and run arguments: changing any of them
 * starts a fresh container instead of reusing one with stale settings.
 */
export const containerName = (
  version: string,
  image: string,
  runArgs: string[],
  packageDir = "",
) => {
  const hash = createHash("sha256")
    .update(JSON.stringify([image, runArgs, packageDir]))
    .digest("hex")
    .slice(0, 8);
  return `cappa-playwright-v${safeVersion(version)}-${hash}`;
};

/** Host port from `<cli> port` output (`127.0.0.1:49153`, maybe several lines). */
export const parsePort = (output: string): number | null => {
  for (const line of output.split("\n")) {
    const match = line.trim().match(/:(\d+)$/);
    if (match) return Number(match[1]);
  }
  return null;
};

/**
 * Start — or reuse — the Playwright server container for `version` and wait
 * until it accepts connections.
 */
export async function ensurePlaywrightContainer(
  options: EnsureContainerOptions,
): Promise<PlaywrightContainer> {
  const {
    version,
    packageDir,
    cli,
    runArgs,
    readyTimeout,
    build = null,
    log = () => {},
    exec = defaultExec,
    readFile = defaultReadFile,
    probe = defaultProbe,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const run = cliRunner(cli, exec);

  try {
    await run(["version"]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Container CLI"))
      throw error;
    const hint =
      cli === "podman"
        ? " Is the podman machine running (`podman machine start`)?"
        : " Is the daemon running?";
    throw new Error(`"${cli} version" failed.${hint}\n\n${errorText(error)}`, {
      cause: error,
    });
  }

  // A built image's tag hashes the Dockerfile, so it is known before any
  // build — and a Dockerfile edit means a new tag, so a new container.
  let image = build
    ? buildImageTag(version, build, await readDockerfile(build, readFile))
    : containerImage(options.image, version);
  const name = containerName(version, image, runArgs, packageDir);

  const state = async (): Promise<"running" | "stopped" | "absent"> => {
    try {
      const { stdout } = await run([
        "inspect",
        "--format",
        "{{.State.Running}}",
        name,
      ]);
      return stdout.trim() === "true" ? "running" : "stopped";
    } catch {
      return "absent";
    }
  };

  const remove = async () => {
    await run(["rm", "-f", name]).catch(() => {});
  };

  const stop = async () => {
    await remove();
  };

  let reused = false;
  const current = await state();
  if (current === "running") {
    reused = true;
    log(`Reusing Playwright container ${name}`);
  } else {
    if (current === "stopped") await remove();

    if (build) {
      ({ tag: image } = await buildPlaywrightImage({
        cli,
        version,
        build,
        log,
        exec,
        readFile,
      }));
    } else if (
      !(await run(["image", "inspect", image]).then(
        () => true,
        () => false,
      ))
    ) {
      log(`Pulling ${image} (first run only; this can take a few minutes)`);
      try {
        await run(["pull", image]);
      } catch (error) {
        throw new Error(
          `Could not pull ${image}. Official images exist for every released Playwright version — check that playwright-core ${version} is a release (not a prerelease) and that the registry is reachable.\n\n${errorText(error)}`,
          { cause: error },
        );
      }
    }

    log(`Starting Playwright ${version} container ${name}`);
    try {
      await run([
        "run",
        "-d",
        "--init",
        "--ipc=host",
        "--user",
        "pwuser",
        "--workdir",
        "/home/pwuser",
        "-p",
        `127.0.0.1::${SERVER_PORT}`,
        "--mount",
        `type=bind,source=${packageDir},target=${PACKAGE_MOUNT},readonly`,
        "--label",
        `${CONTAINER_LABEL}=${version}`,
        "--label",
        `${CONTAINER_IMAGE_LABEL}=${image}`,
        "--name",
        name,
        ...runArgs,
        image,
        "node",
        `${PACKAGE_MOUNT}/cli.js`,
        "run-server",
        "--port",
        String(SERVER_PORT),
        "--host",
        "0.0.0.0",
      ]);
    } catch (error) {
      // Another cappa process won the race to create it — use theirs.
      if (/already in use|conflict|already exists/i.test(errorText(error))) {
        reused = true;
      } else {
        throw new Error(`Could not start ${image}.\n\n${errorText(error)}`, {
          cause: error,
        });
      }
    }
  }

  const containerLogs = async () => {
    const result = await run(["logs", "--tail", "30", name]).catch(() => null);
    return result ? `${result.stdout}${result.stderr}`.trim() : "";
  };

  // Counted from here: pulling or building the image must not use it up.
  const deadline = now() + readyTimeout;
  let port: number | null = null;
  let attempt = 0;
  while (true) {
    if (port === null) {
      const output = await run(["port", name, `${SERVER_PORT}/tcp`]).then(
        (r) => r.stdout,
        () => "",
      );
      port = parsePort(output);
    }

    if (port !== null && (await probe(`http://127.0.0.1:${port}/`))) {
      return {
        wsEndpoint: `ws://127.0.0.1:${port}/`,
        name,
        image,
        reused,
        stop,
      };
    }

    attempt++;
    // Every few polls, make sure it did not die (npx failing, say).
    if (attempt % 8 === 0 && (await state()) !== "running") {
      const logs = await containerLogs();
      await remove();
      throw new Error(
        `The Playwright container ${name} exited before its server came up.${logs ? `\n\n${logs}` : ""}`,
      );
    }

    if (now() >= deadline) {
      const logs = await containerLogs();
      throw new Error(
        `Timed out after ${readyTimeout}ms waiting for the Playwright server in container ${name}. Raise playwright({ container: { readyTimeout } }) if the image is still downloading.${logs ? `\n\n${logs}` : ""}`,
      );
    }

    await sleep(250);
  }
}

const readDockerfile = async (
  build: ResolvedContainerBuild,
  readFile: (file: string) => Promise<string>,
) => {
  try {
    return await readFile(build.dockerfile);
  } catch (error) {
    throw new Error(
      `Could not read the Dockerfile ${build.dockerfile} (playwright({ container: { build } })).`,
      { cause: error },
    );
  }
};

/**
 * Remove every container cappa started, whatever its version — or, with
 * `image`, only those running that image. Returns their names.
 */
export async function removePlaywrightContainers(options: {
  cli: string;
  image?: string;
  exec?: Exec;
}): Promise<string[]> {
  const { cli, image, exec = defaultExec } = options;
  let stdout: string;
  try {
    ({ stdout } = await exec(cli, [
      "ps",
      "-a",
      "--filter",
      image
        ? `label=${CONTAINER_IMAGE_LABEL}=${image}`
        : `label=${CONTAINER_LABEL}`,
      "--format",
      "{{.Names}}",
    ]));
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(`Container CLI "${cli}" not found.`, { cause: error });
    }
    throw new Error(`"${cli} ps" failed.\n\n${errorText(error)}`, {
      cause: error,
    });
  }

  const names = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (names.length > 0) {
    await exec(cli, ["rm", "-f", ...names]);
  }
  return names;
}

/**
 * Remove every image cappa built (labelled `dev.cappa.playwright`), including
 * ones a rebuild left untagged. Returns their IDs.
 */
export async function removePlaywrightImages(options: {
  cli: string;
  exec?: Exec;
}): Promise<string[]> {
  const { cli, exec = defaultExec } = options;
  let stdout: string;
  try {
    ({ stdout } = await exec(cli, [
      "images",
      "--filter",
      `label=${CONTAINER_LABEL}`,
      "-q",
    ]));
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(`Container CLI "${cli}" not found.`, { cause: error });
    }
    throw new Error(`"${cli} images" failed.\n\n${errorText(error)}`, {
      cause: error,
    });
  }

  const ids = [
    ...new Set(
      stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length > 0) {
    try {
      await exec(cli, ["rmi", ...ids]);
    } catch (error) {
      throw new Error(`"${cli} rmi" failed.\n\n${errorText(error)}`, {
        cause: error,
      });
    }
  }
  return ids;
}
