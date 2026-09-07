import { createClient, ProtocolMismatchError } from "@cappa/client";
import type { CaptureEngine } from "@cappa/core";
import type { ReportableScreenshot } from "./describeChanges";

/**
 * The engine `capture` drives.
 *
 * Identical to `CaptureEngine` except for `listScreenshots`, which is widened:
 * a remote engine carries `diffMeta.interpretation` opaquely, so the two
 * engines' screenshot types differ in exactly that one field. Everything
 * downstream narrows it rather than trusting it.
 */
export type CaptureCliEngine = Omit<CaptureEngine, "listScreenshots"> & {
  listScreenshots(): Promise<ReportableScreenshot[]>;
};

/** A pre-flight failure, already phrased for the user. */
export class RemoteServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteServerError";
  }
}

/**
 * The host already has a run in flight.
 *
 * Duck-typed rather than `instanceof`: `@cappa/client` ships dual ESM/CJS
 * builds, so the CLI can hold a different copy of the class than the one that
 * threw — the same hazard the client documents for its own 404 check.
 */
export const isRunInProgress = (
  error: unknown,
): error is { activeRunId?: string } =>
  typeof error === "object" &&
  error !== null &&
  (error as { status?: number }).status === 409;

const isAuthFailure = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { status?: number }).status === 401;

const isProtocolMismatch = (
  error: unknown,
): error is { expected: number; actual: number } =>
  error instanceof ProtocolMismatchError ||
  (typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "ProtocolMismatchError");

export type ConnectOptions = {
  server: string;
  token?: string;
};

/**
 * Build a remote engine and prove the host is usable before capturing anything.
 *
 * One request to `/api/health` turns four different failures — unreachable
 * host, wrong token, protocol skew, and a host that cannot capture — into four
 * distinct messages, up front. The client performs the version handshake on its
 * first call anyway; doing it here is what makes the failure legible rather
 * than arriving mid-run with half a report already printed.
 */
export async function connectToServer(
  options: ConnectOptions,
): Promise<CaptureCliEngine> {
  const engine = createClient({
    baseUrl: options.server,
    token: options.token,
  });

  let health: Awaited<ReturnType<typeof engine.health>>;

  try {
    health = await engine.health();
  } catch (error) {
    await engine.close();

    if (isAuthFailure(error)) {
      throw new RemoteServerError(
        `${options.server} rejected the access token. Pass --token <token>, or set CAPPA_TOKEN.`,
      );
    }

    if (isProtocolMismatch(error)) {
      throw new RemoteServerError(
        `${options.server} speaks protocol version ${error.actual}, this CLI expects ${error.expected}. Upgrade whichever is older.`,
      );
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new RemoteServerError(
      `Could not reach a cappa server at ${options.server}: ${reason}`,
    );
  }

  if (!health.capabilities.capture) {
    await engine.close();
    throw new RemoteServerError(
      `${options.server} is running read-only and cannot capture. Restart it without --read-only.`,
    );
  }

  return engine;
}
