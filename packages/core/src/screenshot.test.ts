import { beforeAll, describe, expect, it } from "vitest";
import { initLogger } from "@cappa/logger";
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
