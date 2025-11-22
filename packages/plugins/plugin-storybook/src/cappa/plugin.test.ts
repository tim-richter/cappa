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

describe("cappaPluginStorybook - Glob Pattern Matching", () => {
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

  describe("includeStories glob patterns", () => {
    it("should include stories matching exact story id", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["button--primary"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(1);
      expect(result[0]?.data.story.id).toBe("button--primary");
    });

    it("should include stories matching wildcard patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["button--*"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "button--secondary",
      ]);
    });

    it("should include stories matching title patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["Button"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "button--secondary",
      ]);
    });

    it("should include stories matching name patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["Primary"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(1);
      expect(result[0]?.data.story.id).toBe("button--primary");
    });

    it("should include stories matching full path patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["Button/*"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "button--secondary",
      ]);
    });

    it("should include stories matching multiple patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["button--*", "input--*"],
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

    it("should include stories matching complex glob patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["*--primary", "*--default"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.data.story.id)).toEqual([
        "button--primary",
        "input--default",
      ]);
    });
  });

  describe("excludeStories glob patterns", () => {
    it("should exclude stories matching exact story id", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: ["button--primary"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(5);
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--primary",
      );
    });

    it("should exclude stories matching wildcard patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: ["button--*"],
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

    it("should exclude stories matching title patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: ["Button"],
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

    it("should exclude stories matching name patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: ["Primary"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(5);
      expect(result.map((r) => r.data.story.id)).not.toContain(
        "button--primary",
      );
    });

    it("should exclude stories matching full path patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: ["Button/*"],
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

    it("should exclude stories matching multiple patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: ["button--*", "input--*"],
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
    it("should apply include patterns first, then exclude patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["*--*"], // Include all stories
        excludeStories: ["button--*"], // Then exclude button stories
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

    it("should work with overlapping patterns", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["*--primary", "*--default"], // Include primary and default stories
        excludeStories: ["button--*"], // Exclude all button stories
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(1);
      expect(result[0]?.data.story.id).toBe("input--default");
    });
  });

  describe("edge cases", () => {
    it("should handle empty includeStories array", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: [],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(6); // All stories included
    });

    it("should handle empty excludeStories array", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        excludeStories: [],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(6);
    });

    it("should handle patterns that match no stories", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["nonexistent--*"],
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(0);
    });

    it("should handle case-sensitive matching", async () => {
      const plugin = cappaPluginStorybook({
        storybookUrl: "http://localhost:6006",
        includeStories: ["button"], // lowercase
      });

      const result = await plugin.discover({} as any);
      expect(result).toHaveLength(0); // No matches because "Button" is capitalized
    });

    it("should handle special glob characters in story names", async () => {
      // Add a story with special characters
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
        includeStories: ["special--*"],
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
});
