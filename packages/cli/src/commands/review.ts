import { randomBytes } from "node:crypto";
import path from "node:path";
import { getConfig } from "@cappa/config";
import { LocalEngine, type RunnablePlugin } from "@cappa/core";
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
 * Shut the review server down cleanly on Ctrl-C.
 *
 * Order matters: the HTTP server closes first so no new run can be started
 * mid-teardown, then the engine, which aborts an active run and closes the
 * browser. Without that last step a killed `cappa review` can leave an orphaned
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

export type ReviewOptions = {
  port?: number;
  host?: string;
  readOnly?: boolean;
  token?: string;
};

export const review = async (options: ReviewOptions = {}) => {
  const logger = getLogger();

  const config = await getConfig();

  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? config.review.port;
  const readOnly = options.readOnly ?? false;

  // The engine drives a real browser and writes to disk. On loopback that is
  // the user's own machine; exposed to a network it is not, so a token is
  // mandatory there — generated when one was not supplied, and printed as part
  // of the URL so it is usable without extra steps.
  let token = options.token;
  let tokenWasGenerated = false;
  if (!token && !isLoopbackHost(host) && !readOnly) {
    token = randomBytes(24).toString("base64url");
    tokenWasGenerated = true;
    logger.warn(
      `Binding to ${host} exposes capture control beyond this machine; requiring an access token.`,
    );
  }

  // The engine holds the config's live plugin objects, so it is built here — in
  // the process that evaluated cappa.config.ts — and injected into the server.
  const engine = new LocalEngine({
    outputDir: path.resolve(config.outputDir),
    plugins: (config.plugins || []) as unknown as RunnablePlugin[],
    diff: config.diff,
    retries: config.retries,
    concurrency: config.concurrency,
    logConsoleEvents: config.logConsoleEvents,
    fullPage: config.screenshot?.fullPage ?? true,
    viewport: config.screenshot?.viewport ?? { width: 1920, height: 1080 },
    connectionTimeout: config.connectionTimeout,
    browserIdleTimeoutMs: config.review.browserIdleTimeout,
  });

  const server = await createServer({
    engine,
    isProd: true,
    outputDir: path.resolve(config.outputDir),
    logger: logger.level >= 4,
    theme: config.review.theme,
    readOnly,
    token,
  });

  registerShutdownHandlers(server, engine);

  await server.listen({ port, host });

  const displayHost = isLoopbackHost(host) ? "localhost" : host;
  const query = token ? `?token=${token}` : "";
  const url = `http://${displayHost}:${port}${query}`;

  logger.success(`Review UI available at ${url}`);

  // `success` is an info-level log, so it is suppressed below `-l 3`. A
  // generated token is the only way into the server — printing it somewhere the
  // user may not see would leave them locked out of their own review UI — so
  // repeat it at the same level as the warning that announced it.
  if (tokenWasGenerated && logger.level < 3) {
    logger.warn(`Review UI available at ${url}`);
  }

  if (readOnly) {
    logger.info("Running read-only: capture and approval are disabled.");
  }
};
