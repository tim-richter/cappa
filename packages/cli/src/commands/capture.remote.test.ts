import type {
  ApproveResult,
  CaptureEngine,
  PluginInfo,
  RunDetail,
  RunEvent,
  RunSummary,
  Screenshot,
  StartRunRequest,
  SubscribeOptions,
  Target,
} from "@cappa/core";
import { createServer } from "@cappa/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `capture --server` against a real Fastify app over a real socket, with only
 * the browser scripted away.
 *
 * The CLI, the client and the server are each developed against
 * `@cappa/protocol` rather than against each other, so this is the level at
 * which they can be shown to agree.
 */

const { loggerInstance, getConfigMock } = vi.hoisted(() => ({
  loggerInstance: {
    level: 3,
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    box: vi.fn(),
  },
  getConfigMock: vi.fn(),
}));

vi.mock("@cappa/logger", () => ({
  getLogger: () => loggerInstance,
  initLogger: () => loggerInstance,
}));

vi.mock("@cappa/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cappa/config")>();
  return { ...actual, getConfig: getConfigMock };
});

vi.mock("chalk", () => {
  const identity = (value: string) => value;
  return {
    __esModule: true,
    default: {
      cyan: identity,
      red: identity,
      bold: identity,
      dim: identity,
      yellow: identity,
      green: identity,
      gray: identity,
    },
  };
});

import { renderRunEvent, runCapture } from "./capture";

const RUN_ID = "run-1";

/**
 * A complete `RunSummary`. It has to be valid: the client validates every event
 * against the protocol schema and drops the ones that do not match, so a
 * half-built summary here would silently swallow the terminal event.
 */
const SUMMARY: RunSummary = {
  id: RUN_ID,
  state: "completed",
  request: {},
  startedAt: 1,
  finishedAt: 2,
  durationMs: 1,
  totalTasks: 2,
  completedTasks: 2,
  failedTasks: 0,
  deletedScreenshots: [],
  anyTasksRan: true,
};

const event = (seq: number, rest: Record<string, unknown>): RunEvent =>
  ({ seq, runId: RUN_ID, at: 0, ...rest }) as unknown as RunEvent;

/** The event sequence a real run would produce, in order. */
const script = (): RunEvent[] => [
  event(1, { type: "run:start", request: {} }),
  event(2, { type: "discover:plugin", plugin: "fixture", taskCount: 2 }),
  event(3, {
    type: "task:complete",
    plugin: "fixture",
    taskId: "page--a",
    url: "http://x/a",
    status: "passed",
    completed: 1,
    total: 2,
    durationMs: 5,
  }),
  event(4, {
    type: "task:complete",
    plugin: "fixture",
    taskId: "page--b",
    url: "http://x/b",
    status: "changed",
    completed: 2,
    total: 2,
    durationMs: 5,
  }),
  event(5, {
    type: "plugin:complete",
    plugin: "fixture",
    resultCount: 2,
    failed: true,
  }),
  event(6, { type: "run:complete", summary: SUMMARY }),
];

type ScriptedOptions = {
  events?: RunEvent[];
  detail?: Partial<RunDetail>;
  screenshots?: Screenshot[];
  /** Emit nothing on start, so the run stays open for a cancellation test. */
  hang?: boolean;
};

