import { initLogger } from "@cappa/logger";
import { type Browser, chromium, type Page } from "playwright-core";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { measureContentClip, resolveCrop } from "./crop";
import ScreenshotTool from "./screenshot";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  initLogger(0);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 800, height: 600 } });
});

afterAll(async () => {
  await browser?.close();
});

const render = (body: string) =>
  page.setContent(
    `<!doctype html><html><body style="margin:0;font:16px sans-serif">${body}</body></html>`,
  );

const clip = (padding = 0, root = "body", fullPage = true) =>
  measureContentClip(page, { root, padding }, fullPage);

describe("resolveCrop", () => {
  it("is off by default", () => {
    expect(resolveCrop(undefined)).toBeUndefined();
    expect(resolveCrop(false)).toBeUndefined();
  });

  it("measures body with default padding for `true`", () => {
    expect(resolveCrop(true)).toEqual({ root: "body", padding: 8 });
  });

  it("keeps given options and clamps negative padding", () => {
    expect(resolveCrop({ root: "#root", padding: -4 })).toEqual({
      root: "#root",
      padding: 0,
    });
  });
});

describe("measureContentClip", () => {
  beforeEach(async () => {
    await page.setViewportSize({ width: 800, height: 600 });
  });

  it("crops to the ink, not to a full-width wrapper", async () => {
    await render(
      `<div style="padding:40px"><button style="all:unset;display:inline-block;width:100px;height:30px;background:#333">x</button></div>`,
    );

    expect(await clip()).toEqual({ x: 40, y: 40, width: 100, height: 30 });
  });

  it("adds padding and rounds outwards", async () => {
    await render(
      `<div style="position:absolute;left:20.4px;top:10.6px;width:50px;height:20px;background:red"></div>`,
    );

    expect(await clip(5)).toEqual({ x: 15, y: 5, width: 61, height: 31 });
  });

  it("clamps padding to the page", async () => {
    await render(`<div style="width:10px;height:10px;background:red"></div>`);

    expect(await clip(8)).toEqual({ x: 0, y: 0, width: 18, height: 18 });
  });

  it("counts a wrapper that paints its own background", async () => {
    await render(
      `<div style="background:#eee;padding:10px"><span>hello</span></div>`,
    );

    const box = await clip();
    expect(box?.width).toBe(800);
  });

  it("measures text by its line boxes", async () => {
    await render(`<p style="margin:50px 0 0 30px">short</p>`);

    const box = await clip();
    expect(box?.x).toBe(30);
    expect(box?.y).toBe(50);
    expect(box?.width).toBeLessThan(100);
  });

  it("includes portals rendered elsewhere in body", async () => {
    await render(`
      <div id="root"><span>anchor</span></div>
      <div style="position:fixed;left:500px;top:400px;width:80px;height:40px;background:#000"></div>
    `);

    const box = await clip();
    expect(box?.x).toBe(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(580);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(440);
  });

  it("measures only inside the given root", async () => {
    await render(`
      <div id="root" style="margin:20px"><span style="display:inline-block;width:40px;height:40px;background:red"></span></div>
      <div style="position:fixed;left:500px;top:400px;width:80px;height:40px;background:#000"></div>
    `);

    expect(await clip(0, "#root")).toEqual({
      x: 20,
      y: 20,
      width: 40,
      height: 40,
    });
  });

  it("ignores what is hidden or fully transparent", async () => {
    await render(`
      <div style="width:20px;height:20px;background:red"></div>
      <div style="display:none;width:700px;height:500px;background:red"></div>
      <div style="visibility:hidden;width:700px;height:500px;background:red"></div>
      <div style="opacity:0;width:700px;height:500px;background:red"></div>
    `);

    expect(await clip()).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });

  it("counts a visible child of a hidden parent", async () => {
    await render(`
      <div style="visibility:hidden;width:700px;height:500px;background:red">
        <div style="visibility:visible;margin-left:100px;width:20px;height:20px;background:blue"></div>
      </div>
    `);

    expect(await clip()).toEqual({ x: 100, y: 0, width: 20, height: 20 });
  });

  it("clips descendants of an element that hides its overflow", async () => {
    await render(`
      <div style="width:50px;height:50px;overflow:hidden">
        <div style="width:500px;height:500px;background:red"></div>
      </div>
    `);

    expect(await clip()).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });

  it("extends the box by a shadow's reach", async () => {
    await render(`
      <div style="margin:100px;width:50px;height:50px;background:#fff;box-shadow:0 4px 6px 2px rgba(0,0,0,.5), inset 0 0 40px red"></div>
    `);

    // offset 4 + blur 6 + spread 2 = 12px on every side
    expect(await clip()).toEqual({ x: 88, y: 88, width: 74, height: 74 });
  });

  it("counts replaced content and borders", async () => {
    await render(`
      <svg width="30" height="30" style="display:block"><rect width="30" height="30"/></svg>
      <div style="margin-left:200px;width:10px;height:10px;border:1px solid #000"></div>
    `);

    const box = await clip();
    expect(box).toEqual({ x: 0, y: 0, width: 212, height: 42 });
  });

  it("is undefined when nothing is painted", async () => {
    await render(`<div style="width:500px;height:500px"></div>`);
    expect(await clip()).toBeUndefined();

    expect(await clip(0, "#missing")).toBeUndefined();
  });

  it("uses document coordinates with fullPage and viewport ones without", async () => {
    await render(`
      <div style="height:1000px"></div>
      <div style="margin-left:10px;width:40px;height:40px;background:red"></div>
      <div style="height:1000px"></div>
    `);
    await page.evaluate(() => window.scrollTo(0, 900));

    expect(await clip(0, "body", true)).toEqual({
      x: 10,
      y: 1000,
      width: 40,
      height: 40,
    });
    expect(await clip(0, "body", false)).toEqual({
      x: 10,
      y: 100,
      width: 40,
      height: 40,
    });
  });

  it("drops a crop that falls outside the viewport without fullPage", async () => {
    await render(`
      <div style="height:2000px"></div>
      <div style="width:40px;height:40px;background:red"></div>
    `);

    expect(await clip(0, "body", false)).toBeUndefined();
  });
});

describe("ScreenshotTool with crop", () => {
  const tool = () => {
    const screenshotTool = new ScreenshotTool({ outputDir: "/tmp" });
    screenshotTool.browser = browser;
    return screenshotTool;
  };

  const sizeOf = async (buffer: Buffer) => {
    const { width, height } = await sharp(buffer).metadata();
    return { width, height };
  };

  const COMPONENT = `<div style="padding:40px"><button style="all:unset;display:inline-block;width:100px;height:30px;background:#333">x</button></div>`;

  it("captures the viewport when crop is off", async () => {
    await render(COMPONENT);

    const buffer = await tool().takeScreenshotBuffer(page, {
      fullPage: false,
      viewport: { width: 800, height: 600 },
    });

    expect(await sizeOf(buffer)).toEqual({ width: 800, height: 600 });
  });

  it("captures only the content when crop is on", async () => {
    await render(COMPONENT);

    const buffer = await tool().takeScreenshotBuffer(page, {
      crop: true,
      viewport: { width: 800, height: 600 },
    });

    expect(await sizeOf(buffer)).toEqual({ width: 100 + 16, height: 30 + 16 });
  });

  it("uses the tool's default crop unless a screenshot overrides it", async () => {
    await render(COMPONENT);
    const screenshotTool = tool();
    screenshotTool.crop = { padding: 0 };

    const cropped = await screenshotTool.takeScreenshotBuffer(page, {});
    expect(await sizeOf(cropped)).toEqual({ width: 100, height: 30 });

    const uncropped = await screenshotTool.takeScreenshotBuffer(page, {
      crop: false,
      fullPage: false,
    });
    expect(await sizeOf(uncropped)).toEqual({ width: 800, height: 600 });
  });

  it("falls back to the full screenshot when nothing is painted", async () => {
    await render(`<div></div>`);

    const buffer = await tool().takeScreenshotBuffer(page, {
      crop: true,
      fullPage: false,
    });

    expect(await sizeOf(buffer)).toEqual({ width: 800, height: 600 });
  });
});
