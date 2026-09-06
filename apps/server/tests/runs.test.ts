import { RunInProgressError, UnknownTargetsError } from "@cappa/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import { createFakeEngine, detail, type FakeEngine } from "./fakeEngine";

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

describe("GET /api/plugins", () => {
  it("lists the engine's plugins", async () => {
    const engine = createFakeEngine();
    engine.plugins = [{ name: "storybook", description: "stories" }];
    const { app } = await build(engine);

    const response = await app.inject({ url: "/api/plugins" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { name: "storybook", description: "stories" },
    ]);
  });
});

describe("GET /api/targets", () => {
  it("lists discovered targets", async () => {
    const engine = createFakeEngine();
    engine.targets = [{ id: "a", url: "http://x/a", plugin: "p" }];
    const { app } = await build(engine);

    const response = await app.inject({ url: "/api/targets" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(engine.targets);
    expect(engine.listTargets).toHaveBeenCalledWith({ refresh: false });
  });

  it("forwards a refresh request", async () => {
    const { app, engine } = await build();

    await app.inject({ url: "/api/targets?refresh=1" });

    expect(engine.listTargets).toHaveBeenCalledWith({ refresh: true });
  });

  it("treats refresh=false as no refresh", async () => {
    const { app, engine } = await build();

    await app.inject({ url: "/api/targets?refresh=false" });

    expect(engine.listTargets).toHaveBeenCalledWith({ refresh: false });
  });

  it("returns 409 when a run holds the browser and nothing is cached", async () => {
    const engine = createFakeEngine();
    vi.mocked(engine.listTargets).mockRejectedValue(
      new RunInProgressError("run-9"),
    );
    const { app } = await build(engine);

    const response = await app.inject({ url: "/api/targets" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ activeRunId: "run-9" });
  });
});

describe("POST /api/runs", () => {
  it("starts a run and returns its id", async () => {
    const { app, engine } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { filter: "button*" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ runId: "run-1" });
    expect(engine.startRun).toHaveBeenCalledWith({ filter: "button*" });
  });

  it("accepts an empty body", async () => {
    const { app, engine } = await build();

    const response = await app.inject({ method: "POST", url: "/api/runs" });

    expect(response.statusCode).toBe(201);
    expect(engine.startRun).toHaveBeenCalledWith({});
  });

  it("rejects a malformed request body", async () => {
    const { app, engine } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { taskIds: "not-an-array" },
    });

    expect(response.statusCode).toBe(400);
    expect(engine.startRun).not.toHaveBeenCalled();
  });

  it("returns 409 when a run is already in progress", async () => {
    const engine = createFakeEngine();
    vi.mocked(engine.startRun).mockRejectedValue(
      new RunInProgressError("run-7"),
    );
    const { app } = await build(engine);

    const response = await app.inject({ method: "POST", url: "/api/runs" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ activeRunId: "run-7" });
  });

  it("returns 400 for task ids that were never discovered", async () => {
    const engine = createFakeEngine();
    vi.mocked(engine.startRun).mockRejectedValue(
      new UnknownTargetsError(["ghost"]),
    );
    const { app } = await build(engine);

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { taskIds: ["ghost"] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ taskIds: ["ghost"] });
  });

  it("refuses to capture in read-only mode", async () => {
    const { app, engine } = await build(createFakeEngine(), {
      readOnly: true,
    });

    const response = await app.inject({ method: "POST", url: "/api/runs" });

    expect(response.statusCode).toBe(403);
    expect(engine.startRun).not.toHaveBeenCalled();
  });
});

