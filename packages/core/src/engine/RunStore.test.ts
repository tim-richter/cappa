import { describe, expect, it, vi } from "vitest";
import type { CaptureRunner } from "../runner/CaptureRunner";
import type { RunEvent, RunEventListener } from "../runner/types";
import { RunStore } from "./RunStore";

/**
 * Minimal stand-in for a runner: lets a test push events at will and inspect
 * what the store did with them.
 */
const createFakeRunner = (id: string) => {
  const listeners: RunEventListener[] = [];
  let seq = 0;

  const runner = {
    id,
    on: (listener: RunEventListener) => {
      listeners.push(listener);
      return () => {};
    },
    abort: vi.fn(),
    getSummary: vi.fn(() => ({ id, state: "running" })),
    getDetail: vi.fn(() => ({ id, state: "running", tasks: [], failures: [] })),
  } as unknown as CaptureRunner;

  const emit = (type = "log"): RunEvent => {
    seq += 1;
    const event = { type, seq, runId: id, at: seq } as unknown as RunEvent;
    for (const listener of listeners) {
      listener(event);
    }
    return event;
  };

  return { runner, emit };
};

describe("RunStore", () => {
  it("returns live detail while a run is in flight", () => {
    const store = new RunStore();
    const { runner } = createFakeRunner("run-1");
    store.add(runner);

    expect(store.get("run-1")).toMatchObject({ id: "run-1", state: "running" });
    expect(runner.getDetail).toHaveBeenCalled();
  });

  it("freezes detail once finalized so it survives the runner", () => {
    const store = new RunStore();
    const { runner } = createFakeRunner("run-1");
    store.add(runner);

    store.finalize("run-1");
    vi.mocked(runner.getDetail).mockClear();

    expect(store.get("run-1")).toMatchObject({ id: "run-1" });
    expect(runner.getDetail).not.toHaveBeenCalled();
  });

  it("returns undefined for an unknown run", () => {
    expect(new RunStore().get("nope")).toBeUndefined();
  });

  it("lists runs newest first", () => {
    const store = new RunStore();
    store.add(createFakeRunner("run-1").runner);
    store.add(createFakeRunner("run-2").runner);

    expect(store.list().map((run) => run.id)).toEqual(["run-2", "run-1"]);
  });

  it("evicts the oldest runs beyond the retention limit", () => {
    const store = new RunStore({ maxRuns: 2 });
    store.add(createFakeRunner("run-1").runner);
    store.add(createFakeRunner("run-2").runner);
    store.add(createFakeRunner("run-3").runner);

    expect(store.list().map((run) => run.id)).toEqual(["run-3", "run-2"]);
    expect(store.get("run-1")).toBeUndefined();
  });
});

describe("RunStore subscriptions", () => {
  it("replays buffered events before streaming live ones", () => {
    const store = new RunStore();
    const { runner, emit } = createFakeRunner("run-1");
    store.add(runner);

    emit();
    emit();

    const seen: number[] = [];
    store.subscribe("run-1", (event) => seen.push(event.seq));

    expect(seen).toEqual([1, 2]);

    emit();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("replays only events after sinceSeq", () => {
    const store = new RunStore();
    const { runner, emit } = createFakeRunner("run-1");
    store.add(runner);

    emit();
    emit();
    emit();

    const seen: number[] = [];
    store.subscribe("run-1", (event) => seen.push(event.seq), { sinceSeq: 2 });

    expect(seen).toEqual([3]);
  });

  it("stops delivering after unsubscribe", () => {
    const store = new RunStore();
    const { runner, emit } = createFakeRunner("run-1");
    store.add(runner);

    const seen: number[] = [];
    const unsubscribe = store.subscribe("run-1", (event) =>
      seen.push(event.seq),
    );

    emit();
    unsubscribe();
    emit();

    expect(seen).toEqual([1]);
  });

  it("isolates a throwing subscriber from the others", () => {
    const store = new RunStore();
    const { runner, emit } = createFakeRunner("run-1");
    store.add(runner);

    store.subscribe("run-1", () => {
      throw new Error("bad subscriber");
    });
    const seen: number[] = [];
    store.subscribe("run-1", (event) => seen.push(event.seq));

    expect(() => emit()).not.toThrow();
    expect(seen).toEqual([1]);
  });

  it("subscribing to an unknown run is a no-op", () => {
    const store = new RunStore();
    const seen: number[] = [];

    const unsubscribe = store.subscribe("nope", (event) =>
      seen.push(event.seq),
    );
    unsubscribe();

    expect(seen).toEqual([]);
  });

  it("caps the replay buffer and reports what it dropped", () => {
    const store = new RunStore({ maxEventsPerRun: 3 });
    const { runner, emit } = createFakeRunner("run-1");
    store.add(runner);

    for (let i = 0; i < 5; i++) {
      emit();
    }

    const seen: number[] = [];
    store.subscribe("run-1", (event) => seen.push(event.seq));

    expect(seen).toEqual([3, 4, 5]);
    expect(store.droppedEvents("run-1")).toBe(2);
  });
});
