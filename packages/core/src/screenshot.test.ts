import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initLogger } from "@cappa/logger";
import { chromium, firefox } from "playwright-core";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as pixelCompare from "./compare/pixel";
import { ensurePlaywrightContainer } from "./container";
import { playwright } from "./playwright";
import ScreenshotTool, { describeConnectError } from "./screenshot";

vi.mock("./compare/pixel", () => ({
  compareImages: vi.fn(),
  createDiffSizePngImage: vi.fn(),
}));

vi.mock("./container", () => ({
  ensurePlaywrightContainer: vi.fn(),
}));

beforeAll(() => {
  initLogger(0);
});

describe("ScreenshotTool getVariantFilename", () => {
  it("appends the variant id as a suffix", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });

    const filename = tool.getVariantFilename("components/Button.png", {
      id: "mobile",
    });

    expect(filename).toBe("components/Button--mobile.png");
  });

  it("sanitizes invalid characters in the variant id", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });

    const filename = tool.getVariantFilename("Badge.png", {
      id: "📱 mobile view",
    });

    expect(filename).toBe("Badge--mobile-view.png");
  });

  it("uses a provided filename when present", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });

    const filename = tool.getVariantFilename("Badge.png", {
      id: "mobile",
      filename: "Badge/mobile-custom.png",
    });

    expect(filename).toBe("Badge/mobile-custom.png");
  });

  it("strips traversal from a provided filename", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });

    const filename = tool.getVariantFilename("Badge.png", {
      id: "mobile",
      filename: "../../../../home/user/.config/evil.png",
    });

    expect(filename).toBe("home/user/.config/evil.png");
  });

  it("makes an absolute provided filename relative", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });

    const filename = tool.getVariantFilename("Badge.png", {
      id: "mobile",
      filename: "/etc/cron.d/evil.png",
    });

    expect(filename).toBe("etc/cron.d/evil.png");
  });

  it("falls back to the derived name when nothing usable is left", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });

    const filename = tool.getVariantFilename("Badge.png", {
      id: "mobile",
      filename: "../..",
    });

    expect(filename).toBe("Badge--mobile.png");
  });

  it("confines a provided filename to the actual directory", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp/cappa-variant" });

    const filename = tool.getVariantFilename("Badge.png", {
      id: "mobile",
      filename: "../escape.png",
    });

    expect(tool.filesystem.getActualFilePath(filename)).toBe(
      path.join("/tmp/cappa-variant", "actual", "escape.png"),
    );
  });
});

describe("ScreenshotTool delay", () => {
  const createPage = () => {
    return {
      waitForTimeout: vi.fn(async () => {}),
      screenshot: vi.fn(async () => Buffer.from("test")),
      viewportSize: vi.fn(() => ({ width: 1024, height: 768 })),
      setViewportSize: vi.fn(async () => {}),
      url: vi.fn(() => "http://localhost:6006/iframe.html?id=button--primary"),
    };
  };

  it("waits before taking a saved screenshot when delay is configured", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    const page = createPage();

    tool.browser = {} as any;
    tool.filesystem.getActualFilePath = vi.fn(() => "/tmp/Button.png");
    tool.filesystem.ensureParentDir = vi.fn(async () => {});

    await tool.takeScreenshot(page as any, "Button.png", {
      delay: 250,
      viewport: { width: 1024, height: 768 },
    });

    expect(page.waitForTimeout).toHaveBeenCalledWith(250);
    expect(page.waitForTimeout.mock.invocationCallOrder[0]).toBeLessThan(
      page.screenshot.mock.invocationCallOrder[0] as number,
    );
  });

  it("waits before taking comparison buffer screenshots when delay is configured", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    const page = createPage();

    tool.browser = {} as any;

    await tool.takeScreenshotBuffer(page as any, {
      delay: 125,
      viewport: { width: 1024, height: 768 },
    });

    expect(page.waitForTimeout).toHaveBeenCalledWith(125);
    expect(page.waitForTimeout.mock.invocationCallOrder[0]).toBeLessThan(
      page.screenshot.mock.invocationCallOrder[0] as number,
    );
  });
});

