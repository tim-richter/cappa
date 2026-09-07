import type { CaptureEngine } from "@cappa/core";
import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  type Screenshot,
  type ScreenshotQuery,
} from "@cappa/protocol";
import { describe, expect, it, vi } from "vitest";
import { createClient, type FetchLike, type RemoteEngine } from "./client";
import {
  CappaHttpError,
  ProtocolMismatchError,
  RunInProgressError,
  UnauthorizedError,
  UnknownEventTypeError,
  UnknownTargetsError,
} from "./errors";

/**
 * `RemoteEngine` is typed purely in `@cappa/protocol` terms so a browser client
 * never has to install `@cappa/core`. These assertions keep that from drifting
 * into a *different* interface: compile-time only, so `pnpm tsc` fails if the
 * remote engine stops being a drop-in for the local one.
 *
 * Every capture-driving method must match `CaptureEngine` exactly.
 */
type AssertAssignable<Target, Source extends Target> = [Target, Source];

export type _RemoteEngineDrivesCaptures = AssertAssignable<
  Omit<CaptureEngine, "listScreenshots">,
  RemoteEngine
>;

/**
 * `listScreenshots` is the one deliberate divergence, and it is one-directional:
 * the shapes are identical except that `diffMeta.interpretation` arrives as
 * `unknown`. The protocol carries that blob opaquely on purpose — its shape
 * belongs to the diff engine and would otherwise make every diff-engine upgrade
 * a breaking protocol change — so a client that wants to render the detail
 * narrows it with `InterpretResult` from `@cappa/core` itself.
 */
export type _RemoteEngineListsScreenshots = AssertAssignable<
  (query?: ScreenshotQuery) => Promise<Screenshot[]>,
  RemoteEngine["listScreenshots"]
>;

type Route = { status?: number; body?: unknown; stream?: string };

