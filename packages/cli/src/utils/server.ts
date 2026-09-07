import path from "node:path";
import { configToEngineOptions, type ResolvedUserConfig } from "@cappa/config";
import { LocalEngine } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import { createServer, isLoopbackHost } from "@cappa/server";

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
};

export type RunningServer = {
  server: Awaited<ReturnType<typeof createServer>>;
  engine: LocalEngine;
  /** Where the server is actually reachable, with the token if there is one. */
  url: string;
  unregisterShutdownHandlers: () => void;
};

/** Wildcard binds: addresses to listen on, never addresses to open. */
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

/**
 * The host to put in the URL a person is expected to click.
 *
 * A wildcard bind is the common way to expose the UI, and printing it verbatim
 * produced `http://0.0.0.0:4801?token=…` — an address no browser will open,
 * handed to a user who then cannot reach their own review UI. `localhost` is
 * reachable on every interface the wildcard covers, so it is the right thing to
 * show; a specific host is printed as given, because that one is meaningful.
 */
export const toDisplayHost = (host: string): string =>
  isLoopbackHost(host) || WILDCARD_HOSTS.has(host) ? "localhost" : host;

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
  const { config, host, port, readOnly, token, ui } = options;

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

  await server.listen({ port, host });

  const displayHost = toDisplayHost(host);
  const query = token ? `?token=${token}` : "";

  return {
    server,
    engine,
    url: `http://${displayHost}:${port}${query}`,
    unregisterShutdownHandlers,
  };
}
