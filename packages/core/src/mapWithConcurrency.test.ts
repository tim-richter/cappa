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
    await mapWithConcurrency(4, [], fn);
    expect(fn).not.toHaveBeenCalled();
  });
});