/** Builds a `fetch` that answers from a route table and records the calls. */
const fakeFetch = (routes: Record<string, Route | Route[]>) => {
  const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
  const remaining = new Map<string, Route[]>();

  for (const [key, value] of Object.entries(routes)) {
    remaining.set(key, Array.isArray(value) ? [...value] : [value]);
  }

  const doFetch: FetchLike = async (url, init) => {
    calls.push({ url, init });

    const path = url.replace("http://server", "");
    const key =
      [...remaining.keys()].find((candidate) => path.startsWith(candidate)) ??
      path;
    const queue = remaining.get(key);
    const route = queue && (queue.length > 1 ? queue.shift() : queue[0]);

    if (!route) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    if (route.stream !== undefined) {
      return new Response(route.stream, {
        status: route.status ?? 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };

  return { doFetch, calls };
};

const healthRoute = {
  "/api/health": {
    body: {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { capture: true, approve: true, events: true },
    },
  },
};

const build = (routes: Record<string, Route | Route[]>, token?: string) => {
  const { doFetch, calls } = fakeFetch({ ...healthRoute, ...routes });
  const client = createClient({
    baseUrl: "http://server",
    fetch: doFetch,
    token,
    reconnectDelayMs: 5,
  });
  return { client, calls };
};

describe("RemoteEngine requests", () => {
  it("normalises a base URL with a trailing slash", async () => {
    const { doFetch, calls } = fakeFetch(healthRoute);
    const client = createClient({
      baseUrl: "http://server/",
      fetch: doFetch,
    });

    await client.health();

    expect(calls[0]?.url).toBe("http://server/api/health");
  });

  it("lists plugins", async () => {
    const { client } = build({
      "/api/plugins": { body: [{ name: "storybook", description: "d" }] },
    });

    await expect(client.listPlugins()).resolves.toEqual([
      { name: "storybook", description: "d" },
    ]);
  });

  it("lists targets and forwards a refresh", async () => {
    const { client, calls } = build({
      "/api/targets": { body: [{ id: "a", url: "u", plugin: "p" }] },
    });

    await client.listTargets({ refresh: true });

    expect(calls.at(-1)?.url).toContain("refresh=1");
  });

  it("starts a run and returns the summary the server sent", async () => {
    const run = {
      id: "run-1",
      state: "running",
      request: { filter: "b*" },
      startedAt: 1,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      deletedScreenshots: [],
      anyTasksRan: false,
    };
    const { client, calls } = build({
      "/api/runs": { status: 201, body: { runId: "run-1", run } },
    });

    await expect(client.startRun({ filter: "b*" })).resolves.toMatchObject({
      id: "run-1",
    });
    expect(calls.at(-1)?.init?.method).toBe("POST");
    expect(calls.at(-1)?.init?.body).toBe(JSON.stringify({ filter: "b*" }));
  });

  it("cancels a run", async () => {
    const { client, calls } = build({
      "/api/runs/run-1/cancel": { status: 202, body: { runId: "run-1" } },
    });

    await client.cancelRun("run-1");

    expect(calls.at(-1)?.url).toBe("http://server/api/runs/run-1/cancel");
    expect(calls.at(-1)?.init?.method).toBe("POST");
  });

  it("returns undefined for a run the server does not know", async () => {
    const { client } = build({
      "/api/runs/ghost": { status: 404, body: { error: "Run not found" } },
    });

    await expect(client.getRun("ghost")).resolves.toBeUndefined();
  });

  it("builds a screenshot query", async () => {
    const { client, calls } = build({ "/api/screenshots": { body: [] } });

    await client.listScreenshots({ search: "button", category: "changed" });

    expect(calls.at(-1)?.url).toContain("search=button");
    expect(calls.at(-1)?.url).toContain("category=changed");
  });

  it("fetches one screenshot by id", async () => {
    const { client, calls } = build({
      "/api/screenshots/abc": {
        body: {
          id: "abc",
          name: "Button/Primary",
          category: "passed",
          actualPath: "/assets/screenshots/actual/a.png",
          expectedPath: "/assets/screenshots/expected/a.png",
        },
      },
    });

    await expect(client.getScreenshot("abc")).resolves.toMatchObject({
      id: "abc",
      name: "Button/Primary",
    });
    expect(calls.at(-1)?.url).toBe("http://server/api/screenshots/abc");
  });

  it("keeps next/prev on a single screenshot", async () => {
    // zod strips unknown keys, so a field the server sends but the schema does
    // not describe disappears silently — which is exactly how the review UI's
    // arrow-key navigation would break without anyone noticing.
    const { client } = build({
      "/api/screenshots/abc": {
        body: {
          id: "abc",
          name: "b",
          category: "new",
          actualPath: "/a.png",
          next: "def",
          prev: "xyz",
        },
      },
    });

    await expect(client.getScreenshot("abc")).resolves.toMatchObject({
      next: "def",
      prev: "xyz",
    });
  });

  it("encodes an id with characters that need it", async () => {
    const { client, calls } = build({
      "/api/screenshots": {
        body: { id: "a/b", name: "n", category: "new", actualPath: "/a.png" },
      },
    });

    await client.getScreenshot("a/b");

    expect(calls.at(-1)?.url).toBe("http://server/api/screenshots/a%2Fb");
  });

  it("returns undefined for a screenshot the server does not know", async () => {
    const { client } = build({
      "/api/screenshots/ghost": {
        status: 404,
        body: { error: "Screenshot not found" },
      },
    });

    await expect(client.getScreenshot("ghost")).resolves.toBeUndefined();
  });

  it("rethrows a non-404 from getScreenshot", async () => {
    const { client } = build({
      "/api/screenshots/boom": { status: 500, body: { error: "kaboom" } },
    });

    await expect(client.getScreenshot("boom")).rejects.toThrow(CappaHttpError);
  });

  it("reads the server config", async () => {
    const { client } = build({
      "/api/config": { body: { theme: "dark", readOnly: true } },
    });

    await expect(client.config()).resolves.toEqual({
      theme: "dark",
      readOnly: true,
    });
  });

  it("approves by name", async () => {
    const { client, calls } = build({
      "/api/screenshots/approve-batch": {
        body: { approved: ["a"], errors: [] },
      },
    });

    await expect(client.approve(["a"])).resolves.toEqual({
      approved: ["a"],
      errors: [],
    });
    expect(calls.at(-1)?.init?.body).toBe(JSON.stringify({ names: ["a"] }));
  });

  it("sends the access token as a header, never in the URL", async () => {
    const { client, calls } = build({ "/api/plugins": { body: [] } }, "s3cret");

    await client.listPlugins();

    for (const call of calls) {
      expect(call.init?.headers).toMatchObject({ "x-cappa-token": "s3cret" });
      expect(call.url).not.toContain("s3cret");
    }
  });
});

describe("RemoteEngine protocol handshake", () => {
  it("checks the server version once and caches the result", async () => {
    const { client, calls } = build({ "/api/plugins": { body: [] } });

    await client.listPlugins();
    await client.listPlugins();

    const healthCalls = calls.filter((call) =>
      call.url.endsWith("/api/health"),
    );
    expect(healthCalls).toHaveLength(1);
  });

  it("fails loudly against a server on another protocol version", async () => {
    const { doFetch } = fakeFetch({
      "/api/health": {
        body: {
          ok: true,
          protocolVersion: PROTOCOL_VERSION + 1,
          capabilities: { capture: true, approve: true, events: true },
        },
      },
      "/api/plugins": { body: [] },
    });
    const client = createClient({ baseUrl: "http://server", fetch: doFetch });

    await expect(client.listPlugins()).rejects.toBeInstanceOf(
      ProtocolMismatchError,
    );
  });

  it("can skip the handshake", async () => {
    const { doFetch, calls } = fakeFetch({ "/api/plugins": { body: [] } });
    const client = createClient({
      baseUrl: "http://server",
      fetch: doFetch,
      checkProtocolVersion: false,
    });

    await client.listPlugins();

    expect(calls.every((call) => !call.url.endsWith("/api/health"))).toBe(true);
  });

  it("does not version-check the health call itself", async () => {
    const { client, calls } = build({});

    await client.health();

    expect(calls).toHaveLength(1);
  });

  it("does not cache a failed handshake", async () => {
    // A 401 handshake used to be cached like a successful one, so the first
    // unauthenticated call poisoned every later call for the lifetime of the
    // client — including ones made after the token arrived.
    const { doFetch } = fakeFetch({
      "/api/health": [
        { status: 401, body: { error: "Unauthorized" } },
        {
          body: {
            ok: true,
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { capture: true, approve: true, events: true },
          },
        },
      ],
      "/api/plugins": { body: [] },
    });
    const client = createClient({ baseUrl: "http://server", fetch: doFetch });

    await expect(client.listPlugins()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(client.listPlugins()).resolves.toEqual([]);
  });

  it("still caches a version mismatch, which cannot resolve itself", async () => {
    const { doFetch, calls } = fakeFetch({
      "/api/health": {
        body: {
          ok: true,
          protocolVersion: PROTOCOL_VERSION + 1,
          capabilities: { capture: true, approve: true, events: true },
        },
      },
      "/api/plugins": { body: [] },
    });
    const client = createClient({ baseUrl: "http://server", fetch: doFetch });

    await expect(client.listPlugins()).rejects.toBeInstanceOf(
      ProtocolMismatchError,
    );
    await expect(client.listPlugins()).rejects.toBeInstanceOf(
      ProtocolMismatchError,
    );

    expect(
      calls.filter((call) => call.url.endsWith("/api/health")),
    ).toHaveLength(1);
  });
});

describe("RemoteEngine errors", () => {
  it("maps a 401 onto UnauthorizedError", async () => {
    // By status, not by an error code: the server's auth hook rejects before
    // any route runs, so the body carries no cappa code to key off.
    const { doFetch } = fakeFetch({
      "/api/health": { status: 401, body: { error: "Unauthorized" } },
    });
    const client = createClient({ baseUrl: "http://server", fetch: doFetch });

    const error = await client.health().catch((caught) => caught);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.status).toBe(401);
  });

  it("maps a 409 onto RunInProgressError", async () => {
    const { client } = build({
      "/api/runs": {
        status: 409,
        body: {
          error: "already running",
          code: ERROR_CODES.runInProgress,
          activeRunId: "run-7",
        },
      },
    });

    const error = await client.startRun().catch((e) => e);

    expect(error).toBeInstanceOf(RunInProgressError);
    expect(error.activeRunId).toBe("run-7");
    expect(error.status).toBe(409);
  });

  it("maps a coded 400 onto UnknownTargetsError", async () => {
    const { client } = build({
      "/api/runs": {
        status: 400,
        body: {
          error: "Unknown task ids: ghost",
          code: ERROR_CODES.unknownTargets,
          taskIds: ["ghost"],
        },
      },
    });

    const error = await client.startRun({ taskIds: ["ghost"] }).catch((e) => e);

    expect(error).toBeInstanceOf(UnknownTargetsError);
    expect(error.taskIds).toEqual(["ghost"]);
  });

  it("falls back to a generic HTTP error", async () => {
    const { client } = build({
      "/api/plugins": { status: 500, body: { error: "boom" } },
    });

    const error = await client.listPlugins().catch((e) => e);

    expect(error).toBeInstanceOf(CappaHttpError);
    expect(error.status).toBe(500);
    expect(error.message).toBe("boom");
  });

  it("survives an error response that is not JSON", async () => {
    const doFetch: FetchLike = async (url) =>
      url.endsWith("/api/health")
        ? new Response(JSON.stringify(healthRoute["/api/health"].body), {
            headers: { "content-type": "application/json" },
          })
        : new Response("<html>502</html>", { status: 502 });

    const client = createClient({ baseUrl: "http://server", fetch: doFetch });

    const error = await client.listPlugins().catch((e) => e);

    expect(error).toBeInstanceOf(CappaHttpError);
    expect(error.status).toBe(502);
  });

  it("rejects a response that does not match the schema", async () => {
    const { client } = build({
      "/api/plugins": { body: [{ nope: true }] },
    });

    await expect(client.listPlugins()).rejects.toThrow();
  });
});

const sseFrames = (
  events: Array<Record<string, unknown> & { seq: number }>,
): string =>
  events
    .map((event) => `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");

const runEvent = (seq: number, type = "log") => ({
  seq,
  runId: "run-1",
  at: 0,
  type,
  ...(type === "log"
    ? { level: "info", message: "hello", args: [] }
    : type === "run:complete"
      ? {
          summary: {
            id: "run-1",
            state: "completed",
            request: {},
            startedAt: 0,
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            deletedScreenshots: [],
            anyTasksRan: false,
          },
        }
      : {}),
});

const flush = async (ms = 40) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("RemoteEngine event stream", () => {
  it("delivers events from the stream", async () => {
    const { client } = build({
      "/api/runs/run-1/events": {
        stream: sseFrames([runEvent(1), runEvent(2, "run:complete")]),
      },
    });

    const seen: number[] = [];
    client.subscribeRun("run-1", (event) => seen.push(event.seq));
    await flush();

    expect(seen).toEqual([1, 2]);
  });

  it("resumes from sinceSeq", async () => {
    const { client, calls } = build({
      "/api/runs/run-1/events": {
        stream: sseFrames([runEvent(3, "run:complete")]),
      },
    });

    client.subscribeRun("run-1", () => {}, { sinceSeq: 2 });
    await flush();

    expect(calls.at(-1)?.url).toContain("sinceSeq=2");
  });

  it("reconnects from the last event it saw when the stream drops", async () => {
    const { client, calls } = build({
      "/api/runs/run-1/events": [
        // First connection ends without a terminal event.
        { stream: sseFrames([runEvent(1), runEvent(2)]) },
        { stream: sseFrames([runEvent(3, "run:complete")]) },
      ],
    });

    const seen: number[] = [];
    client.subscribeRun("run-1", (event) => seen.push(event.seq));
    await flush(120);

    expect(seen).toEqual([1, 2, 3]);
    const streamCalls = calls.filter((call) => call.url.includes("/events"));
    expect(streamCalls).toHaveLength(2);
    // The retry must not replay what was already delivered.
    expect(streamCalls[1]?.url).toContain("sinceSeq=2");
  });

  it("stops streaming once the run reaches a terminal event", async () => {
    const { client, calls } = build({
      "/api/runs/run-1/events": {
        stream: sseFrames([runEvent(1, "run:complete")]),
      },
    });

    client.subscribeRun("run-1", () => {});
    await flush(120);

    expect(calls.filter((call) => call.url.includes("/events"))).toHaveLength(
      1,
    );
  });

  it("stops on unsubscribe", async () => {
    const { client, calls } = build({
      "/api/runs/run-1/events": { stream: sseFrames([runEvent(1)]) },
    });

    const unsubscribe = client.subscribeRun("run-1", () => {});
    unsubscribe();
    await flush(120);

    expect(
      calls.filter((call) => call.url.includes("/events")).length,
    ).toBeLessThanOrEqual(1);
  });

  it("reports stream failures without giving up", async () => {
    const { client } = build({
      "/api/runs/run-1/events": [
        { status: 500, body: { error: "boom" } },
        { stream: sseFrames([runEvent(1, "run:complete")]) },
      ],
    });

    const onError = vi.fn();
    const seen: number[] = [];
    client.subscribeRun("run-1", (event) => seen.push(event.seq), { onError });
    await flush(140);

    expect(onError).toHaveBeenCalled();
    expect(seen).toEqual([1]);
  });

  it("skips a frame that is not a valid event", async () => {
    const { client } = build({
      "/api/runs/run-1/events": {
        stream: `id: 1\ndata: {"type":"garbage"}\n\n${sseFrames([
          runEvent(2, "run:complete"),
        ])}`,
      },
    });

    const onError = vi.fn();
    const seen: number[] = [];
    client.subscribeRun("run-1", (event) => seen.push(event.seq), { onError });
    await flush();

    expect(onError).toHaveBeenCalled();
    expect(seen).toEqual([2]);
  });

  it("skips an unknown event type without reporting it per event", async () => {
    const unknown = (seq: number) =>
      `id: ${seq}\ndata: ${JSON.stringify({
        seq,
        runId: "run-1",
        at: 0,
        type: "watch:change",
        files: ["src/Button.tsx"],
      })}\n\n`;

    const { client } = build({
      "/api/runs/run-1/events": {
        stream: `${unknown(1)}${unknown(2)}${sseFrames([
          runEvent(3, "run:complete"),
        ])}`,
      },
    });

    const onError = vi.fn();
    const seen: number[] = [];
    client.subscribeRun("run-1", (event) => seen.push(event.seq), { onError });
    await flush();

    expect(seen).toEqual([3]);
    // Two unknown frames, one report: the fact is about the connection, not
    // about each event.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(UnknownEventTypeError);
    expect(onError.mock.calls[0][0].eventType).toBe("watch:change");
  });

  it("resumes past an unknown event rather than replaying it", async () => {
    const unknownFrame = `id: 2\ndata: ${JSON.stringify({
      seq: 2,
      runId: "run-1",
      at: 0,
      type: "watch:change",
    })}\n\n`;

    const { client, calls } = build({
      "/api/runs/run-1/events": [
        // Drops after an unknown event, with no terminal event.
        { stream: `${sseFrames([runEvent(1)])}${unknownFrame}` },
        { stream: sseFrames([runEvent(3, "run:complete")]) },
      ],
    });

    const seen: number[] = [];
    client.subscribeRun("run-1", (event) => seen.push(event.seq));
    await flush(120);

    expect(seen).toEqual([1, 3]);
    const streamCalls = calls.filter((call) => call.url.includes("/events"));
    // 2, not 1: the unknown event advanced the resume position.
    expect(streamCalls[1]?.url).toContain("sinceSeq=2");
  });

  it("still reports a known event type with an invalid body", async () => {
    const { client } = build({
      "/api/runs/run-1/events": {
        stream: `id: 1\ndata: ${JSON.stringify({
          seq: 1,
          runId: "run-1",
          at: 0,
          type: "task:complete",
        })}\n\n${sseFrames([runEvent(2, "run:complete")])}`,
      },
    });

    const onError = vi.fn();
    const seen: number[] = [];
    client.subscribeRun("run-1", (event) => seen.push(event.seq), { onError });
    await flush();

    expect(seen).toEqual([2]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).not.toBeInstanceOf(UnknownEventTypeError);
  });

  it("close() tears down every live stream", async () => {
    const { client } = build({
      "/api/runs/run-1/events": { stream: sseFrames([runEvent(1)]) },
    });

    client.subscribeRun("run-1", () => {});
    await client.close();

    expect(client.isClosed).toBe(true);
  });
});
