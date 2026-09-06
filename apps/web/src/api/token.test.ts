import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveToken } from "./token";

const STORAGE_KEY = "cappa.token";

/**
 * These run in a real browser, so `location`, `history` and `sessionStorage`
 * are the real thing. `replaceState` is the only way to put a query string on
 * the page without a reload.
 */
const setUrl = (url: string) => {
  window.history.replaceState(null, "", url);
};

const currentUrl = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

let originalUrl: string;

beforeEach(() => {
  originalUrl = currentUrl();
  window.sessionStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  window.sessionStorage.removeItem(STORAGE_KEY);
  setUrl(originalUrl);
});

describe("resolveToken", () => {
  it("lifts the token out of the query string", () => {
    setUrl("/?token=secret-abc");

    expect(resolveToken()).toBe("secret-abc");
  });

  it("returns undefined when no token was ever supplied", () => {
    setUrl("/");

    expect(resolveToken()).toBeUndefined();
  });

  it("treats an empty token parameter as absent", () => {
    setUrl("/?token=");

    expect(resolveToken()).toBeUndefined();
  });

  it("survives a reload, when the token is no longer in the URL", () => {
    setUrl("/?token=secret-abc");
    expect(resolveToken()).toBe("secret-abc");

    // A reload lands on a bare URL — the token is only ever in the one the
    // server printed. This is the case that 401s the whole UI today.
    setUrl("/changed");

    expect(resolveToken()).toBe("secret-abc");
  });

  it("prefers a freshly supplied token over a stored one", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "stale");
    setUrl("/?token=fresh");

    expect(resolveToken()).toBe("fresh");
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("fresh");
  });
});

describe("resolveToken address bar cleanup", () => {
  it("removes the token from the address bar once captured", () => {
    setUrl("/?token=secret-abc");

    resolveToken();

    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/");
  });

  it("keeps every other query parameter", () => {
    setUrl("/?search=button&token=secret-abc&category=changed");

    resolveToken();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("token")).toBeNull();
    expect(params.get("search")).toBe("button");
    expect(params.get("category")).toBe("changed");
  });

  it("keeps the path and hash", () => {
    setUrl("/changed?token=secret-abc#top");

    resolveToken();

    expect(currentUrl()).toBe("/changed#top");
  });

  it("leaves an untokened URL alone", () => {
    setUrl("/changed?search=button");

    resolveToken();

    expect(currentUrl()).toBe("/changed?search=button");
  });
});
