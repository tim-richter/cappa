import type http from "node:http";
import path from "node:path";
import { configToEngineOptions, type ResolvedUserConfig } from "@cappa/config";
import { LocalEngine } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import { createServer } from "@cappa/server";
import {
  bindCompanion,
  closeCompanion,
  localhostCompanions,
  toBindHost,
  toDisplayHost,
} from "./loopback";

export { toDisplayHost };

type Closeable = { close: () => Promise<unknown> };

const closeQuietly = async (name: string, closeable: Closeable) => {
  try {
    await closeable.close();
  } catch (error) {
    getLogger().debug(`Error closing ${name} during shutdown:`, error);
  }
};

/**
 * Shut a running server down cleanly on Ctrl-C or SIGTERM.
 *
 * Order matters: the HTTP server closes first so no new run can be started
 * mid-teardown, then the engine, which aborts an active run and closes the
 * browser. Without that last step a killed server can leave an orphaned
 * Chromium behind.
 *
 * The second signal exits immediately — if the first shutdown is wedged on a
 * capture that will not stop, the user should not have to reach for `kill -9`.
 */
export function registerShutdownHandlers(
  server: Closeable,
  engine: Closeable,
  exitFn: (code: number) => void = process.exit,
): () => void {
  let shuttingDown = false;

  const handleSignal = async () => {
    if (shuttingDown) {
      exitFn(130);
      return;
    }
    shuttingDown = true;

    const logger = getLogger();
    logger.info("Shutting down…");

    // Each close is independent: a server that fails to close must not stop
    // the engine from closing, or a failed shutdown leaks a browser process.
    await closeQuietly("server", server);
    await closeQuietly("engine", engine);

    exitFn(130);
  };

  // `on`, not `once`: a second Ctrl-C must reach the handler to force the exit.
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  return () => {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  };
}

/**
 * Read the access token from the flag, falling back to `CAPPA_TOKEN`.
 *
 * The environment fallback exists so a CI job does not have to put the token in
 * its process list, where anything on the box can read it.
 */
export const resolveToken = (token?: string): string | undefined =>
  token ?? process.env.CAPPA_TOKEN ?? undefined;

export type StartServerOptions = {
  config: ResolvedUserConfig;
  host: string;
  port: number;
  readOnly: boolean;
  token?: string;
  /** Serve the review UI alongside `/api/*`. */
  ui: boolean;
  /** Fail when `port` is taken instead of moving to the next free one. */
  strictPort?: boolean;
};

export type RunningServer = {
  server: Awaited<ReturnType<typeof createServer>>;
  engine: LocalEngine;
  /** Where the server is actually reachable, with the token if there is one. */
  url: string;
  /** The port actually bound — `port + n` when the requested one was taken. */
  port: number;
  unregisterShutdownHandlers: () => void;
};

/** How many ports past the requested one to try before giving up. */
export const MAX_PORT_ATTEMPTS = 20;

type Listenable = {
  listen: (options: { port: number; host: string }) => Promise<unknown>;
  addresses?: () => Array<{ port: number }>;
};

/** No port in the range `listenWithFallback` tried was free. */
export class PortInUseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PortInUseError";
  }
}

const isAddressInUse = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === "EADDRINUSE";

/** A bind that failed with `EADDRINUSE`, and where. */
class AddressTaken extends Error {
  constructor(
    readonly host: string,
    readonly error: unknown,
  ) {
    super(`${host} is in use`);
  }
}

export type ListenWithFallbackOptions = {
  host: string;
  port: number;
  strictPort?: boolean;
  maxAttempts?: number;
  onPortInUse?: (port: number, host: string) => void;
  /**
   * Further addresses to hold on the same port, each forwarding to `target`.
   * A port counts as free only when all of them are — see `loopback.ts`.
   */
  companions?: { hosts: string[]; target: http.Server };
};

export type ListenResult = {
  port: number;
  /** The companion addresses actually held (an absent IPv6 is skipped). */
  companions: string[];
};

/**
 * Listen on `port`, or the next free port above it.
 *
 * Retries the real `listen` on `EADDRINUSE` rather than probing first (what
 * `get-port`/`detect-port` do): a probe frees the port again before the server
 * binds it, so two cappa processes started together can both "find" the same
 * port and one of them still crashes. Binding is the only atomic check.
 *
 * Companions are bound before the server, because a Fastify instance cannot
 * listen again once it has been closed: a companion that turns out to be taken
 * costs nothing to give back, a bound server does.
 *
 * Only `EADDRINUSE` moves on. `EACCES` (a privileged port) or a bad host would
 * fail identically on every port, so they surface as-is.
 *
 * Returns the port actually bound, read back from the server so `port: 0`
 * (OS-assigned) reports the real number too.
 */
