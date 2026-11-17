import { initLogger } from "@cappa/logger";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "playwright-core";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ScreenshotTool from "./screenshot";

let browser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  initLogger(0);
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 400, height: 300 },
    deviceScaleFactor: 2,
  });
  page = await context.newPage();
  await page.setContent(
    `<!doctype html><html><body style="margin:0"><div style="margin:40px;width:100px;height:30px;background:#333"></div></body></html>`,
  );
});

afterAll(async () => {
  await browser?.close();
});

const tool = (
  options: ConstructorParameters<typeof ScreenshotTool>[0] = {},
) => {
  const screenshotTool = new ScreenshotTool({ outputDir: "/tmp", ...options });
  screenshotTool.browser = browser;
  return screenshotTool;
};

const sizeOf = async (buffer: Buffer) => {
  const { width, height } = await sharp(buffer).metadata();
  return { width, height };
};

describe("screenshot scale", () => {
  it("defaults to css pixels, ignoring deviceScaleFactor", async () => {
    const screenshotTool = tool();
    expect(screenshotTool.scale).toBe("css");

    const buffer = await screenshotTool.takeScreenshotBuffer(page, {
      fullPage: false,
    });

    expect(await sizeOf(buffer)).toEqual({ width: 400, height: 300 });
  });

  it("captures device pixels with scale: device", async () => {
    const buffer = await tool().takeScreenshotBuffer(page, {
      fullPage: false,
      scale: "device",
    });

    expect(await sizeOf(buffer)).toEqual({ width: 800, height: 600 });
  });

  it("uses the tool's default unless a screenshot overrides it", async () => {
    const screenshotTool = tool({ scale: "device" });

    const device = await screenshotTool.takeScreenshotBuffer(page, {
      fullPage: false,
    });
    expect(await sizeOf(device)).toEqual({ width: 800, height: 600 });

    const css = await screenshotTool.takeScreenshotBuffer(page, {
      fullPage: false,
      scale: "css",
    });
    expect(await sizeOf(css)).toEqual({ width: 400, height: 300 });
  });

  it("scales a content crop by the device scale factor", async () => {
    const buffer = await tool().takeScreenshotBuffer(page, {
      crop: { padding: 0 },
      scale: "device",
    });

    expect(await sizeOf(buffer)).toEqual({ width: 200, height: 60 });
  });

  it("passes scale through takeScreenshotWithComparison", async () => {
    const screenshotTool = tool();
    const retry = vi
      .spyOn(screenshotTool, "retryScreenshot")
      .mockResolvedValue({ passed: true } as any);

    await screenshotTool
      .takeScreenshotWithComparison(page, "x.png", Buffer.from("ref"), {
        scale: "device",
      })
      .catch(() => {});

    expect(retry.mock.calls[0]?.[2]).toMatchObject({ scale: "device" });
  });
});
