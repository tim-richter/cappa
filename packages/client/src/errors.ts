import { ERROR_CODES, type ErrorResponse } from "@cappa/protocol";

/** A non-2xx response from the server. */
export class CappaHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: ErrorResponse | undefined;

  constructor(
    message: string,
    status: number,
    body?: ErrorResponse,
    code?: string,
  ) {
    super(message);
    this.name = "CappaHttpError";
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

/**
 * The server already has a run in flight. One run at a time is deliberate: the
 * browser pool is the constraint, so a second request is a conflict rather than
 * something to queue.
 */
export class RunInProgressError extends CappaHttpError {
  readonly activeRunId: string | undefined;

  constructor(message: string, body?: ErrorResponse) {
    super(message, 409, body, ERROR_CODES.runInProgress);
    this.name = "RunInProgressError";
    this.activeRunId = body?.activeRunId;
  }
}

/**
 * The server requires an access token and did not get a usable one.
 *
 * Its own class because it is the one error a caller must not retry: the token
 * is not going to appear on its own, and retrying turns "you need the token
 * from the printed URL" into ten seconds of a blank, still-loading page.
 */
export class UnauthorizedError extends CappaHttpError {
  constructor(message: string, body?: ErrorResponse) {
    super(message, 401, body);
    this.name = "UnauthorizedError";
  }
}

/**
 * The server already has a watch session. One at a time, for the same reason
 * one run is: both drive the same browser.
 */
export class WatchInProgressError extends CappaHttpError {
  constructor(message: string, body?: ErrorResponse) {
    super(message, 409, body, ERROR_CODES.watchInProgress);
    this.name = "WatchInProgressError";
  }
}

/** The request named task ids the server never discovered. */
export class UnknownTargetsError extends CappaHttpError {
  readonly taskIds: string[];

  constructor(message: string, body?: ErrorResponse) {
    super(message, 400, body, ERROR_CODES.unknownTargets);
    this.name = "UnknownTargetsError";
    this.taskIds = body?.taskIds ?? [];
  }
}

/**
 * The server speaks a different version of the wire contract.
 *
 * Failing loudly on the first call beats mis-parsing responses for the rest of
 * the session.
 */
export class ProtocolMismatchError extends Error {
  readonly expected: number;
  readonly actual: number;

  constructor(expected: number, actual: number) {
    super(
      `Server speaks protocol version ${actual}, this client expects ${expected}. Upgrade whichever is older.`,
    );
    this.name = "ProtocolMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}

const messageFrom = (body: ErrorResponse | undefined, fallback: string) => {
  if (typeof body?.error === "string") {
    return body.error;
  }
  if (body?.error !== undefined) {
    return JSON.stringify(body.error);
  }
  return fallback;
};

/** Map an error response onto the most specific error class available. */
export const toClientError = (
  status: number,
  body: ErrorResponse | undefined,
  fallback: string,
): CappaHttpError => {
  const message = messageFrom(body, fallback);

  if (body?.code === ERROR_CODES.runInProgress) {
    return new RunInProgressError(message, body);
  }
  if (body?.code === ERROR_CODES.unknownTargets) {
    return new UnknownTargetsError(message, body);
  }
  if (body?.code === ERROR_CODES.watchInProgress) {
    return new WatchInProgressError(message, body);
  }
  // By status rather than by code: the auth hook rejects before any route runs,
  // so there is no cappa error code on the response to key off.
  if (status === 401) {
    return new UnauthorizedError(message, body);
  }

  return new CappaHttpError(message, status, body);
};

/**
 * The server sent an event type this client does not know.
 *
 * Reported once per stream rather than per event, and never fatal: an unknown
 * type is what a newer server looks like to an older client, and the stream
 * stays usable — the frame is skipped but its sequence number is still
 * consumed, so a reconnect resumes from where the server actually is.
 */
export class UnknownEventTypeError extends Error {
  readonly eventType: string;

  constructor(eventType: string) {
    super(
      `Skipping unknown event type "${eventType}" — this server is newer than @cappa/client.`,
    );
    this.name = "UnknownEventTypeError";
    this.eventType = eventType;
  }
}
