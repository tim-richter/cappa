import { describe, expect, it } from "vitest";
import { findRefusedConnection, sameServer } from "./unreachable";

describe("findRefusedConnection", () => {
  it.each([
    [
      "Chromium",
      "page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:6006/iframe.html?id=a",
      "http://localhost:6006",
    ],
    [
      "Firefox",
      "page.goto: NS_ERROR_CONNECTION_REFUSED at http://localhost:4173/",
      "http://localhost:4173",
    ],
    [
      "WebKit",
      "page.goto: Could not connect to server at http://127.0.0.1:8080/",
      "http://127.0.0.1:8080",
    ],
  ])("recognises a %s message string", (_browser, message, origin) => {
    expect(findRefusedConnection(message)).toEqual({ origin });
  });

  it("recognises Node fetch's refused connection through its cause", () => {
    const socketError = Object.assign(
      new Error("connect ECONNREFUSED 127.0.0.1:6006"),
      { code: "ECONNREFUSED", address: "127.0.0.1", port: 6006 },
    );
    const error = new TypeError("fetch failed", { cause: socketError });

    expect(findRefusedConnection(error)).toEqual({
      origin: "http://127.0.0.1:6006",
    });
  });

  it("looks inside an AggregateError", () => {
    const error = Object.assign(
      new AggregateError([
        Object.assign(new Error("connect ECONNREFUSED ::1:6006"), {
          code: "ECONNREFUSED",
          address: "::1",
          port: 6006,
        }),
      ]),
      { code: "ECONNREFUSED" },
    );

    expect(findRefusedConnection(error)).toEqual({
      origin: "http://[::1]:6006",
    });
  });

  it("prefers the configured url over the resolved socket address", () => {
    const error = new Error(
      "Failed to connect to Storybook at http://localhost:6006. Error: fetch failed",
      {
        cause: Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
          address: "127.0.0.1",
          port: 6006,
        }),
      },
    );

    expect(findRefusedConnection(error)).toEqual({
      origin: "http://localhost:6006",
    });
  });

  it("reads a plain object with a message, as plugins sometimes return", () => {
    expect(
      findRefusedConnection({ message: "connect ECONNREFUSED 127.0.0.1:1" }),
    ).toEqual({});
  });

  it.each([
    ["a timeout", "page.goto: Timeout 30000ms exceeded."],
    ["a DNS failure", "page.goto: net::ERR_NAME_NOT_RESOLVED at http://x/"],
    ["nothing", undefined],
    ["a number", 42],
  ])("ignores %s", (_what, error) => {
    expect(findRefusedConnection(error)).toBeUndefined();
  });

  it("survives a cause cycle", () => {
    const error = new Error("outer") as Error & { cause?: unknown };
    error.cause = error;
    expect(findRefusedConnection(error)).toBeUndefined();
  });
});

describe("sameServer", () => {
  it.each([
    ["http://localhost:6006", "http://127.0.0.1:6006", true],
    ["http://localhost:6006/", "http://[::1]:6006", true],
    ["http://localhost:6006", "http://localhost:6007", false],
    ["http://example.com", "http://example.com:80", true],
    ["http://example.com", "http://localhost:80", false],
    ["not a url", "http://localhost", false],
  ])("%s vs %s → %s", (a, b, expected) => {
    expect(sameServer(a, b)).toBe(expected);
  });
});
