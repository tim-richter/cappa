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
