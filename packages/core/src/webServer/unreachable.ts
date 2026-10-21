/** The advice for a refused connection when the config has no `webServer`. */
export const NO_WEB_SERVER_HINT =
  "Start it before capturing, or add a `webServer` entry to cappa.config.ts so cappa starts it for you.";

/**
 * How a refused connection reads, across the places one surfaces: Node's
 * sockets and `fetch` (`ECONNREFUSED`), Chromium (`net::ERR_CONNECTION_REFUSED`),
 * Firefox (`NS_ERROR_CONNECTION_REFUSED`) and WebKit.
 */
const REFUSED_PATTERN =
  /\bECONNREFUSED\b|\bERR_CONNECTION_REFUSED\b|\bNS_ERROR_CONNECTION_REFUSED\b|Could not connect to (?:the )?server|Connection refused/i;

const URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>)\]]+/i;

export type RefusedConnection = {
  /** Origin of the URL that refused, when the error names one. */
  origin?: string;
};

const toOrigin = (url: string): string | undefined => {
  try {
    // A URL that ends a sentence takes its full stop with it.
    return new URL(url.replace(/[.,;:!?]+$/, "")).origin;
  } catch {
    return undefined;
  }
};

/**
 * Whether `error` — an `Error`, a plain object, or just a message string, as
 * plugins report task failures — is a refused connection.
 *
 * Walks `cause` and `AggregateError.errors`: Node's `fetch` says only
 * "fetch failed" and puts `ECONNREFUSED` on its cause, and a plugin that wraps
 * the error in a friendlier one keeps it there too.
 *
 * Works on any plugin's errors, third-party included, because it reads the
 * error rather than asking the plugin.
 */
export function findRefusedConnection(
  error: unknown,
): RefusedConnection | undefined {
  let refused = false;
  let origin: string | undefined;
  let socketOrigin: string | undefined;

  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number) => {
    if (value === null || value === undefined || depth > 8 || seen.has(value)) {
      return;
    }
    seen.add(value);

    if (typeof value === "string") {
      if (REFUSED_PATTERN.test(value)) {
        refused = true;
      }
      const url = value.match(URL_PATTERN)?.[0];
      origin ??= url ? toOrigin(url) : undefined;
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const record = value as {
      message?: unknown;
      code?: unknown;
      address?: unknown;
      port?: unknown;
      cause?: unknown;
      errors?: unknown;
    };

    if (record.code === "ECONNREFUSED") {
      refused = true;
      if (typeof record.address === "string" && record.port !== undefined) {
        const host = record.address.includes(":")
          ? `[${record.address}]`
          : record.address;
        socketOrigin ??= `http://${host}:${record.port}`;
      }
    }

    visit(record.message, depth + 1);
    visit(record.cause, depth + 1);
    if (Array.isArray(record.errors)) {
      for (const inner of record.errors) {
        visit(inner, depth + 1);
      }
    }
  };

  visit(error, 0);

  if (!refused) {
    return undefined;
  }

  // A URL in a message is what the user configured; a socket address is what
  // it resolved to. The first is the one they will recognise.
  const resolved = origin ?? socketOrigin;
  return resolved ? { origin: resolved } : {};
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * Whether two origins name the same server.
 *
 * Loopback spellings are interchangeable: a plugin configured with
 * `localhost:6006` and a socket error reporting `127.0.0.1:6006` are the same
 * Storybook.
 */
export function sameServer(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    const port = (url: URL) =>
      url.port || (url.protocol === "https:" ? "443" : "80");

    if (port(left) !== port(right)) {
      return false;
    }
    return (
      left.hostname === right.hostname ||
      (LOOPBACK_HOSTS.has(left.hostname) && LOOPBACK_HOSTS.has(right.hostname))
    );
  } catch {
    return false;
  }
}
