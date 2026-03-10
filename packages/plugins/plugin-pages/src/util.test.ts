import { describe, expect, it } from "vitest";
import {
  defaultWaitStrategy,
  deriveFilenameFromUrl,
  resolveWaitStrategy,
  sanitizeName,
} from "./util";

describe("deriveFilenameFromUrl", () => {
  it("derives filename from root URL", () => {
    expect(deriveFilenameFromUrl("https://example.com")).toBe(
      "example-com.png",
    );
  });

  it("derives filename from URL with path", () => {
    expect(deriveFilenameFromUrl("https://example.com/pricing")).toBe(
      "example-com/pricing.png",
    );
  });

  it("derives filename from URL with nested path", () => {
    expect(
      deriveFilenameFromUrl("https://example.com/docs/getting-started"),
    ).toBe("example-com/docs/getting-started.png");
  });

  it("handles trailing slashes", () => {
    expect(deriveFilenameFromUrl("https://example.com/about/")).toBe(
      "example-com/about.png",
    );
  });

  it("sanitizes special characters in path segments", () => {
    expect(deriveFilenameFromUrl("https://example.com/my%20page/test!")).toBe(
      "example-com/my-20page/test-.png",
    );
  });

  it("handles subdomains", () => {
    expect(deriveFilenameFromUrl("https://docs.example.com/api")).toBe(
      "docs-example-com/api.png",
    );
  });
});

describe("sanitizeName", () => {
  it("adds .png extension", () => {
    expect(sanitizeName("homepage")).toBe("homepage.png");
  });

  it("does not double .png extension", () => {
    expect(sanitizeName("homepage.png")).toBe("homepage.png");
  });

  it("preserves path separators", () => {
    expect(sanitizeName("pages/homepage")).toBe("pages/homepage.png");
  });

  it("sanitizes special characters", () => {
    expect(sanitizeName("my page!")).toBe("my-page.png");
  });

  it("collapses multiple dashes", () => {
    expect(sanitizeName("my---page")).toBe("my-page.png");
  });
});

describe("resolveWaitStrategy", () => {
  it("returns defaults when no overrides provided", () => {
    const result = resolveWaitStrategy();
    expect(result).toEqual(defaultWaitStrategy);
  });

  it("merges plugin defaults", () => {
    const result = resolveWaitStrategy({ waitForTimeout: 500 });
    expect(result).toEqual({
      ...defaultWaitStrategy,
      waitForTimeout: 500,
    });
  });

  it("page overrides take precedence over plugin defaults", () => {
    const result = resolveWaitStrategy(
      { waitForTimeout: 500, waitForNetworkIdle: false },
      { waitForTimeout: 1000 },
    );
    expect(result).toEqual({
      ...defaultWaitStrategy,
      waitForNetworkIdle: false,
      waitForTimeout: 1000,
    });
  });

  it("page overrides take precedence over global defaults", () => {
    const result = resolveWaitStrategy(undefined, {
      waitForStable: false,
      waitForSelector: "#main",
    });
    expect(result).toEqual({
      ...defaultWaitStrategy,
      waitForStable: false,
      waitForSelector: "#main",
    });
  });
});
