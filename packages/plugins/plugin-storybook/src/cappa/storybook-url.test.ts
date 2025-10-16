import { describe, expect, it } from "vitest";

import { buildStorybookIframeUrl } from "./storybook-url";

describe("buildStorybookIframeUrl", () => {
  it("builds a default url", () => {
    expect(
      buildStorybookIframeUrl({
        baseUrl: "https://storybook.example.com",
        storyId: "button--primary",
      }),
    ).toBe(
      "https://storybook.example.com/iframe.html?id=button--primary&viewMode=story&full=1&singleStory=true",
    );
  });

  it("includes args, globals and query parameters", () => {
    expect(
      buildStorybookIframeUrl({
        baseUrl: "https://storybook.example.com",
        storyId: "button--primary",
        args: { label: "Click Me", count: 2 },
        globals: { locale: "en", darkMode: true },
        query: { nav: false },
      }),
    ).toBe(
      "https://storybook.example.com/iframe.html?id=button--primary&viewMode=story&args=label%3AClick%2520Me%3Bcount%3A2&globals=locale%3Aen%3BdarkMode%3Atrue&full=1&singleStory=true&nav=false",
    );
  });

  it("omits fullscreen and single story flags when disabled", () => {
    expect(
      buildStorybookIframeUrl({
        baseUrl: "https://storybook.example.com",
        storyId: "button--primary",
        fullscreen: false,
        singleStory: false,
      }),
    ).toBe(
      "https://storybook.example.com/iframe.html?id=button--primary&viewMode=story",
    );
  });
});
