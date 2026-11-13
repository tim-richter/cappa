import { describe, expect, it } from "vitest";
import { playwright, resolveBrowserConfig } from "./playwright";

describe("playwright()", () => {
  it("wraps its options in a provider", () => {
    const options = { actionTimeout: 5_000 };

    expect(playwright(options)).toEqual({ name: "playwright", options });
  });

  it("defaults to no options", () => {
    expect(playwright()).toEqual({ name: "playwright", options: {} });
  });
});

describe("resolveBrowserConfig", () => {
  it("fills every default for a missing block", () => {
    expect(resolveBrowserConfig(undefined)).toEqual({
      provider: { name: "playwright", options: {} },
      headless: true,
      instances: [{ browser: "chromium" }],
    });
  });

  it("keeps what was configured", () => {
    const provider = playwright({
      connectOptions: { wsEndpoint: "ws://localhost:3000/" },
    });

    expect(
      resolveBrowserConfig({
        provider,
        headless: false,
        instances: [{ browser: "webkit" }],
      }),
    ).toEqual({
      provider,
      headless: false,
      instances: [{ browser: "webkit" }],
    });
  });

  it("is idempotent", () => {
    const once = resolveBrowserConfig({ headless: false });

    expect(resolveBrowserConfig(once)).toEqual(once);
  });

  it("rejects more than one instance instead of ignoring the rest", () => {
    expect(() =>
      resolveBrowserConfig({
        instances: [{ browser: "chromium" }, { browser: "firefox" }] as never,
      }),
    ).toThrow(/exactly one entry \(got 2\)/);
  });

  it("rejects an empty instance list", () => {
    expect(() => resolveBrowserConfig({ instances: [] as never })).toThrow(
      /exactly one entry \(got 0\)/,
    );
  });

  it("rejects an unknown browser", () => {
    expect(() =>
      resolveBrowserConfig({ instances: [{ browser: "edge" as never }] }),
    ).toThrow(/unsupported browser "edge"/);
  });

  it("rejects an unknown provider", () => {
    expect(() =>
      resolveBrowserConfig({
        provider: { name: "webdriverio", options: {} } as never,
      }),
    ).toThrow(/unknown provider "webdriverio"/);
  });
});
