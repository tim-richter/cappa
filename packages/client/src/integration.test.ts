import type {
  ApproveResult,
  CaptureEngine,
  PluginInfo,
  RunDetail,
  RunEvent,
  RunSummary,
  Screenshot,
  ScreenshotQuery,
  StartRunRequest,
  StartWatchRequest,
  SubscribeOptions,
  Target,
  WatchEvent,
  WatchStatus,
} from "@cappa/core";
import {
  RunInProgressError as EngineRunInProgressError,
  WatchInProgressError as EngineWatchInProgressError,
} from "@cappa/core";
import { createServer } from "@cappa/server";
import { afterEach, describe, expect, it } from "vitest";
import { createClient, type RemoteEngine } from "./client";
import { RunInProgressError } from "./errors";

/**
 * The client and the server are developed against `@cappa/protocol` rather than
 * against each other, which is exactly how they could silently disagree. These
 * tests run the real client against the real Fastify app over a real socket,
 * with only the browser stubbed out.
 */

const summary = (
  id: string,
  overrides: Partial<RunSummary> = {},
): RunSummary => ({
  id,
  state: "running",
  request: {},
  startedAt: 1,
  totalTasks: 2,
  completedTasks: 0,
  failedTasks: 0,
  deletedScreenshots: [],
  anyTasksRan: true,
  ...overrides,
});

/** An engine with a scripted event stream and no Playwright behind it. */
const createScriptedEngine = () => {
  const listeners = new Map<string, Set<(event: RunEvent) => void>>();
  const buffered = new Map<string, RunEvent[]>();
  const runs = new Map<string, RunDetail>();

  const screenshots: Screenshot[] = [
    {
      id: "1",
      name: "button",
      category: "new",
      actualPath: "actual/button.png",
    },
    {
      id: "2",
      name: "card",
      category: "changed",
      actualPath: "actual/card.png",
      expectedPath: "expected/card.png",
      diffPath: "diff/card.png",
      diffMeta: { numDiffPixels: 12, percentDifference: 0.4 },
    },
  ];

  let conflictOnNextRun = false;
  let watching = false;
  const watchListeners = new Set<(event: WatchEvent) => void>();
  const watchEvents: WatchEvent[] = [];

  const emit = (runId: string, event: RunEvent) => {
    buffered.set(runId, [...(buffered.get(runId) ?? []), event]);
    for (const listener of listeners.get(runId) ?? []) {
      listener(event);
    }
  };

  const emitWatch = (event: WatchEvent) => {
    watchEvents.push(event);
    for (const listener of watchListeners) {
      listener(event);
    }
  };

  const engine: CaptureEngine & {
    emit: typeof emit;
    emitWatch: typeof emitWatch;
    setConflict: (value: boolean) => void;
    screenshots: Screenshot[];
  } = {
    emit,
    emitWatch,
    setConflict: (value: boolean) => {
      conflictOnNextRun = value;
    },
    screenshots,

    async listPlugins(): Promise<PluginInfo[]> {
      return [{ name: "fixture", description: "a fixture plugin" }];
    },

    async listTargets(): Promise<Target[]> {
      return [
        { id: "page--a", url: "http://x/a", plugin: "fixture" },
        { id: "page--b", url: "http://x/b", plugin: "fixture" },
      ];
    },

    async startRun(request: StartRunRequest = {}): Promise<RunSummary> {
      if (conflictOnNextRun) {
        throw new EngineRunInProgressError("run-active");
      }
      const run = summary("run-1", { request });
      runs.set(run.id, { ...run, tasks: [], failures: [] });
      return run;
    },

    async getRun(id: string) {
      return runs.get(id);
    },

    async listRuns() {
      return [...runs.values()];
    },

    async cancelRun(id: string) {
      const run = runs.get(id);
      if (run) {
        runs.set(id, { ...run, state: "cancelled" });
      }
    },

    subscribeRun(
      id: string,
      onEvent: (event: RunEvent) => void,
      options: SubscribeOptions = {},
    ) {
      const sinceSeq = options.sinceSeq ?? 0;
      for (const event of buffered.get(id) ?? []) {
        if (event.seq > sinceSeq) {
          onEvent(event);
        }
      }

      const set = listeners.get(id) ?? new Set();
      set.add(onEvent);
      listeners.set(id, set);
      return () => set.delete(onEvent);
    },

    async listScreenshots(query: ScreenshotQuery = {}) {
      let result = engine.screenshots;
      if (query.category) {
        result = result.filter((s) => s.category === query.category);
      }
      if (query.search) {
        const term = query.search.toLowerCase();
        result = result.filter((s) => s.name.toLowerCase().includes(term));
      }
      return result;
    },

    async approve(names: string[]): Promise<ApproveResult> {
      return { approved: names, errors: [] };
    },

    async startWatch(request: StartWatchRequest = {}): Promise<WatchStatus> {
      if (watching) {
        throw new EngineWatchInProgressError();
      }
      watching = true;
      const status: WatchStatus = {
        active: true,
        paths: request.paths ?? ["."],
        filter: request.filter,
        debounceMs: request.debounceMs ?? 300,
        startedAt: 1,
      };
      emitWatch({
        type: "watch:start",
        seq: watchEvents.length + 1,
        at: 0,
        paths: status.paths,
        filter: status.filter,
        debounceMs: status.debounceMs,
      });
      return status;
    },

    async stopWatch(): Promise<WatchStatus> {
      watching = false;
      return { active: false, paths: ["."], debounceMs: 300 };
    },

    async getWatchStatus(): Promise<WatchStatus> {
      return { active: watching, paths: ["."], debounceMs: 300 };
    },

    subscribeWatch(
      onEvent: (event: WatchEvent) => void,
      options: SubscribeOptions = {},
    ) {
      const sinceSeq = options.sinceSeq ?? 0;
      for (const event of watchEvents) {
        if (event.seq > sinceSeq) {
          onEvent(event);
        }
      }
      watchListeners.add(onEvent);
      return () => watchListeners.delete(onEvent);
    },

    async close() {},
  };

  return engine;
};

