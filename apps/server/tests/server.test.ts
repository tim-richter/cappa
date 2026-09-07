import { PROTOCOL_VERSION, TOKEN_HEADER } from "@cappa/protocol";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { createFakeEngine } from "./fakeEngine";

const build = (opts: Partial<Parameters<typeof createServer>[0]> = {}) =>
  createServer({
    engine: createFakeEngine(),
    outputDir: "dist/screenshots",
    logger: false,
    ...opts,
  });

describe("GET /api/health", () => {
  it("reports the protocol version and capabilities", async () => {
    const app = await build();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { capture: true, approve: true, events: true },
    });
  });

  it("advertises reduced capabilities when read-only", async () => {
    const app = await build({ readOnly: true });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.json().capabilities).toEqual({
      capture: false,
      approve: false,
      events: true,
    });
  });
});

describe("GET /api/config", () => {
  it("returns the configured theme", async () => {
    const app = await build({ theme: "dark" });

    const response = await app.inject({ method: "GET", url: "/api/config" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ theme: "dark", readOnly: false });
  });

  it("defaults to the light theme", async () => {
    const app = await build();

    const response = await app.inject({ method: "GET", url: "/api/config" });

    expect(response.json()).toEqual({ theme: "light", readOnly: false });
  });

  it("reports read-only mode", async () => {
    const app = await build({ readOnly: true });

    expect((await app.inject({ url: "/api/config" })).json()).toEqual({
      theme: "light",
      readOnly: true,
    });
  });
});

describe("token auth", () => {
  it("rejects an API request with no token", async () => {
    const app = await build({ token: "s3cret" });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a wrong token", async () => {
    const app = await build({ token: "s3cret" });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { [TOKEN_HEADER]: "nope" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("accepts the token in a header", async () => {
    const app = await build({ token: "s3cret" });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { [TOKEN_HEADER]: "s3cret" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("accepts the token as a query parameter", async () => {
    const app = await build({ token: "s3cret" });

    const response = await app.inject({
      method: "GET",
      url: "/api/health?token=s3cret",
    });

    expect(response.statusCode).toBe(200);
  });

  it("leaves non-API routes ungated", async () => {
    const app = await build({ token: "s3cret" });

    const response = await app.inject({ method: "GET", url: "/not-api" });

    expect(response.statusCode).not.toBe(401);
  });

  it("requires no token when none is configured", async () => {
    const app = await build();

    expect((await app.inject({ url: "/api/health" })).statusCode).toBe(200);
  });
});

describe("the review UI", () => {
  // `uiRoot` points at a directory that exists so `@fastify/static` can
  // register; what matters here is whether it is registered at all.
  const uiRoot = "tests";

  it("is not served when ui is false", async () => {
    const app = await build({ ui: false, uiRoot });

    const response = await app.inject({ method: "GET", url: "/" });

    // No static root and no SPA fallback: `/` is just an unknown route.
    expect(response.statusCode).toBe(404);
  });

  it("still answers /api/* when ui is false", async () => {
    const app = await build({ ui: false, uiRoot });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
  });

  it("is served when ui is true even outside prod", async () => {
    const app = await build({ ui: true, isProd: false, uiRoot });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    // The SPA fallback is registered, so an unknown API route is a JSON 404
    // rather than the index page.
    const missing = await app.inject({ method: "GET", url: "/api/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "not found" });
  });

  it("follows isProd when ui is not set", async () => {
    const app = await build({ isProd: false, uiRoot });

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(404);
  });
});
