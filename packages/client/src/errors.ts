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

  return new CappaHttpError(message, status, body);
};
