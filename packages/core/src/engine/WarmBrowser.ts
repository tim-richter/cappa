import type ScreenshotTool from "../screenshot";

export type WarmBrowserOptions = {
  /** Builds an un-initialised `ScreenshotTool`. Called once per cold start. */
  create: () => ScreenshotTool;
  /**
   * How long the browser may sit unused before it is shut down.
   * `0` disables warm reuse entirely (close immediately after each release).
   * @default 300_000 (5 minutes)
   */
  idleTimeoutMs?: number;
};

/**
 * Keeps a Playwright browser alive between capture runs.
 *
 * Interactively, a cold Chromium start on every "Capture" click is the
 * difference between a snappy tool and a sluggish one — but a browser left
 * running forever is a memory leak, so it is evicted after an idle period.
 *
 * Contexts are recycled on every acquire after the first, because a warm
 * browser's pages carry cookies, storage and scroll position from the previous
 * run and a screenshot taken against leaked state is not the screenshot the CLI
 * would have taken.
 */
export class WarmBrowser {
  private readonly createTool: () => ScreenshotTool;
  private readonly idleTimeoutMs: number;

  private tool: ScreenshotTool | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private inUse = false;
  private closed = false;
  /** Serializes acquire/close so concurrent callers cannot race the browser. */
  private pending: Promise<unknown> = Promise.resolve();

  constructor(options: WarmBrowserOptions) {
    this.createTool = options.create;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 300_000;
  }

  /** True while a browser process is alive. */
  get isWarm(): boolean {
    return this.tool !== null;
  }

  /**
   * Get a ready-to-use `ScreenshotTool`, starting or reusing the browser.
   * Always pair with `release()`.
   */
  async acquire(): Promise<ScreenshotTool> {
    return this.serialize(async () => {
      if (this.closed) {
        throw new Error("WarmBrowser has been closed");
      }

      this.cancelIdleTimer();
      this.inUse = true;

      if (this.tool) {
        // Reused browser: give the run a clean set of contexts.
        await this.tool.recycleContexts();
        return this.tool;
      }

      const tool = this.createTool();
      await tool.init();
      this.tool = tool;
      return tool;
    });
  }

  /**
   * Hand the browser back. It stays warm until the idle timeout elapses.
   */
  release(): void {
    this.inUse = false;

    if (this.closed || !this.tool) {
      return;
    }

    if (this.idleTimeoutMs <= 0) {
      void this.close();
      return;
    }

    this.startIdleTimer();
  }

  /** Shut the browser down now. Safe to call repeatedly. */
  async close(): Promise<void> {
    this.closed = true;
    this.cancelIdleTimer();

    await this.serialize(async () => {
      const tool = this.tool;
      this.tool = null;
      this.inUse = false;

      if (tool) {
        await tool.close();
      }
    });
  }

  private startIdleTimer(): void {
    this.cancelIdleTimer();

    const timer = setTimeout(() => {
      this.idleTimer = null;
      if (this.inUse || this.closed || !this.tool) {
        return;
      }

      void this.evict();
    }, this.idleTimeoutMs);

    // Never let an idle browser keep the process alive.
    if (typeof (timer as { unref?: () => void }).unref === "function") {
      (timer as { unref: () => void }).unref();
    }

    this.idleTimer = timer;
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** Shut the browser down but stay usable — the next acquire starts cold. */
  private async evict(): Promise<void> {
    await this.serialize(async () => {
      if (this.inUse || this.closed) {
        return;
      }

      const tool = this.tool;
      this.tool = null;

      if (tool) {
        await tool.close();
      }
    });
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.pending.then(work, work);
    // Keep the chain alive even when a caller's promise rejects.
    this.pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