describe("ScreenshotTool getIncBackoffDelay", () => {
  it("returns 0 for the initial attempt", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    expect(tool.getIncBackoffDelay(0, 0)).toBe(0);
  });

  it("returns 500ms for the first retry", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    expect(tool.getIncBackoffDelay(1, 0)).toBe(500);
  });

  it("returns 1000ms for the second retry", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    expect(tool.getIncBackoffDelay(2, 0)).toBe(1000);
  });

  it("doubles the backoff for each subsequent retry", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    expect(tool.getIncBackoffDelay(3, 0)).toBe(2000);
    expect(tool.getIncBackoffDelay(4, 0)).toBe(4000);
  });

  it("adds the configured screenshot delay to each retry backoff", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    expect(tool.getIncBackoffDelay(1, 100)).toBe(600);
    expect(tool.getIncBackoffDelay(2, 100)).toBe(1100);
  });

  it("does not add the configured delay to the initial attempt", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    expect(tool.getIncBackoffDelay(0, 300)).toBe(0);
  });
});

describe("ScreenshotTool capture duration logging", () => {
  const createPage = () => ({
    waitForTimeout: vi.fn(async () => {}),
    screenshot: vi.fn(async () => Buffer.from("test")),
    viewportSize: vi.fn(() => ({ width: 1024, height: 768 })),
    setViewportSize: vi.fn(async () => {}),
    url: vi.fn(() => "http://localhost:6006/iframe.html?id=button--primary"),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the capture duration with the filename after a new screenshot", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    const page = createPage();
    tool.browser = {} as any;
    vi.spyOn(tool, "takeScreenshot").mockResolvedValue(
      "/tmp/actual/Button.png",
    );
    tool.filesystem.hasExpectedFile = vi.fn(async () => false);

    const debugSpy = vi.spyOn(tool.logger, "debug");

    await tool.capture(page as any, "Button.png", {});

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^Button\.png captured in \d+ms$/),
    );
  });

  it("uses captureStart from extras to compute the duration", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    const page = createPage();
    tool.browser = {} as any;
    vi.spyOn(tool, "takeScreenshot").mockResolvedValue(
      "/tmp/actual/Button.png",
    );
    tool.filesystem.hasExpectedFile = vi.fn(async () => false);

    const debugSpy = vi.spyOn(tool.logger, "debug");
    vi.spyOn(performance, "now").mockReturnValue(2000);

    await tool.capture(page as any, "Button.png", {}, { captureStart: 500 });

    expect(debugSpy).toHaveBeenCalledWith("Button.png captured in 1500ms");
  });

  it("falls back to performance.now() when captureStart is not provided", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    const page = createPage();
    tool.browser = {} as any;
    vi.spyOn(tool, "takeScreenshot").mockResolvedValue(
      "/tmp/actual/Button.png",
    );
    tool.filesystem.hasExpectedFile = vi.fn(async () => false);

    const debugSpy = vi.spyOn(tool.logger, "debug");
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(100) // start (fallback inside captureSingleScreenshot)
      .mockReturnValueOnce(350); // end

    await tool.capture(page as any, "Button.png", {});

    expect(debugSpy).toHaveBeenCalledWith("Button.png captured in 250ms");
  });

  it("does not log duration for skipped screenshots", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    const page = createPage();
    tool.browser = {} as any;

    const debugSpy = vi.spyOn(tool.logger, "debug");

    await tool.capture(page as any, "Button.png", { skip: true });

    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("captured in"),
    );
  });
});

