import { getConfig } from "@cappa/config";
import { getLogger } from "@cappa/logger";
import { isLoopbackHost } from "@cappa/server";
import { resolveToken, startServer } from "../utils/server";

export type ServeOptions = {
  port?: number;
  host?: string;
  readOnly?: boolean;
  token?: string;
  /** Commander sets this to `false` for `--no-ui`. */
  ui?: boolean;
};

/**
 * Host a capture engine for a remote `cappa capture --server`.
 *
 * `review` minus the assumption that a person is about to open a browser. The
 * one deliberate divergence is the token: `review` generates one off loopback
 * because a human is reading the URL it prints, and `serve` has no such reader —
 * generating one here would produce a daemon nobody can authenticate against.
 * So off loopback it is required, and the command refuses to start without one.
 */
export const serve = async (options: ServeOptions = {}) => {
  const logger = getLogger();

  const config = await getConfig();

  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? config.review.port;
  const readOnly = options.readOnly ?? false;
  const ui = options.ui ?? true;

  const token = resolveToken(options.token);

  if (!token && !isLoopbackHost(host) && !readOnly) {
    logger.error(
      `Binding to ${host} exposes capture control beyond this machine, so an access token is required. ` +
        "Pass --token <token>, or set CAPPA_TOKEN to keep it out of the process list.",
    );
    process.exit(1);
    return;
  }

  const { url } = await startServer({
    config,
    host,
    port,
    readOnly,
    token,
    ui,
  });

  // One structured line, then quiet: nothing is watching this the way a human
  // watches `review`, so the output exists to be greppable in a CI log.
  logger.log(
    `cappa serve listening host=${host} port=${port} ui=${ui} read-only=${readOnly} token=${token ? "yes" : "no"}`,
  );

  if (ui) {
    logger.info(`Review UI available at ${url}`);
  }

  if (readOnly) {
    logger.info("Running read-only: capture and approval are disabled.");
  }
};