const logEvent = (seq: number): RunEvent =>
  ({
    seq,
    runId: "run-1",
    at: 0,
    type: "log",
    level: "info",
    message: `event ${seq}`,
    args: [],
  }) as RunEvent;

const completeEvent = (seq: number): RunEvent =>
  ({
    seq,
    runId: "run-1",
    at: 0,
    type: "run:complete",
    summary: summary("run-1", { state: "completed" }),
  }) as RunEvent;

describe("client against a live server", () => {
  const running: Array<{
    app: Awaited<ReturnType<typeof createServer>>;
    client: RemoteEngine;
  }> = [];

  afterEach(async () => {
    for (const { app, client } of running.splice(0)) {
      await client.close();
      await app.close();
    }
  });

  const start = async (
    engine = createScriptedEngine(),
    options: { token?: string; readOnly?: boolean } = {},
  ) => {
    const app = await createServer({
      engine,
      outputDir: "dist/screenshots",
      logger: false,
      ...options,
    });
    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    const client = createClient({
      baseUrl,
      token: options.token,
      reconnectDelayMs: 20,
    });
    running.push({ app, client });
    return { engine, client, app, baseUrl };
  };

  it("agrees on the protocol version", async () => {
    const { client } = await start();

    const health = await client.health();

    expect(health.ok).toBe(true);
    expect(health.capabilities).toEqual({
      capture: true,
      approve: true,
      events: true,
      watch: true,
    });
  });

  it("reads config", async () => {
    const { client } = await start();

    await expect(client.config()).resolves.toEqual({
      theme: "light",
      readOnly: false,
    });
  });

  it("round-trips plugins and targets", async () => {
    const { client } = await start();

    await expect(client.listPlugins()).resolves.toEqual([
      { name: "fixture", description: "a fixture plugin" },
    ]);
    await expect(client.listTargets()).resolves.toHaveLength(2);
  });

  it("starts a run and reads it back", async () => {
    const { client } = await start();

    const run = await client.startRun({ filter: "page--a" });

    expect(run.id).toBe("run-1");
    await expect(client.getRun("run-1")).resolves.toMatchObject({
      id: "run-1",
    });
    await expect(client.listRuns()).resolves.toHaveLength(1);
  });

  it("maps the server's 409 back onto RunInProgressError", async () => {
    const { engine, client } = await start();
    engine.setConflict(true);

    const error = await client.startRun().catch((e) => e);

    expect(error).toBeInstanceOf(RunInProgressError);
    expect(error.activeRunId).toBe("run-active");
  });

  it("cancels a run", async () => {
    const { client } = await start();
    await client.startRun();

    await client.cancelRun("run-1");

    await expect(client.getRun("run-1")).resolves.toMatchObject({
      state: "cancelled",
    });
  });

  it("streams live events end to end", async () => {
    const { engine, client } = await start();
    await client.startRun();

    const seen: RunEvent[] = [];
    const done = new Promise<void>((resolve) => {
      client.subscribeRun("run-1", (event) => {
        seen.push(event);
        if (event.type === "run:complete") {
          resolve();
        }
      });
    });

    // Give the stream a moment to attach before emitting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    engine.emit("run-1", logEvent(1));
    engine.emit("run-1", completeEvent(2));

    await done;

    expect(seen.map((event) => event.seq)).toEqual([1, 2]);
  });

  it("replays buffered events to a subscriber that attaches late", async () => {
    const { engine, client } = await start();
    await client.startRun();

    engine.emit("run-1", logEvent(1));
    engine.emit("run-1", logEvent(2));
    engine.emit("run-1", completeEvent(3));

    const seen: number[] = [];
    await new Promise<void>((resolve) => {
      client.subscribeRun("run-1", (event) => {
        seen.push(event.seq);
        if (event.type === "run:complete") {
          resolve();
        }
      });
    });

    expect(seen).toEqual([1, 2, 3]);
  });

  it("resumes from sinceSeq across the real wire", async () => {
    const { engine, client } = await start();
    await client.startRun();

    engine.emit("run-1", logEvent(1));
    engine.emit("run-1", logEvent(2));
    engine.emit("run-1", completeEvent(3));

    const seen: number[] = [];
    await new Promise<void>((resolve) => {
      client.subscribeRun(
        "run-1",
        (event) => {
          seen.push(event.seq);
          if (event.type === "run:complete") {
            resolve();
          }
        },
        { sinceSeq: 2 },
      );
    });

    expect(seen).toEqual([3]);
  });

  it("round-trips screenshots including the diff interpretation blob", async () => {
    const { client } = await start();

    const screenshots = await client.listScreenshots();

    expect(screenshots).toHaveLength(2);
    // The server rewrites paths to asset URLs; the schema must not reject that.
    expect(screenshots[0]).toMatchObject({
      name: "button",
      actualPath: "/assets/screenshots/actual/button.png",
    });
    expect(screenshots[1]).toMatchObject({
      diffMeta: { numDiffPixels: 12 },
    });
  });

  it("filters screenshots server-side", async () => {
    const { client } = await start();

    await expect(
      client.listScreenshots({ category: "changed" }),
    ).resolves.toHaveLength(1);
    await expect(
      client.listScreenshots({ search: "butt" }),
    ).resolves.toHaveLength(1);
  });

  it("fetches one screenshot by id, with its neighbours", async () => {
    const { client } = await start();

    const screenshot = await client.getScreenshot("2");

    expect(screenshot).toMatchObject({
      id: "2",
      name: "card",
      category: "changed",
      // Rewritten to an asset URL by the server, as in the list response.
      diffPath: "/assets/screenshots/diff/card.png",
      prev: "1",
    });
  });

  it("returns undefined rather than throwing for an unknown id", async () => {
    const { client } = await start();

    await expect(client.getScreenshot("nope")).resolves.toBeUndefined();
  });

  it("serves a single screenshot on a read-only server", async () => {
    // Reading is not a mutation; only capture and approval are refused.
    const { client } = await start(createScriptedEngine(), { readOnly: true });

    await expect(client.getScreenshot("1")).resolves.toMatchObject({
      name: "button",
    });
  });

  it("approves through the batch endpoint", async () => {
    const { client } = await start();

    await expect(client.approve(["button"])).resolves.toEqual({
      approved: ["button"],
      errors: [],
    });
  });

  it("authenticates with a token", async () => {
    const { client } = await start(createScriptedEngine(), {
      token: "s3cret",
    });

    await expect(client.listPlugins()).resolves.toHaveLength(1);
  });

  it("fails cleanly without the token the server requires", async () => {
    const engine = createScriptedEngine();
    const app = await createServer({
      engine,
      outputDir: "dist/screenshots",
      logger: false,
      token: "s3cret",
    });
    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    const client = createClient({ baseUrl });
    running.push({ app, client });

    const error = await client.listPlugins().catch((e) => e);

    expect(error.status).toBe(401);
  });

  it("surfaces read-only refusals", async () => {
    const { client } = await start(createScriptedEngine(), { readOnly: true });

    const error = await client.startRun().catch((e) => e);

    expect(error.status).toBe(403);
  });

  it("starts, reads and stops a watch session", async () => {
    const { client } = await start();

    await expect(client.getWatchStatus()).resolves.toMatchObject({
      active: false,
    });

    const started = await client.startWatch({ filter: "button*" });
    expect(started).toMatchObject({ active: true, filter: "button*" });
    await expect(client.getWatchStatus()).resolves.toMatchObject({
      active: true,
    });

    await client.stopWatch();
    await expect(client.getWatchStatus()).resolves.toMatchObject({
      active: false,
    });
  });

  it("streams watch events, replaying what a late subscriber missed", async () => {
    const { engine, client } = await start();

    await client.startWatch();

    const seen: WatchEvent[] = [];
    const unsubscribe = client.subscribeWatch((event) => seen.push(event));

    // Give the stream a moment to attach and replay `watch:start`.
    await new Promise((resolve) => setTimeout(resolve, 60));

    engine.emitWatch({
      type: "watch:change",
      seq: 2,
      at: 0,
      files: ["src/Button.stories.tsx"],
      scope: "tasks",
      taskIds: ["button--primary"],
      runId: "run-1",
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    unsubscribe();

    expect(seen.map((event) => event.type)).toEqual([
      "watch:start",
      "watch:change",
    ]);
    expect(seen[1]).toMatchObject({ runId: "run-1", scope: "tasks" });
  });

  it("reports a second watch session as a conflict", async () => {
    const { client } = await start();

    await client.startWatch();
    const error = await client.startWatch().catch((e) => e);

    expect(error.status).toBe(409);
  });

  it("refuses to watch on a read-only server", async () => {
    const { client } = await start(createScriptedEngine(), { readOnly: true });

    const error = await client.startWatch().catch((e) => e);

    expect(error.status).toBe(403);
    // And says so up front, rather than only when asked to start.
    await expect(client.health()).resolves.toMatchObject({
      capabilities: { watch: false },
    });
  });

  it("answers 501 when the engine cannot watch at all", async () => {
    const engine = createScriptedEngine();
    // A server whose engine has no watch support — a remote engine, say.
    (engine as { startWatch?: unknown }).startWatch = undefined;
    (engine as { subscribeWatch?: unknown }).subscribeWatch = undefined;

    const { client } = await start(engine);

    const error = await client.startWatch().catch((e) => e);

    expect(error.status).toBe(501);
    await expect(client.health()).resolves.toMatchObject({
      capabilities: { watch: false },
    });
  });
});

describe("screenshot view fields survive the wire", () => {
  const running: Array<{
    app: Awaited<ReturnType<typeof createServer>>;
    client: RemoteEngine;
  }> = [];

  afterEach(async () => {
    for (const { app, client } of running.splice(0)) {
      await client.close();
      await app.close();
    }
  });

  it("preserves next/prev and the derived approved flag", async () => {
    const engine = createScriptedEngine();
    engine.screenshots = [
      ...engine.screenshots,
      {
        id: "3",
        name: "footer",
        category: "passed",
        actualPath: "actual/footer.png",
        expectedPath: "expected/footer.png",
      },
    ];

    const app = await createServer({
      engine,
      outputDir: "dist/screenshots",
      logger: false,
    });
    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    const client = createClient({ baseUrl });
    running.push({ app, client });

    const screenshots = await client.listScreenshots();

    // Zod strips unknown keys, so anything the server adds has to be modelled
    // in the protocol or it disappears here.
    expect(screenshots[0]).toMatchObject({ next: "2" });
    expect(screenshots[1]).toMatchObject({ prev: "1", next: "3" });
    expect(screenshots[2]).toMatchObject({ prev: "2", approved: true });
    expect(screenshots[0]).toMatchObject({ approved: false });
  });
});
