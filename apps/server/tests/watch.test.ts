import type { WatchEvent } from "@cappa/core";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { createFakeEngine, type FakeEngine } from "./fakeEngine";

const build = async (
  engine: FakeEngine = createFakeEngine(),
  opts: Partial<Parameters<typeof createServer>[0]> = {},
) => {
  const app = await createServer({
    engine,
    outputDir: "dist/screenshots",
    logger: false,
    ...opts,
  });
  return { app, engine };
};

/** An engine that cannot see the files — a remote engine, for instance. */
const createUnwatchableEngine = (): FakeEngine => {
  const engine = createFakeEngine();
  engine.startWatch = undefined;
  engine.stopWatch = undefined;
  engine.getWatchStatus = undefined;
  engine.subscribeWatch = undefined;
  return engine;
};

describe("GET /api/watch", () => {
  it("reports an idle session", async () => {
    const { app } = await build();

    const response = await app.inject({ url: "/api/watch" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ active: false });
  });

  it("answers 501 when the engine cannot watch", async () => {
    const { app } = await build(createUnwatchableEngine());

    const response = await app.inject({ url: "/api/watch" });

    // 501, not 404: the route exists, this engine just has no filesystem to
    // offer, and a client deserves to be told which.
    expect(response.statusCode).toBe(501);
  });
});

describe("POST /api/watch", () => {
  it("starts a session with the requested options", async () => {
    const { app, engine } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/watch",
      payload: { filter: "button*", debounceMs: 500 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      active: true,
      filter: "button*",
      debounceMs: 500,
    });
    expect(engine.startWatch).toHaveBeenCalledWith({
      filter: "button*",
      debounceMs: 500,
    });
  });

  it("starts with defaults when given no body", async () => {
    const { app } = await build();

    const response = await app.inject({ method: "POST", url: "/api/watch" });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ active: true });
  });

  it("rejects a malformed request", async () => {
    const { app } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/watch",
      payload: { debounceMs: "soon" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("reports a second session as a conflict", async () => {
    const { app } = await build();

    await app.inject({ method: "POST", url: "/api/watch" });
    const response = await app.inject({ method: "POST", url: "/api/watch" });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("CAPPA_WATCH_IN_PROGRESS");
  });

  it("is refused on a read-only server", async () => {
    const { app, engine } = await build(createFakeEngine(), {
      readOnly: true,
    });

    const response = await app.inject({ method: "POST", url: "/api/watch" });

    expect(response.statusCode).toBe(403);
    expect(engine.startWatch).not.toHaveBeenCalled();
  });

  it("answers 501 when the engine cannot watch", async () => {
    const { app } = await build(createUnwatchableEngine());

    const response = await app.inject({ method: "POST", url: "/api/watch" });

    expect(response.statusCode).toBe(501);
  });
});

describe("DELETE /api/watch", () => {
  it("stops the session and answers the status it left", async () => {
    const { app, engine } = await build();

    await app.inject({ method: "POST", url: "/api/watch" });
    const response = await app.inject({ method: "DELETE", url: "/api/watch" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ active: false });
    expect(engine.stopWatch).toHaveBeenCalledOnce();
  });

  it("is a no-op when nothing is watching", async () => {
    const { app } = await build();

    const response = await app.inject({ method: "DELETE", url: "/api/watch" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ active: false });
  });

  it("is refused on a read-only server", async () => {
    const { app, engine } = await build(createFakeEngine(), {
      readOnly: true,
    });

    const response = await app.inject({ method: "DELETE", url: "/api/watch" });

    expect(response.statusCode).toBe(403);
    expect(engine.stopWatch).not.toHaveBeenCalled();
  });
});

describe("GET /api/watch/events", () => {
  const servers: Array<Awaited<ReturnType<typeof createServer>>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((app) => app.close()));
  });

  const listen = async (engine: FakeEngine) => {
    const app = await createServer({
      engine,
      outputDir: "dist/screenshots",
      logger: false,
    });
    servers.push(app);
    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    return { app, baseUrl };
  };

  /** Read SSE frames until `count` `data:` lines have arrived. */
  const readEvents = async (
    response: Response,
    count: number,
  ): Promise<unknown[]> => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("no body");
    }

    const decoder = new TextDecoder();
    const events: unknown[] = [];
    let buffer = "";

    while (events.length < count) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (dataLine) {
          events.push(JSON.parse(dataLine.slice(6)));
        }
        index = buffer.indexOf("\n\n");
      }
    }

    await reader.cancel();
    return events;
  };

  const change = (seq: number): WatchEvent => ({
    seq,
    at: 0,
    type: "watch:change",
    files: [`src/${seq}.tsx`],
    scope: "tasks",
    taskIds: ["a"],
    runId: `run-${seq}`,
  });

  it("streams watch events with the right headers", async () => {
    const engine = createFakeEngine();
    const { baseUrl } = await listen(engine);

    const response = await fetch(`${baseUrl}/api/watch/events`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    engine.emitWatch(change(1));
    engine.emitWatch(change(2));

    expect(await readEvents(response, 2)).toMatchObject([
      { seq: 1, type: "watch:change" },
      { seq: 2, runId: "run-2" },
    ]);
  });

  it("replays what a late subscriber missed", async () => {
    const engine = createFakeEngine();
    const { baseUrl } = await listen(engine);

    engine.emitWatch(change(1));
    engine.emitWatch(change(2));

    const response = await fetch(`${baseUrl}/api/watch/events`);

    expect(await readEvents(response, 2)).toMatchObject([
      { seq: 1 },
      { seq: 2 },
    ]);
  });

  it("resumes from Last-Event-ID", async () => {
    const engine = createFakeEngine();
    const { baseUrl } = await listen(engine);

    engine.emitWatch(change(1));
    engine.emitWatch(change(2));

    const response = await fetch(`${baseUrl}/api/watch/events`, {
      headers: { "Last-Event-ID": "1" },
    });

    expect(await readEvents(response, 1)).toMatchObject([{ seq: 2 }]);
  });

  it("answers 501 when the engine cannot watch", async () => {
    const { baseUrl } = await listen(createUnwatchableEngine());

    const response = await fetch(`${baseUrl}/api/watch/events`);

    expect(response.status).toBe(501);
    await response.body?.cancel();
  });
});
