import { CappaHttpError } from "@cappa/client";

/**
 * What to tell the user about a failed query.
 *
 * The client already builds a usable message — the server's own `error` string
 * when it sent one, and `GET /screenshots failed with 500` when it did not —
 * so the only thing the UI has to do is stop throwing it away. The fallback is
 * for the rejections that are not `Error`s at all, and for the empty
 * `statusText` messages HTTP/2 hands out.
 */
export const queryErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "The request failed for an unknown reason.";
};

/**
 * The HTTP status behind a failed query, when the failure was an HTTP one.
 *
 * A network error has no status, and showing "HTTP undefined" is worse than
 * showing nothing.
 */
export const queryErrorStatus = (error: unknown): number | undefined =>
  error instanceof CappaHttpError ? error.status : undefined;