describe("ScreenshotTool retryScreenshot", () => {
  const createPage = () => ({
    waitForTimeout: vi.fn(async () => {}),
    screenshot: vi.fn(async () => Buffer.from("test")),
    viewportSize: vi.fn(() => ({ width: 1024, height: 768 })),
    setViewportSize: vi.fn(async () => {}),
    url: vi.fn(() => "http://localhost:6006/iframe.html?id=button--primary"),
  });

  const failResult = {
    numDiffPixels: 100,
    totalPixels: 10000,
    percentDifference: 1.0,
    passed: false,
    differentSizes: false,
  };

  const passResult = {
    numDiffPixels: 0,
    totalPixels: 10000,
    percentDifference: 0,
    passed: true,
    differentSizes: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(pixelCompare.compareImages).mockReset();
  });

  it("returns success immediately when the first attempt passes", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", retries: 3 });
    const page = createPage();
    tool.browser = {} as any;

    vi.spyOn(tool, "takeScreenshotBuffer").mockResolvedValue(
      Buffer.from("screenshot"),
    );
    vi.mocked(pixelCompare.compareImages).mockResolvedValue(passResult);

    const result = await tool.retryScreenshot(
      page as any,
      Buffer.from("reference"),
      { viewport: { width: 1024, height: 768 } },
    );

    expect(result.passed).toBe(true);
    expect(tool.takeScreenshotBuffer).toHaveBeenCalledTimes(1);
  });

  it("compares with the reference as the baseline and the capture second", async () => {
    // blazediff's interpret is directional: content only in the second image
    // is an "addition". Swapping these flips additions and deletions.
    const tool = new ScreenshotTool({ outputDir: "/tmp", retries: 1 });
    const page = createPage();
    tool.browser = {} as any;

    const screenshot = Buffer.from("screenshot");
    const reference = Buffer.from("reference");
    vi.spyOn(tool, "takeScreenshotBuffer").mockResolvedValue(screenshot);
    vi.mocked(pixelCompare.compareImages).mockResolvedValue(passResult);

    await tool.retryScreenshot(page as any, reference, {
      viewport: { width: 1024, height: 768 },
    });

    expect(pixelCompare.compareImages).toHaveBeenCalledWith(
      reference,
      screenshot,
      true,
      expect.anything(),
    );
  });

  it("makes exactly `retries` total attempts when all comparisons fail", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", retries: 3 });
    const page = createPage();
    tool.browser = {} as any;

    vi.spyOn(tool, "takeScreenshotBuffer").mockResolvedValue(
      Buffer.from("screenshot"),
    );
    vi.mocked(pixelCompare.compareImages).mockResolvedValue(failResult);

    const result = await tool.retryScreenshot(
      page as any,
      Buffer.from("reference"),
      { viewport: { width: 1024, height: 768 } },
    );

    expect(result.passed).toBe(false);
    expect(tool.takeScreenshotBuffer).toHaveBeenCalledTimes(3);
  });

  it("passes an increasing delay to takeScreenshotBuffer on each retry", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", retries: 3 });
    const page = createPage();
    tool.browser = {} as any;

    const bufferSpy = vi
      .spyOn(tool, "takeScreenshotBuffer")
      .mockResolvedValue(Buffer.from("screenshot"));
    vi.mocked(pixelCompare.compareImages).mockResolvedValue(failResult);

    await tool.retryScreenshot(page as any, Buffer.from("reference"), {
      viewport: { width: 1024, height: 768 },
    });

    expect(bufferSpy).toHaveBeenNthCalledWith(
      1,
      page,
      expect.objectContaining({ delay: 0 }),
    );
    expect(bufferSpy).toHaveBeenNthCalledWith(
      2,
      page,
      expect.objectContaining({ delay: 500 }),
    );
    expect(bufferSpy).toHaveBeenNthCalledWith(
      3,
      page,
      expect.objectContaining({ delay: 1000 }),
    );
  });

  it("logs a warning with the next retry delay on each non-final failure", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", retries: 3 });
    const page = createPage();
    tool.browser = {} as any;

    const warnSpy = vi.spyOn(tool.logger, "warn");
    vi.spyOn(tool, "takeScreenshotBuffer").mockResolvedValue(
      Buffer.from("screenshot"),
    );
    vi.mocked(pixelCompare.compareImages).mockResolvedValue(failResult);

    await tool.retryScreenshot(page as any, Buffer.from("reference"), {
      viewport: { width: 1024, height: 768 },
    });

    // retries=3 → attempts i=0,1,2; non-final failures are i=0 and i=1
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("500ms"),
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("1000ms"),
    );
  });

  it("does not log a warning on the final retry failure", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", retries: 1 });
    const page = createPage();
    tool.browser = {} as any;

    const warnSpy = vi.spyOn(tool.logger, "warn");
    const errorSpy = vi.spyOn(tool.logger, "error");
    vi.spyOn(tool, "takeScreenshotBuffer").mockResolvedValue(
      Buffer.from("screenshot"),
    );
    vi.mocked(pixelCompare.compareImages).mockResolvedValue(failResult);

    await tool.retryScreenshot(page as any, Buffer.from("reference"), {
      viewport: { width: 1024, height: 768 },
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 retries"));
  });

  it("continues retrying even when images have different sizes", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", retries: 3 });
    const page = createPage();
    tool.browser = {} as any;

    const bufferSpy = vi
      .spyOn(tool, "takeScreenshotBuffer")
      .mockResolvedValue(Buffer.from("screenshot"));
    vi.mocked(pixelCompare.compareImages).mockResolvedValue({
      ...failResult,
      differentSizes: true,
    });

    const result = await tool.retryScreenshot(
      page as any,
      Buffer.from("reference"),
      { viewport: { width: 1024, height: 768 } },
    );

    expect(result.passed).toBe(false);
    expect(bufferSpy).toHaveBeenCalledTimes(3);
  });
});

describe("ScreenshotTool connectionTimeout", () => {
  it("defaults to 20000ms", () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    expect(tool.connectionTimeout).toBe(20000);
  });

  it("uses the provided value", () => {
    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      connectionTimeout: 5000,
    });
    expect(tool.connectionTimeout).toBe(5000);
  });
});