const createScriptedEngine = (options: ScriptedOptions = {}) => {
  const listeners = new Map<string, Set<(event: RunEvent) => void>>();
  const buffered = new Map<string, RunEvent[]>();
  const cancelled: string[] = [];

  const emit = (event: RunEvent) => {
    buffered.set(RUN_ID, [...(buffered.get(RUN_ID) ?? []), event]);
    for (const listener of listeners.get(RUN_ID) ?? []) {
      listener(event);
    }
  };

  const detail = {
    ...SUMMARY,
    tasks: [],
    failures: [],
    ...options.detail,
  } as unknown as RunDetail;

  const engine: CaptureEngine & { cancelled: string[] } = {
    cancelled,

    async listPlugins(): Promise<PluginInfo[]> {
      return [{ name: "fixture" }];
    },

    async listTargets(): Promise<Target[]> {
      return [];
    },

    async startRun(request: StartRunRequest = {}): Promise<RunSummary> {
      const summary = { ...detail, request } as RunSummary;

      if (!options.hang) {
        // After the reply, so the CLI is subscribed by the time they land —
        // and buffered anyway, exactly as the real engine does it.
        setTimeout(() => {
          for (const entry of options.events ?? script()) {
            emit(entry);
          }
        }, 10);
      }

      return summary;
    },

    async getRun() {
      return detail;
    },

    async listRuns() {
      return [detail as RunSummary];
    },

    async cancelRun(id: string) {
      cancelled.push(id);
      emit(event(99, { type: "run:complete", summary: SUMMARY }));
    },

    subscribeRun(
      id: string,
      onEvent: (event: RunEvent) => void,
      subscribeOptions: SubscribeOptions = {},
    ) {
      const sinceSeq = subscribeOptions.sinceSeq ?? 0;
      for (const entry of buffered.get(id) ?? []) {
        if (entry.seq > sinceSeq) {
          onEvent(entry);
        }
      }

      const set = listeners.get(id) ?? new Set();
      set.add(onEvent);
      listeners.set(id, set);
      return () => set.delete(onEvent);
    },

    async listScreenshots(): Promise<Screenshot[]> {
      return options.screenshots ?? [];
    },

    async approve(): Promise<ApproveResult> {
      return { approved: [], errors: [] };
    },

    async close() {},
  };

  return engine;
};

type Host = {
  url: string;
  engine: ReturnType<typeof createScriptedEngine>;
  stop: () => Promise<void>;
};

const startHost = async (
  options: ScriptedOptions & { readOnly?: boolean; token?: string } = {},
): Promise<Host> => {
  const engine = createScriptedEngine(options);
  const app = await createServer({
    engine,
    outputDir: "/tmp/cappa-remote-test",
    logger: false,
    ui: false,
    readOnly: options.readOnly,
    token: options.token,
  });

  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    engine,
    stop: () => app.close(),
  };
};

/** Every logger call in order, as `level: message` — the rendered output. */
const rendered = () =>
  (["debug", "log", "info", "success", "error", "warn"] as const)
    .flatMap((level) =>
      loggerInstance[level].mock.calls.map(
        (call, index) =>
          ({
            level,
            order: loggerInstance[level].mock.invocationCallOrder[index] ?? 0,
            text: String(call[0]),
          }) as const,
      ),
    )
    .sort((a, b) => a.order - b.order)
    .map((entry) => `${entry.level}: ${entry.text}`);

