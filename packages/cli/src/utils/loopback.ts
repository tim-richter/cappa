import http from "node:http";

const IPV4_LOOPBACK = "127.0.0.1";
const IPV6_LOOPBACK = "::1";

/**
 * Binds printed as `localhost`, and the loopback addresses each one leaves
 * uncovered.
 *
 * `localhost` is not one address. Browsers try `::1` and `127.0.0.1` (RFC 6761,
 * happy eyeballs), so a URL saying `localhost:3000` reaches whichever answers
 * first — and if cappa holds only `127.0.0.1:3000` while a dev server holds
 * `[::1]:3000`, the user's click lands in the dev server. The companions are
 * the addresses cappa must also hold for the printed URL to mean cappa.
 *
 * `::` is dual-stack in Node (libuv clears `IPV6_V6ONLY`), so it covers both.
 */
const LOCALHOST_BINDS: Record<string, string[]> = {
  localhost: [IPV6_LOOPBACK],
  [IPV4_LOOPBACK]: [IPV6_LOOPBACK],
  [IPV6_LOOPBACK]: [IPV4_LOOPBACK],
  "[::1]": [IPV4_LOOPBACK],
  "0.0.0.0": [IPV6_LOOPBACK],
  "::": [],
  "[::]": [],
};

/** Loopback addresses `localhost` may reach that binding `host` does not. */
export const localhostCompanions = (host: string): string[] =>
  LOCALHOST_BINDS[host] ?? [];

/**
 * The host to put in the URL a person is expected to click.
 *
 * `localhost` for every bind it reaches — loopback and wildcards, which no
 * browser will open (`http://0.0.0.0:4801` locked users out of their own UI).
 * Anything else is printed as given, with IPv6 literals bracketed. Note
 * `127.0.0.2` is loopback but is *not* `localhost`, which resolves to
 * `127.0.0.1` only.
 */
export const toDisplayHost = (host: string): string => {
  if (host in LOCALHOST_BINDS) {
    return "localhost";
  }
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
};

/**
 * The address to hand to `listen`.
 *
 * `localhost` becomes `127.0.0.1`: Fastify binds every address `localhost`
 * resolves to but silently drops the ones that fail, so a taken `[::1]:port`
 * would go unnoticed — exactly the conflict the companions exist to catch.
 * Brackets are URL syntax, not something `listen` resolves.
 */
export const toBindHost = (host: string): string => {
  if (host === "localhost") {
    return IPV4_LOOPBACK;
  }
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
};

/**
 * The loopback family does not exist on this machine — IPv6 disabled, say —
 * so nothing can be listening there and there is nothing to hold.
 */
const FAMILY_UNAVAILABLE = new Set(["EAFNOSUPPORT", "EADDRNOTAVAIL"]);

/**
 * Listen on `host:port` and hand every request to `target`.
 *
 * What Fastify does itself for its secondary `localhost` addresses, minus the
 * swallowed errors: `EADDRINUSE` is thrown so the caller can move to another
 * port. Resolves to `null` when the address family is unavailable.
 */
export async function bindCompanion(
  target: http.Server,
  host: string,
  port: number,
): Promise<http.Server | null> {
  const companion = http.createServer((req, res) => {
    target.emit("request", req, res);
  });
  companion.on("upgrade", (...args) => target.emit("upgrade", ...args));
  // Same limits as the server it fronts, so a request behaves the same
  // whichever address it arrived on.
  companion.timeout = target.timeout;
  companion.keepAliveTimeout = target.keepAliveTimeout;
  companion.requestTimeout = target.requestTimeout;
  companion.headersTimeout = target.headersTimeout;

  try {
    await new Promise<void>((resolve, reject) => {
      companion.once("error", reject);
      companion.listen({ host, port, ipv6Only: host.includes(":") }, () => {
        companion.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    if (FAMILY_UNAVAILABLE.has((error as NodeJS.ErrnoException).code ?? "")) {
      return null;
    }
    throw error;
  }

  return companion;
}

/** Stop a companion and drop its open connections (SSE streams included). */
export const closeCompanion = (companion: http.Server) => {
  companion.close(() => {});
  companion.closeAllConnections();
};