describe("ScreenshotTool context lifecycle", () => {
  const createFakeBrowser = () => {
    const contexts: Array<{
      close: ReturnType<typeof vi.fn>;
      newPage: ReturnType<typeof vi.fn>;
    }> = [];

    const browser = {
      newContext: vi.fn(async () => {
        const context = {
          close: vi.fn(async () => {}),
          newPage: vi.fn(async () => ({ evaluate: vi.fn(async () => "UA") })),
        };
        contexts.push(context);
        return context;
      }),
      close: vi.fn(async () => {}),
    };

    return { browser, contexts };
  };

  /** Skips `init()` (which would launch a real browser) but leaves the tool usable. */
  const attachBrowser = (tool: ScreenshotTool, browser: unknown) => {
    tool.browser = browser as never;
  };

  it("closeContexts closes every context and clears the pool", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", concurrency: 2 });
    const { browser, contexts } = createFakeBrowser();
    attachBrowser(tool, browser);

    await (tool as any).createContexts();
    expect(tool.pages).toHaveLength(2);

    await tool.closeContexts();

    expect(contexts).toHaveLength(2);
    expect(
      contexts.every((context) => context.close.mock.calls.length === 1),
    ).toBe(true);
    expect(tool.contexts).toEqual([]);
    expect(tool.pages).toEqual([]);
    expect(tool.page).toBeNull();
  });

  it("recycleContexts replaces the pool without touching the browser", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", concurrency: 1 });
    const { browser, contexts } = createFakeBrowser();
    attachBrowser(tool, browser);

    await (tool as any).createContexts();
    const first = tool.pages[0];

    await tool.recycleContexts();

    expect(contexts).toHaveLength(2);
    expect(contexts[0]?.close).toHaveBeenCalledOnce();
    expect(tool.pages[0]).not.toBe(first);
    expect(browser.close).not.toHaveBeenCalled();
  });

  it("recycleContexts throws when no browser is running", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp" });

    await expect(tool.recycleContexts()).rejects.toThrow(
      "Browser not initialized",
    );
  });

  it("close tears down contexts and the browser", async () => {
    const tool = new ScreenshotTool({ outputDir: "/tmp", concurrency: 1 });
    const { browser, contexts } = createFakeBrowser();
    attachBrowser(tool, browser);

    await (tool as any).createContexts();
    await tool.close();

    expect(contexts[0]?.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(tool.browser).toBeNull();
  });

  it("close survives a browser that is already gone", async () => {
    // What a Ctrl-C looks like from here: a terminal signals the whole
    // foreground process group, so Chromium dies first and every context close
    // fails with "Failed to find context with id …". Teardown that throws turns
    // a clean quit into an uncaught exception.
    const tool = new ScreenshotTool({ outputDir: "/tmp", concurrency: 1 });
    const { browser, contexts } = createFakeBrowser();
    attachBrowser(tool, browser);

    await (tool as any).createContexts();
    contexts[0]?.close.mockRejectedValue(
      new Error("Protocol error (Target.disposeBrowserContext)"),
    );
    browser.close.mockRejectedValue(new Error("Target closed"));

    await expect(tool.close()).resolves.toBeUndefined();

    expect(tool.browser).toBeNull();
    expect(tool.contexts).toEqual([]);
    expect(tool.pages).toEqual([]);
  });
});

describe("setLogSink", () => {
  it("routes the tool's output to the sink and restores the logger", () => {
    // `/tmp`, like every other test here: `ScreenshotFileSystem`'s constructor
    // creates the output directory's parent, so a root-level path fails with
    // EACCES anywhere the tests do not run as root.
    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    const baseLogger = tool.logger;
    const calls: Array<[string, string, unknown[]]> = [];

    tool.setLogSink((level, message, ...args) => {
      calls.push([level, message, args]);
    });

    expect(tool.logger).not.toBe(baseLogger);

    tool.logger.success("Screenshot saved: /tmp/a.png");
    tool.logger.error("Error taking screenshot of x:", "boom");

    expect(calls).toEqual([
      ["success", "Screenshot saved: /tmp/a.png", []],
      ["error", "Error taking screenshot of x:", ["boom"]],
    ]);

    // Restoring must hand back the same instance, so anything holding a
    // reference (a spy, say) keeps working.
    tool.setLogSink(null);
    expect(tool.logger).toBe(baseLogger);
  });
});

