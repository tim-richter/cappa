import type { CaptureRunner } from "../runner/CaptureRunner";
import type { RunDetail, RunEvent, RunSummary } from "../runner/types";

export type RunStoreOptions = {
  /**
   * Events buffered per run, for replay to a (re)connecting subscriber.
   * @default 5000
   */
  maxEventsPerRun?: number;
  /**
   * Finished runs kept in memory. Oldest are dropped first.
   * @default 20
   */
  maxRuns?: number;
};

type RunEntry = {
  id: string;
  runner: CaptureRunner;
  events: RunEvent[];
  /** Events dropped off the front of the buffer, so replay gaps are detectable. */
  dropped: number;
  listeners: Set<(event: RunEvent) => void>;
  /** Frozen once the run finishes, so detail survives after the runner is gone. */
  finalDetail?: RunDetail;
};

/**
 * In-memory registry of capture runs and their event history.
 *
 * The event buffer is what lets an SSE client reconnect without losing
 * anything: subscribers replay from the last `seq` they saw before live
 * delivery starts.
 */
export class RunStore {
  private readonly maxEventsPerRun: number;
  private readonly maxRuns: number;
  private readonly runs = new Map<string, RunEntry>();
  /** Insertion order, oldest first — the eviction queue. */
  private readonly order: string[] = [];

  constructor(options: RunStoreOptions = {}) {
    this.maxEventsPerRun = options.maxEventsPerRun ?? 5000;
    this.maxRuns = options.maxRuns ?? 20;
  }

  /** Register a runner and start buffering its events. */
  add(runner: CaptureRunner): void {
    const entry: RunEntry = {
      id: runner.id,
      runner,
      events: [],
      dropped: 0,
      listeners: new Set(),
    };

    this.runs.set(runner.id, entry);
    this.order.push(runner.id);
    this.evictOldRuns();

    runner.on((event) => {
      entry.events.push(event);
      if (entry.events.length > this.maxEventsPerRun) {
        entry.dropped += entry.events.length - this.maxEventsPerRun;
        entry.events.splice(0, entry.events.length - this.maxEventsPerRun);
      }

      for (const listener of entry.listeners) {
        try {
          listener(event);
        } catch {
          // A failing subscriber must not disturb the run or other subscribers.
        }
      }
    });
  }

  /**
   * Freeze the final detail of a finished run so it stays queryable after the
   * runner is discarded.
   */
  finalize(runId: string): void {
    const entry = this.runs.get(runId);
    if (entry) {
      entry.finalDetail = entry.runner.getDetail();
    }
  }

  get(runId: string): RunDetail | undefined {
    const entry = this.runs.get(runId);
    if (!entry) {
      return undefined;
    }

    return entry.finalDetail ?? entry.runner.getDetail();
  }

  getRunner(runId: string): CaptureRunner | undefined {
    return this.runs.get(runId)?.runner;
  }

  /** Newest first. */
  list(): RunSummary[] {
    return [...this.order]
      .reverse()
      .map((id) => {
        const entry = this.runs.get(id);
        if (!entry) {
          return undefined;
        }
        return entry.finalDetail ?? entry.runner.getSummary();
      })
      .filter((summary): summary is RunSummary => summary !== undefined);
  }

  /**
   * Subscribe to a run, replaying buffered events first.
   *
   * Replay is synchronous, so a subscriber cannot miss events that arrive
   * between the buffer read and the listener being registered.
   */
  subscribe(
    runId: string,
    onEvent: (event: RunEvent) => void,
    options: { sinceSeq?: number } = {},
  ): () => void {
    const entry = this.runs.get(runId);
    if (!entry) {
      return () => {};
    }

    const sinceSeq = options.sinceSeq ?? 0;
    for (const event of entry.events) {
      if (event.seq > sinceSeq) {
        onEvent(event);
      }
    }

    entry.listeners.add(onEvent);
    return () => {
      entry.listeners.delete(onEvent);
    };
  }

  /** How many events were dropped from a run's buffer (0 when none were). */
  droppedEvents(runId: string): number {
    return this.runs.get(runId)?.dropped ?? 0;
  }

  private evictOldRuns(): void {
    while (this.order.length > this.maxRuns) {
      const oldest = this.order.shift();
      if (oldest !== undefined) {
        this.runs.delete(oldest);
      }
    }
  }
}
