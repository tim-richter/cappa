import { randomBytes } from "node:crypto";
import path from "node:path";
import { getConfig } from "@cappa/config";
import { LocalEngine, type RunnablePlugin } from "@cappa/core";
import { getLogger } from "@cappa/logger";
import { createServer, isLoopbackHost } from "@cappa/server";

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
  if (!token && !isLoopbackHost(host) && !readOnly) {
    token = randomBytes(24).toString("base64url");
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

  const shutdown = async () => {
    await server.close();
    await engine.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await server.listen({ port, host });

  const displayHost = isLoopbackHost(host) ? "localhost" : host;
  const query = token ? `?token=${token}` : "";
  logger.success(
    `Review UI available at http://${displayHost}:${port}${query}`,
  );
  if (readOnly) {
    logger.info("Running read-only: capture and approval are disabled.");
  }
};