describe("GET /api/runs", () => {
  it("lists runs", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { app } = await build(engine);

    const response = await app.inject({ url: "/api/runs" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it("returns one run's detail", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1", { state: "completed" }));
    const { app } = await build(engine);

    const response = await app.inject({ url: "/api/runs/run-1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "run-1", state: "completed" });
  });

  it("404s for an unknown run", async () => {
    const { app } = await build();

    expect((await app.inject({ url: "/api/runs/nope" })).statusCode).toBe(404);
  });
});

describe("POST /api/runs/:id/cancel", () => {
  it("cancels a known run", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { app } = await build(engine);

    const response = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/cancel",
    });

    expect(response.statusCode).toBe(202);
    expect(engine.cancelRun).toHaveBeenCalledWith("run-1");
  });

  it("404s for an unknown run", async () => {
    const { app, engine } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/runs/nope/cancel",
    });

    expect(response.statusCode).toBe(404);
    expect(engine.cancelRun).not.toHaveBeenCalled();
  });

  it("refuses in read-only mode", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { app } = await build(engine, { readOnly: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/cancel",
    });

    expect(response.statusCode).toBe(403);
    expect(engine.cancelRun).not.toHaveBeenCalled();
  });
});

/**
 * SSE needs a real socket: `inject` resolves only once a response ends, and an
 * event stream deliberately never does.
 */
describe("GET /api/runs/:id/events", () => {
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
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    return { app, baseUrl: address };
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

  it("404s for an unknown run", async () => {
    const { baseUrl } = await listen(createFakeEngine());

    const response = await fetch(`${baseUrl}/api/runs/nope/events`);

    expect(response.status).toBe(404);
    await response.body?.cancel();
  });

  it("streams events with the right headers", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { baseUrl } = await listen(engine);

    const response = await fetch(`${baseUrl}/api/runs/run-1/events`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");

    engine.emit("run-1", { seq: 1, type: "task:start" } as never);
    engine.emit("run-1", { seq: 2, type: "run:complete" } as never);

    const events = await readEvents(response, 2);
    expect(events).toMatchObject([
      { seq: 1, type: "task:start" },
      { seq: 2, type: "run:complete" },
    ]);
  });

  it("replays buffered events to a subscriber that connects late", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { baseUrl } = await listen(engine);

    engine.emit("run-1", { seq: 1, type: "run:start" } as never);
    engine.emit("run-1", { seq: 2, type: "task:start" } as never);

    const response = await fetch(`${baseUrl}/api/runs/run-1/events`);
    const events = await readEvents(response, 2);

    expect(events).toMatchObject([{ seq: 1 }, { seq: 2 }]);
  });

  it("resumes from Last-Event-ID", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { baseUrl } = await listen(engine);

    engine.emit("run-1", { seq: 1, type: "run:start" } as never);
    engine.emit("run-1", { seq: 2, type: "task:start" } as never);
    engine.emit("run-1", { seq: 3, type: "run:complete" } as never);

    const response = await fetch(`${baseUrl}/api/runs/run-1/events`, {
      headers: { "Last-Event-ID": "2" },
    });
    const events = await readEvents(response, 1);

    expect(events).toMatchObject([{ seq: 3 }]);
  });

  it("resumes from a sinceSeq query parameter", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { baseUrl } = await listen(engine);

    engine.emit("run-1", { seq: 1, type: "run:start" } as never);
    engine.emit("run-1", { seq: 2, type: "run:complete" } as never);

    const response = await fetch(`${baseUrl}/api/runs/run-1/events?sinceSeq=1`);
    const events = await readEvents(response, 1);

    expect(events).toMatchObject([{ seq: 2 }]);
  });

  it("carries the sequence number as the SSE id so browsers can resume", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { baseUrl } = await listen(engine);

    engine.emit("run-1", { seq: 42, type: "run:complete" } as never);

    const response = await fetch(`${baseUrl}/api/runs/run-1/events`);
    const reader = response.body?.getReader();
    const { value } = (await reader?.read()) ?? {};
    const text = new TextDecoder().decode(value);

    expect(text).toContain("id: 42");
    await reader?.cancel();
  });

  it("unsubscribes when the client disconnects", async () => {
    const engine = createFakeEngine();
    engine.runs.set("run-1", detail("run-1"));
    const { baseUrl } = await listen(engine);

    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/runs/run-1/events`, {
      signal: controller.signal,
    });
    engine.emit("run-1", { seq: 1, type: "run:start" } as never);
    await readEvents(response, 1);

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Emitting after the client is gone must not throw on a closed socket.
    expect(() =>
      engine.emit("run-1", { seq: 2, type: "run:complete" } as never),
    ).not.toThrow();
  });
});