export async function listenWithFallback(
  server: Listenable,
  options: ListenWithFallbackOptions,
): Promise<ListenResult> {
  const { host, port, strictPort = false, companions } = options;
  // Port 0 can never be "in use", and a strict port gets exactly one try.
  const attempts =
    strictPort || port === 0
      ? 1
      : Math.min(options.maxAttempts ?? MAX_PORT_ATTEMPTS, 65_536 - port);

  const companionHosts = companions?.hosts ?? [];
  const bind = async (address: string, candidate: number) => {
    if (!companions) return null;
    try {
      return await bindCompanion(companions.target, address, candidate);
    } catch (error) {
      throw isAddressInUse(error) ? new AddressTaken(address, error) : error;
    }
  };

  for (let i = 0; i < attempts; i++) {
    const candidate = port + i;
    const held: Array<{ host: string; server: http.Server }> = [];
    try {
      // With port 0 the number is not known until the server has it.
      if (candidate !== 0) {
        for (const address of companionHosts) {
          const companion = await bind(address, candidate);
          if (companion) held.push({ host: address, server: companion });
        }
      }

      try {
        await server.listen({ port: candidate, host });
      } catch (error) {
        throw isAddressInUse(error) ? new AddressTaken(host, error) : error;
      }
      const bound = server.addresses?.()[0]?.port ?? candidate;

      if (candidate === 0) {
        // Best effort: an OS-picked port taken on the other loopback is
        // vanishingly unlikely, and the server can no longer move.
        for (const address of companionHosts) {
          const companion = await bind(address, bound).catch(() => null);
          if (companion) held.push({ host: address, server: companion });
        }
      }

      if (companions && held.length > 0) {
        companions.target.once("close", () => {
          for (const companion of held) closeCompanion(companion.server);
        });
      }

      return { port: bound, companions: held.map((c) => c.host) };
    } catch (error) {
      for (const companion of held) closeCompanion(companion.server);

      if (!(error instanceof AddressTaken)) {
        throw error;
      }
      options.onPortInUse?.(candidate, error.host);
      if (i === attempts - 1) {
        const where = attempts === 1 ? error.host : host;
        const tried =
          attempts === 1 ? `Port ${port}` : `Ports ${port}–${candidate}`;
        const fix = strictPort
          ? "Drop --strict-port to use the next free one, or pass --port <port>."
          : "Pass --port <port> to pick another.";
        throw new PortInUseError(
          `${tried} on ${where} ${attempts === 1 ? "is" : "are all"} in use. ${fix}`,
          { cause: error.error },
        );
      }
    }
  }

  // Unreachable: the loop either returns or throws on its last attempt.
  throw new Error(`Could not listen on ${host}:${port}.`);
}

/**
 * Build an engine, wrap it in a server, and start listening.
 *
 * Shared by `review` and `serve`, which differ only in how they resolve a token
 * and what they print afterwards — everything from the engine to the bound
 * socket is the same, and was duplicated before `serve` existed.
 *
 * The token is taken as already-resolved: the two commands have deliberately
 * different policies (`review` generates one off loopback for the human reading
 * the URL it prints, `serve` refuses to start without one), and folding that
 * decision in here would hide it.
 */
export async function startServer(
  options: StartServerOptions,
): Promise<RunningServer> {
  const logger = getLogger();
  const { config, host, port, readOnly, token, ui, strictPort } = options;

  // The engine holds the config's live plugin objects, so it is built here — in
  // the process that evaluated cappa.config.ts — and injected into the server.
  const engine = new LocalEngine({
    ...configToEngineOptions(config),
    browserIdleTimeoutMs: config.review.browserIdleTimeout,
  });

  const server = await createServer({
    engine,
    isProd: true,
    ui,
    outputDir: path.resolve(config.outputDir),
    logger: logger.level >= 4,
    theme: config.review.theme,
    readOnly,
    token,
  });

  const unregisterShutdownHandlers = registerShutdownHandlers(server, engine);

  let boundPort: number;
  try {
    ({ port: boundPort } = await listenWithFallback(server, {
      host: toBindHost(host),
      port,
      strictPort,
      onPortInUse: (taken, on) =>
        logger.debug(`Port ${taken} is in use on ${on}.`),
      // Hold the other loopback too, or `localhost:<port>` in the printed URL
      // may reach someone else's server instead of this one.
      companions: server.server && {
        hosts: localhostCompanions(host),
        target: server.server,
      },
    }));
  } catch (error) {
    // The engine may already hold a browser and the signal handlers keep the
    // process alive; leave nothing behind for a server that never started.
    unregisterShutdownHandlers();
    await closeQuietly("server", server);
    await closeQuietly("engine", engine);
    throw error;
  }

  if (boundPort !== port && port !== 0) {
    logger.warn(`Port ${port} is in use, using ${boundPort} instead.`);
  }

  const displayHost = toDisplayHost(host);
  const query = token ? `?token=${token}` : "";

  return {
    server,
    engine,
    port: boundPort,
    url: `http://${displayHost}:${boundPort}${query}`,
    unregisterShutdownHandlers,
  };
}

/**
 * `startServer` for a CLI command: a taken port is a one-line error and exit
 * code 1, not a stack trace. Anything else is a bug and keeps its stack.
 */
export async function startServerOrExit(
  options: StartServerOptions,
  exitFn: (code: number) => void = process.exit,
): Promise<RunningServer> {
  try {
    return await startServer(options);
  } catch (error) {
    if (error instanceof PortInUseError) {
      getLogger().error(error.message);
      exitFn(1);
    }
    throw error;
  }
}
