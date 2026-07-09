import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "./mapWithConcurrency";

describe("mapWithConcurrency", () => {
  it("runs all items with bounded concurrency", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await mapWithConcurrency(3, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fn);

    expect(fn).toHaveBeenCalledTimes(10);
  });

  it("propagates the first rejection", async () => {
    await expect(
      mapWithConcurrency(2, [1, 2, 3], async (n) => {
        if (n === 2) {
          throw new Error("fail");
        }
      }),
    ).rejects.toThrow("fail");
  });

  it("no-ops on empty items", async () => {
    const fn = vi.fn();
    const results = await mapWithConcurrency(4, [], fn);
    expect(fn).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("returns results in input order regardless of completion order", async () => {
    const delays = [30, 10, 20];
    const results = await mapWithConcurrency(3, delays, async (delay) => {
      await new Promise((r) => setTimeout(r, delay));
      return delay * 2;
    });

    expect(results).toEqual([60, 20, 40]);
  });

  it("passes a stable workerIndex to each callback invocation", async () => {
    const workerCalls = new Map<number, number[]>();

    await mapWithConcurrency(
      2,
      [1, 2, 3, 4, 5, 6],
      async (item, workerIndex) => {
        const calls = workerCalls.get(workerIndex) ?? [];
        calls.push(item);
        workerCalls.set(workerIndex, calls);
        await new Promise((r) => setTimeout(r, 0));
      },
    );

    expect(workerCalls.size).toBeLessThanOrEqual(2);
    for (const [idx] of workerCalls) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(2);
    }
    const allItems = [...workerCalls.values()].flat().sort((a, b) => a - b);
    expect(allItems).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("distributes work dynamically so fast workers pick up more tasks", async () => {
    const workerTaskCounts = new Map<number, number>();

    await mapWithConcurrency(
      2,
      [1, 2, 3, 4, 5, 6, 7, 8],
      async (item, workerIndex) => {
        workerTaskCounts.set(
          workerIndex,
          (workerTaskCounts.get(workerIndex) ?? 0) + 1,
        );
        const delay = item <= 4 ? 50 : 5;
        await new Promise((r) => setTimeout(r, delay));
      },
    );

    const worker0 = workerTaskCounts.get(0) ?? 0;
    const worker1 = workerTaskCounts.get(1) ?? 0;
    expect(worker0 + worker1).toBe(8);
    expect(worker0).toBeGreaterThan(0);
    expect(worker1).toBeGreaterThan(0);
  });
});
