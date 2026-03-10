import { describe, expect, it, vi } from "vitest";

// Mock @cappa/logger before importing plugin
vi.mock("@cappa/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    start: vi.fn(),
    success: vi.fn(),
  }),
}));

import { cappaPluginPages } from "./plugin";

describe("cappaPluginPages", () => {
  describe("factory", () => {
    it("returns a valid PluginDef", () => {
      const plugin = cappaPluginPages({
        pages: [{ url: "https://example.com" }],
      });

      expect(plugin.name).toBe("PagesPlugin");
      expect(plugin.description).toBe("Takes screenshots of a list of URLs");
      expect(typeof plugin.discover).toBe("function");
      expect(typeof plugin.execute).toBe("function");
      expect(typeof plugin.initPage).toBe("function");
    });
  });

  describe("discover", () => {
    it("throws when options are not provided", async () => {
      const plugin = cappaPluginPages(undefined);
      await expect(plugin.discover({} as any)).rejects.toThrow(
        "Pages plugin options are required",
      );
    });

    it("throws when pages array is empty", async () => {
      const plugin = cappaPluginPages({ pages: [] });
      await expect(plugin.discover({} as any)).rejects.toThrow(
        "At least one page entry is required",
      );
    });

    it("creates tasks from page entries with names", async () => {
      const plugin = cappaPluginPages({
        pages: [
          { url: "https://example.com", name: "homepage" },
          { url: "https://example.com/about", name: "about" },
        ],
      });

      const tasks = await plugin.discover({} as any);

      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual({
        id: "homepage",
        url: "https://example.com",
        data: { url: "https://example.com", name: "homepage" },
      });
      expect(tasks[1]).toEqual({
        id: "about",
        url: "https://example.com/about",
        data: { url: "https://example.com/about", name: "about" },
      });
    });

    it("derives task IDs from URLs when no name provided", async () => {
      const plugin = cappaPluginPages({
        pages: [{ url: "https://example.com/pricing" }],
      });

      const tasks = await plugin.discover({} as any);

      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.id).toBe("example-com/pricing");
      expect(tasks[0]?.url).toBe("https://example.com/pricing");
    });
  });

  describe("execute", () => {
    function createMockPage() {
      return {
        goto: vi.fn().mockResolvedValue(undefined),
        addStyleTag: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        setViewportSize: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockReturnValue({}),
        evaluate: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      } as any;
    }

    function createMockScreenshotTool(overrides?: Record<string, any>) {
      return {
        viewport: { width: 1920, height: 1080 },
        logConsoleEvents: false,
        captureWithVariants: vi.fn().mockResolvedValue({
          base: {
            filename: "test.png",
            filepath: "/screenshots/actual/test.png",
            skipped: false,
            comparisonResult: { passed: true },
          },
          variants: [],
        }),
        ...overrides,
      } as any;
    }

    it("navigates to the URL and captures a screenshot", async () => {
      const plugin = cappaPluginPages({
        pages: [{ url: "https://example.com", name: "homepage" }],
      });

      const page = createMockPage();
      const screenshotTool = createMockScreenshotTool();

      const result = await plugin.execute(
        {
          id: "homepage",
          url: "https://example.com",
          data: { url: "https://example.com", name: "homepage" },
        },
        page,
        screenshotTool,
        {},
      );

      expect(page.goto).toHaveBeenCalledWith("https://example.com", {
        waitUntil: "domcontentloaded",
      });
      expect(screenshotTool.captureWithVariants).toHaveBeenCalled();
      expect(result).toMatchObject({
        name: "homepage",
        url: "https://example.com",
        success: true,
      });
    });

    it("applies per-page viewport override", async () => {
      const plugin = cappaPluginPages({
        pages: [
          {
            url: "https://example.com",
            name: "mobile",
            options: { viewport: { width: 375, height: 667 } },
          },
        ],
      });

      const page = createMockPage();
      const screenshotTool = createMockScreenshotTool();

      await plugin.execute(
        {
          id: "mobile",
          url: "https://example.com",
          data: {
            url: "https://example.com",
            name: "mobile",
            options: { viewport: { width: 375, height: 667 } },
          },
        },
        page,
        screenshotTool,
        {},
      );

      expect(page.setViewportSize).toHaveBeenCalledWith({
        width: 375,
        height: 667,
      });
    });

    it("converts mask selectors to locators", async () => {
      const plugin = cappaPluginPages({
        pages: [
          {
            url: "https://example.com",
            name: "test",
            options: { mask: [".ad-banner", "#cookie-popup"] },
          },
        ],
      });

      const page = createMockPage();
      const screenshotTool = createMockScreenshotTool();

      await plugin.execute(
        {
          id: "test",
          url: "https://example.com",
          data: {
            url: "https://example.com",
            name: "test",
            options: { mask: [".ad-banner", "#cookie-popup"] },
          },
        },
        page,
        screenshotTool,
        {},
      );

      expect(page.locator).toHaveBeenCalledWith(".ad-banner");
      expect(page.locator).toHaveBeenCalledWith("#cookie-popup");
    });

    it("merges default options with per-page options", async () => {
      const plugin = cappaPluginPages({
        pages: [
          {
            url: "https://example.com",
            name: "test",
            options: { delay: 500 },
          },
        ],
        defaults: { fullPage: false, delay: 100 },
      });

      const page = createMockPage();
      const screenshotTool = createMockScreenshotTool();

      await plugin.execute(
        {
          id: "test",
          url: "https://example.com",
          data: {
            url: "https://example.com",
            name: "test",
            options: { delay: 500 },
          },
        },
        page,
        screenshotTool,
        {},
      );

      // The per-page delay (500) should override the default (100)
      const captureCall = screenshotTool.captureWithVariants.mock.calls[0];
      const screenshotSettings = captureCall[3];
      expect(screenshotSettings.delay).toBe(500);
      expect(screenshotSettings.fullPage).toBe(false);
    });

    it("returns error result on failure", async () => {
      const plugin = cappaPluginPages({
        pages: [{ url: "https://example.com", name: "test" }],
      });

      const page = createMockPage();
      page.goto.mockRejectedValue(new Error("net::ERR_CONNECTION_REFUSED"));
      const screenshotTool = createMockScreenshotTool();

      const result = await plugin.execute(
        {
          id: "test",
          url: "https://example.com",
          data: { url: "https://example.com", name: "test" },
        },
        page,
        screenshotTool,
        {},
      );

      expect(result).toMatchObject({
        name: "test",
        url: "https://example.com",
        error: "net::ERR_CONNECTION_REFUSED",
      });
    });

    it("applies custom wait strategy per page", async () => {
      const plugin = cappaPluginPages({
        pages: [
          {
            url: "https://example.com",
            name: "test",
            wait: {
              waitForSelector: "#main-content",
              waitForNetworkIdle: false,
            },
          },
        ],
      });

      const page = createMockPage();
      const screenshotTool = createMockScreenshotTool();

      await plugin.execute(
        {
          id: "test",
          url: "https://example.com",
          data: {
            url: "https://example.com",
            name: "test",
            wait: {
              waitForSelector: "#main-content",
              waitForNetworkIdle: false,
            },
          },
        },
        page,
        screenshotTool,
        {},
      );

      expect(page.waitForSelector).toHaveBeenCalledWith("#main-content", {
        timeout: 15000,
      });
    });
  });
});