const resetLogger = () => {
  for (const fn of Object.values(loggerInstance)) {
    if (typeof fn === "function") {
      (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  }
};

describe("capture --server", () => {
  let host: Host | undefined;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetLogger();
    getConfigMock.mockResolvedValue({
      outputDir: "screenshots",
      plugins: [],
      diff: {},
      screenshot: {},
      review: { theme: "light", port: 3000, browserIdleTimeout: 1000 },
    });
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    await host?.stop();
    host = undefined;
    exitSpy.mockRestore();
    delete process.env.CAPPA_TOKEN;
  });

  it("renders the same output as a local run over the same events", async () => {
    host = await startHost();

    await runCapture({ server: host.url });
    const remote = rendered();

    // The same event sequence, rendered by the same reporter, with no server
    // in between. Anything that differs is the boundary leaking into output.
    resetLogger();
    for (const entry of script()) {
      renderRunEvent(entry);
    }
    const local = rendered();

    // The remote run adds its config-locality notice and the closing summary
    // line; everything the events produce must match exactly.
    expect(remote).toEqual([
      `info: Capturing on ${host.url}, which uses its own cappa.config.ts. Local capture settings do not apply.`,
      ...local,
      expect.stringMatching(/^success: All plugins completed successfully in/),
    ]);
  });

  it("exits 1 and reports failures from the host", async () => {
    host = await startHost({
      detail: {
        failures: [
          {
            pluginName: "fixture",
            taskId: "page--b",
            taskUrl: "http://x/b",
            result: { success: false, isNew: false, filepath: "b.png" },
          },
        ] as never,
        deletedScreenshots: ["gone.png"],
      },
    });

    await runCapture({ server: host.url });

    expect(loggerInstance.box).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Failed Screenshots" }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("renders diff stats from a host whose interpretation is opaque", async () => {
    host = await startHost({
      detail: {
        failures: [
          {
            pluginName: "fixture",
            taskId: "card",
            taskUrl: "http://x/card",
            result: { success: false, isNew: false, filepath: "card.png" },
          },
        ] as never,
      },
      screenshots: [
        {
          id: "2",
          name: "card",
          category: "changed",
          actualPath: "actual/card.png",
          expectedPath: "expected/card.png",
          diffPath: "diff/card.png",
          diffMeta: {
            numDiffPixels: 12,
            percentDifference: 0.4,
            // Not an `InterpretResult`: the region list must be dropped while
            // the diff stats still render.
            interpretation: { nonsense: true },
          },
        } as unknown as Screenshot,
      ],
    });

    await runCapture({ server: host.url });

    const changed = loggerInstance.box.mock.calls
      .map(([arg]) => arg as { title: string; message: string })
      .find((arg) => arg.title === "Changed Screenshots");

    expect(changed?.message).toContain("card");
    expect(changed?.message).toContain("0.40%");
    // No severity, no region breakdown — the interpretation did not match.
    expect(changed?.message).not.toContain("→");
  });

  it("refuses a host that cannot capture", async () => {
    host = await startHost({ readOnly: true });

    await runCapture({ server: host.url });

    expect(String(loggerInstance.error.mock.calls[0]?.[0])).toContain(
      "read-only",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("reports a rejected token distinctly from an unreachable host", async () => {
    host = await startHost({ token: "s3cret" });

    await runCapture({ server: host.url, token: "wrong" });

    expect(String(loggerInstance.error.mock.calls[0]?.[0])).toContain(
      "rejected the access token",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("accepts a token from CAPPA_TOKEN", async () => {
    host = await startHost({ token: "s3cret" });
    process.env.CAPPA_TOKEN = "s3cret";

    await runCapture({ server: host.url });

    // The run itself reports plugin failures; what matters here is that the
    // pre-flight let it through rather than rejecting the token.
    expect(
      loggerInstance.error.mock.calls.map(([message]) => String(message)),
    ).not.toContainEqual(expect.stringContaining("rejected the access token"));
    expect(loggerInstance.success).toHaveBeenCalledWith(
      expect.stringContaining("All plugins completed successfully"),
    );
  });

  it("reports an unreachable host", async () => {
    // Port 1 is reserved and nothing listens on it.
    await runCapture({ server: "http://127.0.0.1:1" });

    expect(String(loggerInstance.error.mock.calls[0]?.[0])).toContain(
      "Could not reach a cappa server",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("rejects --token without --server", async () => {
    await runCapture({ token: "s3cret" });

    expect(loggerInstance.error).toHaveBeenCalledWith(
      "--token only applies with --server.",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("cancels the remote run on SIGINT", async () => {
    host = await startHost({ hang: true });

    const capture = runCapture({ server: host.url });

    // Let the run start and the CLI subscribe before interrupting.
    await new Promise((resolve) => setTimeout(resolve, 150));
    process.emit("SIGINT");

    // `process.exit` is a no-op here, so `runCapture` carries on against an
    // engine the signal handler has already closed. A real process is gone by
    // this point; what matters is that the host was told to stop.
    await capture.catch(() => undefined);

    expect(host.engine.cancelled).toEqual([RUN_ID]);
    expect(exitSpy).toHaveBeenCalledWith(130);
  });

  it("warns that onFail gets relative paths only", async () => {
    const onFail = vi.fn();
    getConfigMock.mockResolvedValue({
      outputDir: "screenshots",
      plugins: [],
      diff: {},
      screenshot: {},
      review: { theme: "light", port: 3000, browserIdleTimeout: 1000 },
      onFail,
    });

    host = await startHost({
      screenshots: [
        {
          id: "1",
          name: "button",
          category: "new",
          actualPath: "actual/button.png",
        } as unknown as Screenshot,
      ],
    });

    await runCapture({ server: host.url, ci: true });

    expect(loggerInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining("relative paths only"),
    );

    // The callback still runs — it just gets no absolute paths, because those
    // files are on the host.
    expect(onFail).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "button",
        absoluteActualPath: undefined,
        absoluteExpectedPath: undefined,
        absoluteDiffPath: undefined,
      }),
    ]);
  });
});
