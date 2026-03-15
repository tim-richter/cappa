import { beforeEach, describe, expect, it, vi } from "vitest";
import { cappaPluginStorybook, type StorybookStory } from "./plugin";

// Mock the logger
vi.mock("@cappa/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    start: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("./util", () => ({
  buildFilename: vi.fn(() => "button--primary.png"),
  freezeUI: vi.fn(async () => {}),
  waitForVisualIdle: vi.fn(async () => {}),
}));

vi.mock("./storybook-url", () => ({
  buildStorybookIframeUrl: vi.fn(
    () => "http://localhost:6006/iframe.html?id=story",
  ),
}));

// Mock fetch
global.fetch = vi.fn();

describe("cappaPluginStorybook - includeStories / excludeStories predicates", () => {
  const mockStories: StorybookStory[] = [
    {
      id: "button--primary",
      name: "Primary",
      title: "Button",
      kind: "Button",
      story: "Primary",
      type: "story",
    },
    {
      id: "button--secondary",
      name: "Secondary",
      title: "Button",
      kind: "Button",
      story: "Secondary",
      type: "story",
    },
    {
      id: "input--default",
      name: "Default",
      title: "Input",
      kind: "Input",
      story: "Default",
      type: "story",
    },
    {
      id: "input--with-label",
      name: "With Label",
      title: "Input",
      kind: "Input",
      story: "With Label",
      type: "story",
    },
    {
      id: "card--basic",
      name: "Basic",
      title: "Card",
      kind: "Card",
      story: "Basic",
      type: "story",
    },
    {
      id: "card--advanced",
      name: "Advanced",
      title: "Card",
      kind: "Card",
      story: "Advanced",
      type: "story",
    },
  ];

  const mockStorybookResponse = {
    entries: mockStories.reduce(
      (acc, story) => {
        acc[story.id] = story;
        return acc;
      },
      {} as Record<string, StorybookStory>,
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStorybookResponse),
    });
  });

  describe("includeStories predicate", () => {
    it("should include stories when predicate returns true for exact id", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.id === "button--primary",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(1);
      expect(result[0]?.data.story.id).toBe("button--primary");
    });

    it("should include stories when predicate matches by id prefix", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.id.startsWith("button--"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "button--secondary",
      ]);
    });

    it("should include stories when predicate matches by title", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.title === "Button",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "button--secondary",
      ]);
    });

    it("should include stories when predicate matches by name", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.name === "Primary",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(1);
      expect(result[0]?.data.story.id).toBe("button--primary");
    });

    it("should include stories when predicate matches by filePath", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.filePath.startsWith("Button/"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "button--secondary",
      ]);
    });

    it("should include stories when predicate matches multiple", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) =>
          s.id.startsWith("button--") || s.id.startsWith("input--"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(4);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "button--secondary",
        "input--default",
        "input--with-label",
      ]);
    });

    it("should include stories when predicate uses multiple fields", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.name === "Primary" || s.name === "Default",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "input--default",
      ]);
    });
  });

  describe("excludeStories predicate", () => {
    it("should exclude stories when predicate returns true for exact id", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: (s) => s.id === "button--primary",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(5);
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--primary",
      );
    });

    it("should exclude stories when predicate matches by id prefix", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: (s) => s.id.startsWith("button--"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(4);
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--primary",
      );
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--secondary",
      );
    });

    it("should exclude stories when predicate matches by title", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: (s) => s.title === "Button",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(4);
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--primary",
      );
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--secondary",
      );
    });

    it("should exclude stories when predicate matches by name", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: (s) => s.name === "Primary",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(5);
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--primary",
      );
    });

    it("should exclude stories when predicate matches by filePath", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: (s) => s.filePath.startsWith("Button/"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(4);
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--primary",
      );
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--secondary",
      );
    });

    it("should exclude stories when predicate matches multiple", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: (s) =>
          s.id.startsWith("button--") || s.id.startsWith("input--"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "card--basic",
        "card--advanced",
      ]);
    });
  });

  describe("combined includeStories and excludeStories", () => {
    it("should apply include first, then exclude", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: () => true,
        excludeStories: (s) => s.id.startsWith("button--"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(4);
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--primary",
      );
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--secondary",
      );
    });

    it("should work with overlapping include and exclude", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.name === "Primary" || s.name === "Default",
        excludeStories: (s) => s.id.startsWith("button--"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(1);
      expect(result[0]?.data.story.id).toBe("input--default");
    });
  });

  describe("edge cases", () => {
    it("should include all stories when neither option is provided", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(6);
    });

    it("should return no stories when include predicate matches none", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.id === "nonexistent--story",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(0);
    });

    it("should respect case-sensitive matching in predicate", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.title === "button",
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(0);
    });

    it("should include story with special characters when predicate matches", async () => {
      const specialStory: StorybookStory = {
        id: "special--with-dots.and-brackets[test]",
        name: "With Dots.And Brackets[Test]",
        title: "Special",
        kind: "Special",
        story: "With Dots.And Brackets[Test]",
        type: "story",
      };

      const specialResponse = {
        entries: {
          ...mockStorybookResponse.entries,
          [specialStory.id]: specialStory,
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(specialResponse),
      });

      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: (s) => s.id.startsWith("special--"),
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(1);
      expect(result[0]?.data.story.id).toBe(
        "special--with-dots.and-brackets[test]",
      );
    });
  });
});