describe("stale diffs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("removes the previous run's diff before capturing a screenshot again", async () => {
    const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-stale-"));
    try {
      const tool = new ScreenshotTool({ outputDir });
      tool.browser = {} as any;
      vi.spyOn(tool, "takeScreenshot").mockResolvedValue(
        path.join(outputDir, "actual/button/primary.png"),
      );
      tool.filesystem.hasExpectedFile = vi.fn(async () => false);

      // Left behind by an earlier run that is not being cleared.
      await tool.filesystem.writeDiffFile(
        "button/primary.png",
        Buffer.from("x"),
      );
      await tool.filesystem.writeDiffMetaFile("button/primary.png", {
        numDiffPixels: 1,
        percentDifference: 1,
      });

      await tool.capture(
        { url: () => "about:blank" } as any,
        "button/primary.png",
        {},
      );

      await expect(
        fsp.access(tool.filesystem.getDiffFilePath("button/primary.png")),
      ).rejects.toThrow();
      await expect(
        fsp.access(tool.filesystem.getDiffMetaFilePath("button/primary.png")),
      ).rejects.toThrow();
    } finally {
      await fsp.rm(outputDir, { recursive: true, force: true });
    }
  });
});

describe("size-change diffs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(pixelCompare.createDiffSizePngImage).mockReset();
  });

  const sizeChange = (diffBuffer?: Buffer) => ({
    numDiffPixels: 50,
    totalPixels: 200,
    percentDifference: 25,
    passed: false,
    differentSizes: true,
    diffBuffer,
  });

  const run = async (
    comparisonResult: ReturnType<typeof sizeChange>,
    test: (tool: ScreenshotTool) => Promise<void>,
  ) => {
    const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-size-"));
    try {
      const tool = new ScreenshotTool({ outputDir });
      tool.browser = {} as any;
      vi.spyOn(tool, "retryScreenshot").mockResolvedValue({
        screenshotPath: Buffer.from("actual"),
        comparisonResult,
        passed: false,
      });
      await tool.takeScreenshotWithComparison(
        { url: () => "about:blank" } as any,
        "button.png",
        Buffer.from("expected"),
        { saveDiffImage: true },
      );
      await test(tool);
    } finally {
      await fsp.rm(outputDir, { recursive: true, force: true });
    }
  };

  it("writes the padded-canvas diff instead of a placeholder", async () => {
    await run(sizeChange(Buffer.from("real-diff")), async (tool) => {
      const written = await fsp.readFile(
        tool.filesystem.getDiffFilePath("button.png"),
        "utf8",
      );
      expect(written).toBe("real-diff");
      expect(pixelCompare.createDiffSizePngImage).not.toHaveBeenCalled();
    });
  });

  it("falls back to the placeholder when no diff image was produced", async () => {
    vi.mocked(pixelCompare.createDiffSizePngImage).mockResolvedValue(
      Buffer.from("placeholder"),
    );
    await run(sizeChange(), async (tool) => {
      const written = await fsp.readFile(
        tool.filesystem.getDiffFilePath("button.png"),
        "utf8",
      );
      expect(written).toBe("placeholder");
    });
  });
});

