import type {
  ApproveResult,
  CaptureEngine,
  ListTargetsOptions,
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
import { WatchInProgressError } from "@cappa/core";
import { vi } from "vitest";

/**
 * A `CaptureEngine` with no browser behind it.
 *
 * The server's job is routing, validation and serialization — driving a real
 * Playwright instance to test that would be slow and would test the wrong
 * thing. Engine behaviour is covered by `LocalEngine`'s own suite.
 */
export type FakeEngine = CaptureEngine & {
  screenshots: Screenshot[];
  targets: Target[];
  plugins: PluginInfo[];
  runs: Map<string, RunDetail>;
  /** Push an event to every live subscriber of `runId`. */
  emit: (runId: string, event: Partial<RunEvent> & { seq: number }) => void;
  /** Buffered events, replayed to new subscribers. */
  events: Map<string, RunEvent[]>;
  startRunImpl: (request: StartRunRequest) => Promise<RunSummary>;
  /** Push a watch event to every live watch subscriber. */
  emitWatch: (event: WatchEvent) => void;
  watchEvents: WatchEvent[];
};

export const summary = (
  id: string,
  overrides: Partial<RunSummary> = {},
): RunSummary => ({
  id,
  state: "running",
  request: {},
  startedAt: 0,
  totalTasks: 0,
  completedTasks: 0,
  failedTasks: 0,
  deletedScreenshots: [],
  anyTasksRan: false,
  ...overrides,
});

export const detail = (
  id: string,
  overrides: Partial<RunDetail> = {},
): RunDetail => ({
  ...summary(id),
  tasks: [],
  failures: [],
  ...overrides,
});

export const createFakeEngine = (
  overrides: Partial<FakeEngine> = {},
): FakeEngine => {
  const subscribers = new Map<string, Set<(event: RunEvent) => void>>();
  const events = new Map<string, RunEvent[]>();
  const runs = new Map<string, RunDetail>();
  const watchSubscribers = new Set<(event: WatchEvent) => void>();
  const watchEvents: WatchEvent[] = [];
  let watching = false;

  let nextRunId = 1;

  const engine: FakeEngine = {
    screenshots: [],
    targets: [],
    plugins: [],
    runs,
    events,
    watchEvents,

    emit: (runId, partial) => {
      const event = {
        runId,
        at: 0,
        type: "log",
        level: "info",
        message: "",
        args: [],
        ...partial,
      } as unknown as RunEvent;

      const buffered = events.get(runId) ?? [];
      buffered.push(event);
      events.set(runId, buffered);

      for (const listener of subscribers.get(runId) ?? []) {
        listener(event);
      }
    },

    startRunImpl: async (request) => {
      const id = `run-${nextRunId++}`;
      runs.set(id, detail(id, { request }));
      return summary(id, { request });
    },

    listPlugins: vi.fn(async () => engine.plugins),
    listTargets: vi.fn(async (_options?: ListTargetsOptions) => engine.targets),
    startRun: vi.fn(async (request: StartRunRequest = {}) =>
      engine.startRunImpl(request),
    ),
    getRun: vi.fn(async (id: string) => runs.get(id)),
    listRuns: vi.fn(async () => [...runs.values()].reverse()),
    cancelRun: vi.fn(async (id: string) => {
      const run = runs.get(id);
      if (run) {
        runs.set(id, { ...run, state: "cancelled" });
      }
    }),

    subscribeRun: (
      id: string,
      onEvent: (event: RunEvent) => void,
      options: SubscribeOptions = {},
    ) => {
      const sinceSeq = options.sinceSeq ?? 0;
      for (const event of events.get(id) ?? []) {
        if (event.seq > sinceSeq) {
          onEvent(event);
        }
      }

      const set = subscribers.get(id) ?? new Set();
      set.add(onEvent);
      subscribers.set(id, set);

      return () => {
        set.delete(onEvent);
      };
    },

    listScreenshots: vi.fn(async (query: ScreenshotQuery = {}) => {
      let result = engine.screenshots;
      if (query.category) {
        result = result.filter((s) => s.category === query.category);
      }
      if (query.search) {
        const term = query.search.toLowerCase();
        result = result.filter((s) => s.name.toLowerCase().includes(term));
      }
      return result;
    }),

    approve: vi.fn(async (names: string[]): Promise<ApproveResult> => {
      const approved: string[] = [];
      const errors: { name: string; error: string }[] = [];

      for (const name of names) {
        const index = engine.screenshots.findIndex((s) => s.name === name);
        if (index === -1) {
          errors.push({ name, error: "Screenshot not found" });
          continue;
        }
        const current = engine.screenshots[index] as Screenshot;
        engine.screenshots = engine.screenshots.map((s, i) =>
          i === index
            ? ({
                id: current.id,
                name: current.name,
                category: "passed",
                actualPath: `actual/${name}.png`,
                expectedPath: `expected/${name}.png`,
              } as Screenshot)
            : s,
        );
        approved.push(name);
      }

      return { approved, errors };
    }),

    emitWatch: (event: WatchEvent) => {
      watchEvents.push(event);
      for (const listener of watchSubscribers) {
        listener(event);
      }
    },

    startWatch: vi.fn(async (request: StartWatchRequest = {}) => {
      if (watching) {
        throw new WatchInProgressError();
      }
      watching = true;
      return {
        active: true,
        paths: request.paths ?? ["."],
        filter: request.filter,
        debounceMs: request.debounceMs ?? 300,
        startedAt: 0,
      } satisfies WatchStatus;
    }),

    stopWatch: vi.fn(async () => {
      watching = false;
      return {
        active: false,
        paths: ["."],
        debounceMs: 300,
      } satisfies WatchStatus;
    }),

    getWatchStatus: vi.fn(async () => ({
      active: watching,
      paths: ["."],
      debounceMs: 300,
    })),

    subscribeWatch: (
      onEvent: (event: WatchEvent) => void,
      options: SubscribeOptions = {},
    ) => {
      const sinceSeq = options.sinceSeq ?? 0;
      for (const event of watchEvents) {
        if (event.seq > sinceSeq) {
          onEvent(event);
        }
      }

      watchSubscribers.add(onEvent);
      return () => {
        watchSubscribers.delete(onEvent);
      };
    },

    close: vi.fn(async () => {}),

    ...overrides,
  };

  return engine;
};
