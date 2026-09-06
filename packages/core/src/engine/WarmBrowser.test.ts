import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type ScreenshotTool from "../screenshot";
import { WarmBrowser } from "./WarmBrowser";

type FakeTool = ScreenshotTool & {
  init: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  recycleContexts: ReturnType<typeof vi.fn>;
};

const createFakeTool = (): FakeTool =>
  ({
    init: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    recycleContexts: vi.fn(async () => {}),
  }) as unknown as FakeTool;

const createWarm = (idleTimeoutMs = 1000) => {
  const tools: FakeTool[] = [];
  const warm = new WarmBrowser({
    create: () => {
      const tool = createFakeTool();
      tools.push(tool);
      return tool;
    },
    idleTimeoutMs,
  });
  return { warm, tools };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WarmBrowser", () => {
  it("initialises the browser on first acquire", async () => {
    const { warm, tools } = createWarm();

    const tool = await warm.acquire();

    expect(tools).toHaveLength(1);
    expect(tool).toBe(tools[0]);
    expect(tools[0]?.init).toHaveBeenCalledOnce();
    expect(warm.isWarm).toBe(true);
  });

  it("reuses the same browser across runs", async () => {
    const { warm, tools } = createWarm();

    const first = await warm.acquire();
    warm.release();
    const second = await warm.acquire();

    expect(second).toBe(first);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.init).toHaveBeenCalledOnce();
  });

  it("recycles contexts on reuse but not on a cold start", async () => {
    const { warm, tools } = createWarm();

    await warm.acquire();
    expect(tools[0]?.recycleContexts).not.toHaveBeenCalled();

    warm.release();
    await warm.acquire();
    expect(tools[0]?.recycleContexts).toHaveBeenCalledOnce();
  });

  it("evicts the browser once the idle timeout elapses", async () => {
    const { warm, tools } = createWarm(1000);

    await warm.acquire();
    warm.release();

    expect(warm.isWarm).toBe(true);

    await vi.advanceTimersByTimeAsync(1001);

    expect(tools[0]?.close).toHaveBeenCalledOnce();
    expect(warm.isWarm).toBe(false);
  });

  it("starts a fresh browser after an eviction", async () => {
    const { warm, tools } = createWarm(1000);

    await warm.acquire();
    warm.release();
    await vi.advanceTimersByTimeAsync(1001);

    await warm.acquire();

    expect(tools).toHaveLength(2);
    expect(tools[1]?.init).toHaveBeenCalledOnce();
  });

  it("does not evict while the browser is in use", async () => {
    const { warm, tools } = createWarm(1000);

    await warm.acquire();
    await vi.advanceTimersByTimeAsync(5000);

    expect(tools[0]?.close).not.toHaveBeenCalled();
    expect(warm.isWarm).toBe(true);
  });

  it("cancels a pending eviction when re-acquired", async () => {
    const { warm, tools } = createWarm(1000);

    await warm.acquire();
    warm.release();
    await vi.advanceTimersByTimeAsync(500);

    await warm.acquire();
    await vi.advanceTimersByTimeAsync(5000);

    expect(tools[0]?.close).not.toHaveBeenCalled();
    expect(tools).toHaveLength(1);
  });

  it("closes immediately on release when warm reuse is disabled", async () => {
    const { warm, tools } = createWarm(0);

    await warm.acquire();
    warm.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(tools[0]?.close).toHaveBeenCalledOnce();
  });

  it("closes the browser and refuses further acquires", async () => {
    const { warm, tools } = createWarm();

    await warm.acquire();
    await warm.close();

    expect(tools[0]?.close).toHaveBeenCalledOnce();
    expect(warm.isWarm).toBe(false);
    await expect(warm.acquire()).rejects.toThrow(/closed/);
  });

  it("is safe to close more than once", async () => {
    const { warm, tools } = createWarm();

    await warm.acquire();
    await warm.close();
    await warm.close();

    expect(tools[0]?.close).toHaveBeenCalledOnce();
  });

  it("only starts one browser for concurrent acquires", async () => {
    const { warm, tools } = createWarm();

    const [a, b] = await Promise.all([warm.acquire(), warm.acquire()]);

    expect(tools).toHaveLength(1);
    expect(a).toBe(b);
  });

  it("keeps working after a failed acquire", async () => {
    let attempt = 0;
    const tools: FakeTool[] = [];
    const warm = new WarmBrowser({
      create: () => {
        attempt += 1;
        const tool = createFakeTool();
        if (attempt === 1) {
          tool.init.mockRejectedValueOnce(new Error("launch failed"));
        }
        tools.push(tool);
        return tool;
      },
      idleTimeoutMs: 1000,
    });

    await expect(warm.acquire()).rejects.toThrow("launch failed");

    const recovered = await warm.acquire();

    expect(tools).toHaveLength(2);
    expect(recovered).toBe(tools[1]);
    expect(warm.isWarm).toBe(true);
  });
});