describe("ScreenshotTool browser config", () => {
  type Listener = () => void;

  /** A browser that records every context it is asked for. */
  const createFakeBrowser = () => {
    const listeners: Record<string, Listener[]> = {};
    const contextOptions: unknown[] = [];
    const contexts: Array<{ setDefaultTimeout: ReturnType<typeof vi.fn> }> = [];

    const browser = {
      on: vi.fn((event: string, listener: Listener) => {
        listeners[event] = [...(listeners[event] ?? []), listener];
      }),
      newContext: vi.fn(async (options?: unknown) => {
        contextOptions.push(options);
        const context = {
          close: vi.fn(async () => {}),
          setDefaultTimeout: vi.fn(),
          newPage: vi.fn(async () => ({
            evaluate: vi.fn(async () => "Mozilla/5.0 HeadlessChrome"),
          })),
        };
        contexts.push(context);
        return context;
      }),
      close: vi.fn(async () => {
        for (const listener of listeners.disconnected ?? []) listener();
      }),
      emit: (event: string) => {
        for (const listener of listeners[event] ?? []) listener();
      },
    };

    return { browser, contextOptions, contexts };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("derives browserType and headless from the browser config", () => {
    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      browserType: "webkit",
      browser: { headless: false, instances: [{ browser: "firefox" }] },
    });

    expect(tool.browserType).toBe("firefox");
    expect(tool.headless).toBe(false);
  });

  it("keeps the legacy browserType and headless options working", () => {
    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      browserType: "webkit",
      headless: false,
    });

    expect(tool.browserConfig).toEqual({
      provider: { name: "playwright", options: {} },
      headless: false,
      instances: [{ browser: "webkit" }],
    });
  });

  it("launches with exactly today's options when nothing is configured", async () => {
    const { browser, contextOptions } = createFakeBrowser();
    const launch = vi
      .spyOn(chromium, "launch")
      .mockResolvedValue(browser as never);
    const connect = vi.spyOn(chromium, "connect");

    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    await tool.init();

    expect(launch).toHaveBeenCalledWith({ headless: true });
    expect(connect).not.toHaveBeenCalled();
    // [0] is the throwaway context that measures the default user agent.
    expect(contextOptions[1]).toEqual({
      reducedMotion: "reduce",
      deviceScaleFactor: 2,
      userAgent: "Mozilla/5.0 HeadlessChrome CappaStorybook",
      viewport: { width: 1920, height: 1080 },
    });
  });

  it("passes launchOptions to launch, with browser.headless winning", async () => {
    const { browser } = createFakeBrowser();
    const launch = vi
      .spyOn(firefox, "launch")
      .mockResolvedValue(browser as never);

    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      browser: {
        provider: playwright({
          launchOptions: { args: ["--foo"], headless: true } as never,
        }),
        headless: false,
        instances: [{ browser: "firefox" }],
      },
    });
    await tool.init();

    expect(launch).toHaveBeenCalledWith({ args: ["--foo"], headless: false });
  });

  it("connects when wsEndpoint is set, forwarding launch options in a header", async () => {
    const { browser } = createFakeBrowser();
    const launch = vi.spyOn(chromium, "launch");
    const connect = vi
      .spyOn(chromium, "connect")
      .mockResolvedValue(browser as never);

    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      browser: {
        provider: playwright({
          launchOptions: { args: ["--font-render-hinting=none"] },
          connectOptions: {
            wsEndpoint: "ws://localhost:3000/",
            exposeNetwork: "<loopback>",
            timeout: 5_000,
            headers: { authorization: "Bearer x" },
          },
        }),
      },
    });
    await tool.init();

    expect(launch).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith("ws://localhost:3000/", {
      exposeNetwork: "<loopback>",
      timeout: 5_000,
      headers: {
        "x-playwright-launch-options": JSON.stringify({
          args: ["--font-render-hinting=none"],
          headless: true,
        }),
        authorization: "Bearer x",
      },
    });
  });

  it("lets a configured header override the launch-options header", async () => {
    const { browser } = createFakeBrowser();
    const connect = vi
      .spyOn(chromium, "connect")
      .mockResolvedValue(browser as never);

    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      browser: {
        provider: playwright({
          connectOptions: {
            wsEndpoint: "ws://localhost:3000/",
            headers: { "x-playwright-launch-options": "{}" },
          },
        }),
      },
    });
    await tool.init();

    const [, options] = connect.mock.calls[0] as unknown as [
      string,
      { headers?: Record<string, string> },
    ];
    expect(options.headers).toEqual({
      "x-playwright-launch-options": "{}",
    });
  });

  it("launches locally when wsEndpoint is unset", async () => {
    const { browser } = createFakeBrowser();
    const launch = vi
      .spyOn(chromium, "launch")
      .mockResolvedValue(browser as never);
    const connect = vi.spyOn(chromium, "connect");

    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      browser: {
        provider: playwright({
          connectOptions: { wsEndpoint: undefined, exposeNetwork: "*" },
        }),
      },
    });
    await tool.init();

    expect(launch).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
  });

  it("rethrows connection failures with an actionable message", async () => {
    vi.spyOn(chromium, "connect").mockRejectedValue(
      new Error("WebSocket error: connect ECONNREFUSED 127.0.0.1:3000"),
    );

    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      browser: {
        provider: playwright({
          connectOptions: { wsEndpoint: "ws://localhost:3000/" },
        }),
      },
    });

    await expect(tool.init()).rejects.toThrow(
      /^No Playwright server at ws:\/\/localhost:3000\//,
    );
  });

  describe("container", () => {
    const fakeContainer = (reused = false) => ({
      wsEndpoint: "ws://127.0.0.1:49153/",
      name: "cappa-playwright-v1.63.0-abcd1234",
      image: "mcr.microsoft.com/playwright:v1.63.0-noble",
      reused,
      stop: vi.fn(async () => {}),
    });

    beforeEach(() => {
      vi.mocked(ensurePlaywrightContainer).mockReset();
    });

    it("starts a container for the installed version and connects with loopback exposed", async () => {
      const { browser } = createFakeBrowser();
      const container = fakeContainer();
      vi.mocked(ensurePlaywrightContainer).mockResolvedValue(container);
      const launch = vi.spyOn(chromium, "launch");
      const connect = vi
        .spyOn(chromium, "connect")
        .mockResolvedValue(browser as never);

      const tool = new ScreenshotTool({
        outputDir: "/tmp",
        browser: {
          provider: playwright({
            container: { cli: "podman", runArgs: ["--userns=keep-id"] },
          }),
        },
      });
      await tool.init();

      expect(ensurePlaywrightContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          cli: "podman",
          runArgs: ["--userns=keep-id"],
          image: "mcr.microsoft.com/playwright:v{version}-noble",
          version: expect.stringMatching(/^\d+\.\d+\.\d+/),
          packageDir: expect.stringMatching(/playwright-core$/),
        }),
      );
      expect(launch).not.toHaveBeenCalled();
      expect(connect).toHaveBeenCalledWith("ws://127.0.0.1:49153/", {
        exposeNetwork: "<loopback>",
        headers: {
          "x-playwright-launch-options": JSON.stringify({ headless: true }),
        },
      });

      // keepAlive defaults to true: the container outlives the tool.
      await tool.close();
      expect(container.stop).not.toHaveBeenCalled();
    });

    it("keeps a configured exposeNetwork", async () => {
      const { browser } = createFakeBrowser();
      vi.mocked(ensurePlaywrightContainer).mockResolvedValue(fakeContainer());
      const connect = vi
        .spyOn(chromium, "connect")
        .mockResolvedValue(browser as never);

      const tool = new ScreenshotTool({
        outputDir: "/tmp",
        browser: {
          provider: playwright({
            container: true,
            connectOptions: { exposeNetwork: "localhost:6006" },
          }),
        },
      });
      await tool.init();

      expect(connect).toHaveBeenCalledWith(
        "ws://127.0.0.1:49153/",
        expect.objectContaining({ exposeNetwork: "localhost:6006" }),
      );
    });

    it("lets wsEndpoint win over container", async () => {
      const { browser } = createFakeBrowser();
      const connect = vi
        .spyOn(chromium, "connect")
        .mockResolvedValue(browser as never);

      const tool = new ScreenshotTool({
        outputDir: "/tmp",
        browser: {
          provider: playwright({
            container: true,
            connectOptions: { wsEndpoint: "ws://elsewhere:3000/" },
          }),
        },
      });
      await tool.init();

      expect(ensurePlaywrightContainer).not.toHaveBeenCalled();
      expect(connect).toHaveBeenCalledWith(
        "ws://elsewhere:3000/",
        expect.not.objectContaining({ exposeNetwork: expect.anything() }),
      );
    });

    it("removes the container on close when keepAlive is false", async () => {
      const { browser } = createFakeBrowser();
      const container = fakeContainer();
      vi.mocked(ensurePlaywrightContainer).mockResolvedValue(container);
      vi.spyOn(chromium, "connect").mockResolvedValue(browser as never);

      const tool = new ScreenshotTool({
        outputDir: "/tmp",
        browser: {
          provider: playwright({ container: { keepAlive: false } }),
        },
      });
      await tool.init();
      await tool.close();

      expect(container.stop).toHaveBeenCalledOnce();
      expect(tool.container).toBeNull();
    });

    it("leaves a reused container alone even when keepAlive is false", async () => {
      const { browser } = createFakeBrowser();
      const container = fakeContainer(true);
      vi.mocked(ensurePlaywrightContainer).mockResolvedValue(container);
      vi.spyOn(chromium, "connect").mockResolvedValue(browser as never);

      const tool = new ScreenshotTool({
        outputDir: "/tmp",
        browser: {
          provider: playwright({ container: { keepAlive: false } }),
        },
      });
      await tool.init();
      await tool.close();

      expect(container.stop).not.toHaveBeenCalled();
    });

    it("blames a custom image for a version mismatch", async () => {
      vi.mocked(ensurePlaywrightContainer).mockResolvedValue({
        ...fakeContainer(),
        image: "corp/pw:latest",
      });
      vi.spyOn(chromium, "connect").mockRejectedValue(
        new Error("428 Precondition Required: Playwright version mismatch"),
      );

      const tool = new ScreenshotTool({
        outputDir: "/tmp",
        browser: { provider: playwright({ container: true }) },
      });

      await expect(tool.init()).rejects.toThrow(
        /container image corp\/pw:latest runs a different Playwright version/,
      );
    });
  });

  it("merges contextOptions over the defaults, keeping viewport and UA suffix", async () => {
    const { browser, contextOptions, contexts } = createFakeBrowser();
    vi.spyOn(chromium, "launch").mockResolvedValue(browser as never);

    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      concurrency: 2,
      viewport: { width: 800, height: 600 },
      browser: {
        provider: playwright({
          contextOptions: {
            deviceScaleFactor: 1,
            colorScheme: "dark",
            userAgent: "Custom/1.0",
            viewport: { width: 1, height: 1 },
          } as never,
          actionTimeout: 10_000,
        }),
      },
    });
    await tool.init();

    // A custom user agent is not measured, so no throwaway context.
    expect(contextOptions).toHaveLength(2);
    for (const options of contextOptions) {
      expect(options).toEqual({
        reducedMotion: "reduce",
        deviceScaleFactor: 1,
        colorScheme: "dark",
        userAgent: "Custom/1.0 CappaStorybook",
        viewport: { width: 800, height: 600 },
      });
    }
    for (const context of contexts) {
      expect(context.setDefaultTimeout).toHaveBeenCalledWith(10_000);
    }
  });

  it("keeps the context options when recycling contexts", async () => {
    const { browser, contextOptions } = createFakeBrowser();
    vi.spyOn(chromium, "launch").mockResolvedValue(browser as never);

    const tool = new ScreenshotTool({
      outputDir: "/tmp",
      browser: {
        provider: playwright({ contextOptions: { locale: "de-DE" } }),
      },
    });
    await tool.init();
    await tool.recycleContexts();

    expect(contextOptions.at(-1)).toMatchObject({ locale: "de-DE" });
    expect(contextOptions.at(-1)).toEqual(contextOptions.at(-2));
  });

  it("sets no default timeout without actionTimeout", async () => {
    const { browser, contexts } = createFakeBrowser();
    vi.spyOn(chromium, "launch").mockResolvedValue(browser as never);

    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    await tool.init();

    expect(contexts.at(-1)?.setDefaultTimeout).not.toHaveBeenCalled();
  });

  it("marks the tool disconnected when the browser goes away", async () => {
    const { browser } = createFakeBrowser();
    vi.spyOn(chromium, "launch").mockResolvedValue(browser as never);

    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    await tool.init();
    expect(tool.disconnected).toBe(false);

    browser.emit("disconnected");

    expect(tool.disconnected).toBe(true);
  });

  it("does not count its own close as a disconnect", async () => {
    const { browser } = createFakeBrowser();
    vi.spyOn(chromium, "launch").mockResolvedValue(browser as never);

    const tool = new ScreenshotTool({ outputDir: "/tmp" });
    await tool.init();
    await tool.close();

    expect(browser.close).toHaveBeenCalledOnce();
    expect(tool.disconnected).toBe(false);
  });
});

