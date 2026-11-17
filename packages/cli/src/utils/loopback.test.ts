import http from "node:http";
import { describe, expect, it } from "vitest";
import {
  bindCompanion,
  localhostCompanions,
  toBindHost,
  toDisplayHost,
} from "./loopback";

describe("toDisplayHost", () => {
  it("keeps a loopback bind readable", () => {
    expect(toDisplayHost("127.0.0.1")).toBe("localhost");
    expect(toDisplayHost("localhost")).toBe("localhost");
    expect(toDisplayHost("::1")).toBe("localhost");
    expect(toDisplayHost("[::1]")).toBe("localhost");
  });

  it("turns a wildcard bind into something a browser can open", () => {
    // The printed URL is the only place a generated token ever appears, so a
    // `http://0.0.0.0:…?token=…` that no browser will load locks the user out
    // of their own review UI.
    expect(toDisplayHost("0.0.0.0")).toBe("localhost");
    expect(toDisplayHost("::")).toBe("localhost");
    expect(toDisplayHost("[::]")).toBe("localhost");
  });

  it("leaves a specific host alone", () => {
    expect(toDisplayHost("build-host.internal")).toBe("build-host.internal");
    expect(toDisplayHost("192.168.1.10")).toBe("192.168.1.10");
  });

  it("prints other 127/8 addresses literally, since localhost is not them", () => {
    expect(toDisplayHost("127.0.0.2")).toBe("127.0.0.2");
  });

  it("brackets IPv6 literals so the URL parses", () => {
    expect(toDisplayHost("fe80::1")).toBe("[fe80::1]");
    expect(toDisplayHost("[fe80::1]")).toBe("[fe80::1]");
  });
});

describe("localhostCompanions", () => {
  it("pairs each single-family loopback bind with the other family", () => {
    expect(localhostCompanions("127.0.0.1")).toEqual(["::1"]);
    expect(localhostCompanions("localhost")).toEqual(["::1"]);
    expect(localhostCompanions("::1")).toEqual(["127.0.0.1"]);
    expect(localhostCompanions("[::1]")).toEqual(["127.0.0.1"]);
  });

  it("covers the IPv6 loopback an IPv4 wildcard misses", () => {
    expect(localhostCompanions("0.0.0.0")).toEqual(["::1"]);
  });

  it("needs nothing for a dual-stack wildcard or a specific host", () => {
    expect(localhostCompanions("::")).toEqual([]);
    expect(localhostCompanions("192.168.1.10")).toEqual([]);
    expect(localhostCompanions("127.0.0.2")).toEqual([]);
  });
});

describe("toBindHost", () => {
  it("binds localhost as 127.0.0.1 so Fastify cannot drop a failed address", () => {
    expect(toBindHost("localhost")).toBe("127.0.0.1");
  });

  it("strips URL brackets from IPv6 literals", () => {
    expect(toBindHost("[::1]")).toBe("::1");
    expect(toBindHost("[::]")).toBe("::");
  });

  it("passes everything else through", () => {
    expect(toBindHost("0.0.0.0")).toBe("0.0.0.0");
    expect(toBindHost("::1")).toBe("::1");
  });
});

describe("bindCompanion", () => {
  it("resolves to null when the address cannot exist here", async () => {
    // TEST-NET-1 is never assigned to a local interface: EADDRNOTAVAIL, the
    // same answer a machine without IPv6 gives for `::1`.
    const target = http.createServer();
    await expect(bindCompanion(target, "192.0.2.1", 0)).resolves.toBeNull();
  });
});
