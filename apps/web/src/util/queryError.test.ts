import { CappaHttpError, UnauthorizedError } from "@cappa/client";
import { describe, expect, it } from "vitest";
import { queryErrorMessage, queryErrorStatus } from "./queryError";

describe("queryErrorMessage", () => {
  it("uses the error's own message", () => {
    expect(queryErrorMessage(new Error("Network error"))).toBe("Network error");
  });

  it("uses the server's message from an HTTP error", () => {
    expect(
      queryErrorMessage(new CappaHttpError("Screenshot store is gone", 500)),
    ).toBe("Screenshot store is gone");
  });

  it("falls back when the message is empty", () => {
    // `new Error(res.statusText)` is empty under HTTP/2, which is how the old
    // error state ended up saying nothing at all.
    expect(queryErrorMessage(new Error(""))).toBe(
      "The request failed for an unknown reason.",
    );
  });

  it("falls back for rejections that are not errors", () => {
    expect(queryErrorMessage("nope")).toBe(
      "The request failed for an unknown reason.",
    );
  });
});

describe("queryErrorStatus", () => {
  it("reads the status off an HTTP error", () => {
    expect(queryErrorStatus(new CappaHttpError("boom", 503))).toBe(503);
  });

  it("reads the status off an HTTP error subclass", () => {
    expect(queryErrorStatus(new UnauthorizedError("no token"))).toBe(401);
  });

  it("is undefined for errors with no status", () => {
    expect(queryErrorStatus(new Error("Network error"))).toBeUndefined();
    expect(queryErrorStatus(undefined)).toBeUndefined();
  });
});
