import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTAINER_IMAGE,
  playwright,
  resolveBrowserConfig,
  resolveContainerOptions,
} from "./playwright";

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

describe("resolveContainerOptions", () => {
  it("is off when unset or false", () => {
    expect(resolveContainerOptions(undefined)).toBeNull();
    expect(resolveContainerOptions(false)).toBeNull();
  });

  it("fills every default for true", () => {
    expect(resolveContainerOptions(true, {})).toEqual({
      cli: "docker",
      image: DEFAULT_CONTAINER_IMAGE,
      runArgs: [],
      keepAlive: true,
      readyTimeout: 300_000,
    });
  });

  it("takes the CLI from CAPPA_CONTAINER_CLI, below the config", () => {
    expect(
      resolveContainerOptions(true, { CAPPA_CONTAINER_CLI: "podman" })?.cli,
    ).toBe("podman");
    expect(
      resolveContainerOptions(
        { cli: "nerdctl" },
        { CAPPA_CONTAINER_CLI: "podman" },
      )?.cli,
    ).toBe("nerdctl");
  });

  it("keeps what was configured", () => {
    expect(
      resolveContainerOptions(
        {
          image: "corp/pw:{version}",
          runArgs: ["--userns=keep-id"],
          keepAlive: false,
          readyTimeout: 1_000,
        },
        {},
      ),
    ).toEqual({
      cli: "docker",
      image: "corp/pw:{version}",
      runArgs: ["--userns=keep-id"],
      keepAlive: false,
      readyTimeout: 1_000,
    });
  });

  it.each([
    ["a string", "docker", /boolean or an object/],
    ["an empty cli", { cli: " " }, /cli must be/],
    ["an empty image", { image: "" }, /image must be/],
    ["non-string runArgs", { runArgs: [1] }, /runArgs must be/],
    ["a non-boolean keepAlive", { keepAlive: "yes" }, /keepAlive must be/],
    ["a zero readyTimeout", { readyTimeout: 0 }, /readyTimeout must be/],
  ])("rejects %s", (_label, value, message) => {
    expect(() => resolveContainerOptions(value as never, {})).toThrow(message);
  });

  it("is validated by resolveBrowserConfig", () => {
    expect(() =>
      resolveBrowserConfig({
        provider: playwright({ container: { runArgs: "--x" as never } }),
      }),
    ).toThrow(/runArgs must be/);
  });
});