describe("console logging configuration", () => {
  const story: StorybookStory = {
    id: "button--primary",
    name: "Primary",
    title: "Button",
    kind: "Button",
    story: "Primary",
    type: "story",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createPage = () => {
    const exposedFunctions: Record<
      string,
      (id: string, payload: unknown) => unknown
    > = {};

    return {
      on: vi.fn(),
      evaluate: vi.fn(async (fn: any) => {
        if (typeof fn === "function") {
          const source = fn.toString();
          if (source.includes("__cappa_parameters")) {
            return true;
          }
          if (source.includes("__cappa_has_play_function")) {
            return false;
          }
        }

        return undefined;
      }),
      exposeFunction: vi.fn(
        async (name: string, fn: (id: string, payload: unknown) => unknown) => {
          exposedFunctions[name] = fn;
        },
      ),
      goto: vi.fn(async () => {
        await exposedFunctions.__cappa_parameters?.(story.id, {
          viewport: { width: 800, height: 600 },
          delay: 300,
          diff: { threshold: 0.2 },
          variants: [
            {
              id: "mobile",
              options: {
                viewport: { width: 375, height: 667 },
                delay: 150,
                diff: { threshold: 0.3 },
              },
            },
          ],
        });
      }),
      setViewportSize: vi.fn(async () => {}),
      viewportSize: vi.fn(() => ({ width: 1024, height: 768 })),
      waitForTimeout: vi.fn(async () => {}),
      locator: vi.fn(() => ({ locator: true })),
      waitForFunction: vi.fn(async () => {}),
    };
  };

  const createScreenshotTool = () => ({
    viewport: { width: 1024, height: 768 },
    logConsoleEvents: true,
    getVariantFilename: vi.fn(
      (filename: string, variant: { id: string }) =>
        `${filename}-${variant.id}.png`,
    ),
    captureWithVariants: vi.fn(async () => ({
      base: {
        filename: "button--primary.png",
        filepath: "button--primary.png",
        skipped: false,
        comparisonResult: { passed: true },
      },
      variants: [],
    })),
  });

  const createTask = () => ({
    id: story.id,
    url: "http://localhost:6006/iframe.html?id=button--primary",
    data: { story },
  });

  it("logs console events by default", async () => {
    const plugin = cappaPluginStorybook({
      storybookUrl: "http://localhost:6006",
    });

    const page = createPage();
    const screenshotTool = createScreenshotTool();
    const context = (await plugin.initPage?.(
      page as any,
      screenshotTool as any,
    )) ?? { latchMap: new Map() };

    await plugin.execute(
      createTask(),
      page as any,
      screenshotTool as any,
      context,
    );

    expect(screenshotTool.captureWithVariants).toHaveBeenCalledTimes(1);
    const [, , , baseOptions, variantsWithUrls, captureExtras] = (
      screenshotTool.captureWithVariants as any
    ).mock.calls[0];

    expect(baseOptions.delay).toBe(300);
    expect(variantsWithUrls[0].options.delay).toBe(150);
    expect(captureExtras.diff).toEqual({ threshold: 0.2 });
    expect(captureExtras.variants?.mobile?.diff).toEqual({ threshold: 0.3 });

    expect(
      (page.on as any).mock.calls.some(
        ([event]: [string]) => event === "console",
      ),
    ).toBe(true);
  });

  it("skips console logging when disabled", async () => {
    const page = createPage();
    const screenshotTool = {
      ...createScreenshotTool(),
      logConsoleEvents: false,
    };
    const plugin = cappaPluginStorybook({
      storybookUrl: "http://localhost:6006",
    });
    const context = (await plugin.initPage?.(
      page as any,
      screenshotTool as any,
    )) ?? { latchMap: new Map() };

    await plugin.execute(
      createTask(),
      page as any,
      screenshotTool as any,
      context,
    );

    expect(
      (page.on as any).mock.calls.some(
        ([event]: [string]) => event === "console",
      ),
    ).toBe(false);
    expect(
      (page.on as any).mock.calls.some(
        ([event]: [string]) => event === "pageerror",
      ),
    ).toBe(true);
  });

  it("passes diff algorithm types from story parameters to capture extras", async () => {
    const plugin = cappaPluginStorybook({
      storybookUrl: "http://localhost:6006",
    });

    const page = createPage() as any;
    page.goto = vi.fn(async () => {
      await page.exposeFunction.mock.calls[0][1](story.id, {
        diff: { type: "gmsd", threshold: 0.2, downsample: 1 },
        variants: [
          {
            id: "mobile",
            options: {
              diff: { type: "pixel", threshold: 0.3, maxDiffPixels: 10 },
            },
          },
        ],
      });
    });

    const screenshotTool = createScreenshotTool();
    const context = (await plugin.initPage?.(page, screenshotTool as any)) ?? {
      latchMap: new Map(),
    };

    await plugin.execute(createTask(), page, screenshotTool as any, context);

    const [, , , , , captureExtras] = (
      screenshotTool.captureWithVariants as any
    ).mock.calls[0];

    expect(captureExtras.diff).toEqual({
      type: "gmsd",
      threshold: 0.2,
      downsample: 1,
    });
    expect(captureExtras.variants?.mobile?.diff).toEqual({
      type: "pixel",
      threshold: 0.3,
      maxDiffPixels: 10,
    });
  });
});
