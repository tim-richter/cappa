import { randomBytes } from "node:crypto";
import { getConfig } from "@cappa/config";
import { getLogger } from "@cappa/logger";
import { isLoopbackHost } from "@cappa/server";
import { resolveToken, startServer } from "../utils/server";

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
  let token = resolveToken(options.token);
  let tokenWasGenerated = false;
  if (!token && !isLoopbackHost(host) && !readOnly) {
    token = randomBytes(24).toString("base64url");
    tokenWasGenerated = true;
    logger.warn(
      `Binding to ${host} exposes capture control beyond this machine; requiring an access token.`,
    );
  }

  const { url } = await startServer({
    config,
    host,
    port,
    readOnly,
    token,
    ui: true,
  });

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
