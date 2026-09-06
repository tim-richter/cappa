import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScreenshotFileSystem } from "./filesystem";
import { FsScreenshotStore } from "./store";

let outputDir: string;
let store: FsScreenshotStore;

beforeEach(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "cappa-store-"));
  // Constructing the filesystem creates the actual/expected/diff directories.
  store = new FsScreenshotStore(new ScreenshotFileSystem(outputDir));
});

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true });
});

describe("FsScreenshotStore", () => {
  it("round-trips a screenshot through a bucket", async () => {
    await store.write("actual", "button.png", Buffer.from("png-bytes"));

    await expect(store.has("actual", "button.png")).resolves.toBe(true);
    await expect(store.read("actual", "button.png")).resolves.toEqual(
      Buffer.from("png-bytes"),
    );
  });

  it("reports a missing object", async () => {
    await expect(store.has("actual", "nope.png")).resolves.toBe(false);
    await expect(store.has("expected", "nope.png")).resolves.toBe(false);
    await expect(store.has("diff", "nope.png")).resolves.toBe(false);
  });

  it("writes into every bucket", async () => {
    await store.write("actual", "a.png", Buffer.from("a"));
    await store.write("expected", "b.png", Buffer.from("b"));
    await store.write("diff", "c.png", Buffer.from("c"));

    await expect(store.read("expected", "b.png")).resolves.toEqual(
      Buffer.from("b"),
    );
    await expect(store.read("diff", "c.png")).resolves.toEqual(
      Buffer.from("c"),
    );
  });

  it("creates parent directories for a nested key", async () => {
    await store.write("actual", "nested/deep/card.png", Buffer.from("x"));

    await expect(store.list("actual")).resolves.toEqual([
      path.join("nested", "deep", "card.png"),
    ]);
  });

  it("lists relative keys per bucket", async () => {
    await store.write("actual", "a.png", Buffer.from("a"));
    await store.write("expected", "b.png", Buffer.from("b"));

    await expect(store.list("actual")).resolves.toEqual(["a.png"]);
    await expect(store.list("expected")).resolves.toEqual(["b.png"]);
    await expect(store.list("diff")).resolves.toEqual([]);
  });

  it("removes an object", async () => {
    await store.write("actual", "a.png", Buffer.from("a"));
    await store.remove("actual", "a.png");

    await expect(store.has("actual", "a.png")).resolves.toBe(false);
  });

  it("removing a missing object is a no-op", async () => {
    await expect(store.remove("actual", "ghost.png")).resolves.toBeUndefined();
  });

  it("clears the actual and diff buckets", async () => {
    await store.write("actual", "a.png", Buffer.from("a"));
    await store.write("diff", "a.png", Buffer.from("a"));

    await store.clear("actual");
    await store.clear("diff");

    await expect(store.list("actual")).resolves.toEqual([]);
    await expect(store.list("diff")).resolves.toEqual([]);
  });

  it("refuses to clear the approved baselines", async () => {
    await store.write("expected", "a.png", Buffer.from("a"));

    await expect(store.clear("expected")).rejects.toThrow(/baselines/);
    await expect(store.list("expected")).resolves.toEqual(["a.png"]);
  });

  it("round-trips diff metadata", async () => {
    const meta = { numDiffPixels: 12, percentDifference: 0.5 };
    await store.writeMeta("button.png", meta);

    await expect(store.readMeta("button.png")).resolves.toEqual(meta);
  });

  it("returns undefined for absent diff metadata", async () => {
    await expect(store.readMeta("nothing.png")).resolves.toBeUndefined();
  });

  it("accepts an output directory instead of a filesystem", async () => {
    const direct = new FsScreenshotStore(outputDir);

    await direct.write("actual", "a.png", Buffer.from("a"));

    await expect(direct.list("actual")).resolves.toEqual(["a.png"]);
  });
});