describe("describeConnectError", () => {
  const endpoint = "ws://localhost:3000/";

  it("names the matching Docker image on a version mismatch", () => {
    const raw = new Error(
      "browserType.connect: Playwright version mismatch:\n  - server version: v1.50\n  - client version: v1.63",
    );

    const error = describeConnectError(raw, endpoint, "1.63.0");

    expect(error.message).toContain("playwright-core 1.63.0");
    expect(error.message).toContain(
      "mcr.microsoft.com/playwright:v1.63.0-noble",
    );
    expect(error.message).toContain(raw.message);
    expect(error.cause).toBe(raw);
  });

  it("treats a 428 response as a version mismatch", () => {
    const error = describeConnectError(
      new Error("Unexpected server response: 428"),
      endpoint,
      "1.63.0",
    );

    expect(error.message).toContain("different Playwright version");
  });

  it("still explains a mismatch when the client version is unknown", () => {
    const error = describeConnectError(
      new Error("Playwright version mismatch"),
      endpoint,
      null,
    );

    expect(error.message).toContain("mcr.microsoft.com/playwright image");
  });

  it("reports a timeout as a timeout", () => {
    const error = describeConnectError(
      new Error("browserType.connect: Timeout 5000ms exceeded."),
      endpoint,
      "1.63.0",
    );

    expect(error.message).toMatch(
      /^Timed out connecting to the Playwright server at ws:\/\/localhost:3000\//,
    );
  });

  it("reports anything else as no server, with a docs link", () => {
    const error = describeConnectError(
      new Error("connect ECONNREFUSED 127.0.0.1:3000"),
      endpoint,
      "1.63.0",
    );

    expect(error.message).toMatch(/^No Playwright server at /);
    expect(error.message).toContain("#connecting-to-a-remote-browser");
    expect(error.message).toContain("ECONNREFUSED");
  });

  it("reads the installed playwright-core version by default", () => {
    const error = describeConnectError(
      new Error("Playwright version mismatch"),
      endpoint,
    );

    expect(error.message).toMatch(/playwright-core \d+\.\d+\.\d+/);
  });
});
