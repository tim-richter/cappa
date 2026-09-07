import type {
  RunEvent,
  RunSummary,
  Target,
  WatchEvent,
  WatchStatus,
} from "@cappa/protocol";
import { HttpResponse, http } from "msw";

export const mockTargets: Target[] = [
  { id: "Screenshot 1", url: "http://localhost:6006/?id=one", plugin: "demo" },
  { id: "Screenshot 2", url: "http://localhost:6006/?id=two", plugin: "demo" },
  {
    id: "Screenshot 3",
    url: "http://localhost:6006/?id=three",
    plugin: "docs",
  },
];

export const mockPlugins = [
  { name: "demo", description: "Demo plugin" },
  { name: "docs", description: "Docs plugin" },
];

export const mockRunSummary: RunSummary = {
  id: "run-1",
  state: "running",
  request: {},
  startedAt: 0,
  totalTasks: 3,
  completedTasks: 0,
  failedTasks: 0,
  deletedScreenshots: [],
  anyTasksRan: true,
};

/**
 * What `GET /api/runs` answers by default.
 *
 * Finished, because the capture page reads this list to decide whether the
 * engine is busy: a "running" run here is the server saying "somebody else has
 * the browser", which correctly disables the whole panel. Tests that want that
 * state say so with `runsHandler`.
 */
export const mockFinishedRunSummary: RunSummary = {
  ...mockRunSummary,
  state: "completed",
  completedTasks: 3,
  durationMs: 361,
  finishedAt: 361,
};

/** Override the run list, for tests about an already-running capture. */
export const runsHandler = (runs: RunSummary[]) =>
  http.get("/api/runs", () => HttpResponse.json(runs));

/** A whole successful run, in the order the server would emit it. */
export const mockRunEvents = (): RunEvent[] => {
  const base = { runId: "run-1", at: 0 };
  let seq = 0;
  const next = () => {
    seq += 1;
    return seq;
  };

  return [
    { ...base, seq: next(), type: "run:start", request: {} },
    { ...base, seq: next(), type: "discover:start", plugins: ["demo", "docs"] },
    {
      ...base,
      seq: next(),
      type: "discover:complete",
      targets: mockTargets,
      totalTasks: 3,
    },
    {
      ...base,
      seq: next(),
      type: "plugin:start",
      plugin: "demo",
      taskCount: 2,
    },
    {
      ...base,
      seq: next(),
      type: "log",
      level: "info",
      message: "Processing 3 tasks with concurrency 1",
      args: [],
    },
    {
      ...base,
      seq: next(),
      type: "task:start",
      plugin: "demo",
      taskId: "Screenshot 1",
      url: mockTargets[0].url,
    },
    {
      ...base,
      seq: next(),
      type: "task:complete",
      plugin: "demo",
      taskId: "Screenshot 1",
      url: mockTargets[0].url,
      status: "passed",
      completed: 1,
      total: 3,
      durationMs: 120,
    },
    {
      ...base,
      seq: next(),
      type: "task:complete",
      plugin: "demo",
      taskId: "Screenshot 2",
      url: mockTargets[1].url,
      status: "changed",
      completed: 2,
      total: 3,
      durationMs: 98,
    },
    {
      ...base,
      seq: next(),
      type: "task:complete",
      plugin: "docs",
      taskId: "Screenshot 3",
      url: mockTargets[2].url,
      status: "new",
      completed: 3,
      total: 3,
      durationMs: 143,
    },
    {
      ...base,
      seq: next(),
      type: "run:complete",
      summary: {
        ...mockRunSummary,
        state: "completed",
        completedTasks: 3,
        durationMs: 361,
        finishedAt: 361,
      },
    },
  ] as RunEvent[];
};

export const mockWatchStatus: WatchStatus = {
  active: false,
  paths: ["."],
  debounceMs: 300,
};

/** Override the watch status, for tests about a session that is already on. */
export const watchStatusHandler = (status: WatchStatus) =>
  http.get("/api/watch", () => HttpResponse.json(status));

/** A watch session that saw one story file change and started a run for it. */
export const mockWatchEvents = (): WatchEvent[] => [
  { seq: 1, at: 0, type: "watch:start", paths: ["."], debounceMs: 300 },
  {
    seq: 2,
    at: 0,
    type: "watch:change",
    files: ["src/Button.stories.tsx"],
    scope: "tasks",
    taskIds: ["Screenshot 1"],
    runId: "run-1",
  },
];

/** Override the watch event stream. */
export const watchEventsHandler = (events: WatchEvent[]) =>
  http.get("/api/watch/events", () => {
    const body = events
      .map((event) => `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`)
      .join("");

    return new HttpResponse(body, {
      headers: { "Content-Type": "text/event-stream" },
    });
  });

const sseBody = (events: RunEvent[]) =>
  events
    .map((event) => `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");

/**
 * Handlers for the capture surface.
 *
 * The event stream is served as a single pre-rendered SSE body rather than a
 * live one: the client parses it identically, and a test gets a deterministic
 * run without timers.
 */
export const captureHandlers = [
  http.get("/api/health", () =>
    HttpResponse.json({
      ok: true,
      protocolVersion: 1,
      capabilities: {
        capture: true,
        approve: true,
        events: true,
        watch: true,
      },
    }),
  ),

  http.get("/api/plugins", () => HttpResponse.json(mockPlugins)),

  http.get("/api/targets", () => HttpResponse.json(mockTargets)),

  http.get("/api/runs", () => HttpResponse.json([mockFinishedRunSummary])),

  http.post("/api/runs", () =>
    HttpResponse.json({ runId: "run-1", run: mockRunSummary }, { status: 201 }),
  ),

  http.get("/api/runs/:id", ({ params }) =>
    HttpResponse.json({
      ...mockRunSummary,
      id: params.id,
      tasks: [],
      failures: [],
    }),
  ),

  http.post("/api/runs/:id/cancel", ({ params }) =>
    HttpResponse.json({ runId: params.id }, { status: 202 }),
  ),

  http.get("/api/watch", () => HttpResponse.json(mockWatchStatus)),

  http.post("/api/watch", () =>
    HttpResponse.json(
      { ...mockWatchStatus, active: true, startedAt: 1 },
      { status: 201 },
    ),
  ),

  http.delete("/api/watch", () => HttpResponse.json(mockWatchStatus)),

  // An empty stream by default: a test that wants watch events says so with
  // `watchEventsHandler`.
  http.get("/api/watch/events", () => {
    return new HttpResponse("", {
      headers: { "Content-Type": "text/event-stream" },
    });
  }),

  http.get("/api/runs/:id/events", ({ request }) => {
    const sinceSeq = Number.parseInt(
      new URL(request.url).searchParams.get("sinceSeq") ?? "0",
      10,
    );

    const events = mockRunEvents().filter((event) => event.seq > sinceSeq);

    return new HttpResponse(sseBody(events), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }),
];
