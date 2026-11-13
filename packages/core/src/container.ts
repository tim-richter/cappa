import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { ResolvedContainerOptions } from "./playwright";

/**
 * Runs the official Playwright image for an exact `playwright-core` version
 * through a container CLI (docker, podman, nerdctl, …) and hands back the
 * `run-server` endpoint.
 *
 * Only subcommands all of those CLIs share are used: `version`, `image
 * inspect`, `pull`, `inspect`, `run`, `port`, `logs`, `ps` and `rm`.
 */

/** Label on every container cappa starts; `removePlaywrightContainers` finds them by it. */
export const CONTAINER_LABEL = "dev.cappa.playwright";

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
  "keepAlive"
> & {
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
  probe?: (url: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const defaultExec: Exec = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
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
  return `cappa-playwright-v${version.replace(/[^\w.-]/g, "_")}-${hash}`;
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
    log = () => {},
    exec = defaultExec,
    probe = defaultProbe,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const image = containerImage(options.image, version);
  const name = containerName(version, image, runArgs, packageDir);
  const deadline = now() + readyTimeout;

  const run = async (args: string[]) => {
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

    const present = await run(["image", "inspect", image]).then(
      () => true,
      () => false,
    );
    if (!present) {
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

/**
 * Remove every container cappa started, whatever its version. Returns their
 * names.
 */
export async function removePlaywrightContainers(options: {
  cli: string;
  exec?: Exec;
}): Promise<string[]> {
  const { cli, exec = defaultExec } = options;
  let stdout: string;
  try {
    ({ stdout } = await exec(cli, [
      "ps",
      "-a",
      "--filter",
      `label=${CONTAINER_LABEL}`,
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
