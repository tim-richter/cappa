import { initLogger } from "@cappa/logger";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pixelCompare from "./compare/pixel";
import ScreenshotTool from "./screenshot";

vi.mock("./compare/pixel", () => ({
  compareImages: vi.fn(),
  createDiffSizePngImage: vi.fn(),
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
