import { initLogger } from "@cappa/logger";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ScreenshotTool from "./screenshot";

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
    tool.filesystem.ensureParentDir = vi.fn();

    await tool.takeScreenshot(page as any, "Button.png", {
      delay: 250,
      viewport: { width: 1024, height: 768 },
    });

    expect(page.waitForTimeout).toHaveBeenCalledWith(250);
    expect(page.waitForTimeout.mock.invocationCallOrder[0]).toBeLessThan(
      page.screenshot.mock.invocationCallOrder[0],
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
      page.screenshot.mock.invocationCallOrder[0],
    );
  });
});
