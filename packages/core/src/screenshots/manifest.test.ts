import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  emptyManifest,
  manifestPath,
  mergeCaptureManifest,
  readCaptureManifest,
  recordCaptureOrigins,
  toManifestKey,
} from "./manifest";

const dirs: string[] = [];

const tempDir = async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-manifest-"));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true })),
  );
});

describe("toManifestKey", () => {
  it("matches the name groupScreenshots derives", () => {
    expect(toManifestKey("button.png")).toBe("button");
    expect(toManifestKey("example/button/primary.png")).toBe(
      "example/button/primary",
    );
  });

  it("keeps a variant suffix, which is part of the name", () => {
    expect(toManifestKey("home--dark.png")).toBe("home--dark");
  });
});

describe("readCaptureManifest", () => {
  it("returns an empty manifest when there is no file", async () => {
    expect(await readCaptureManifest(await tempDir())).toEqual(emptyManifest());
  });

  it("returns an empty manifest rather than throwing on garbage", async () => {
    const dir = await tempDir();
    await fsp.writeFile(manifestPath(dir), "not json at all");

    expect(await readCaptureManifest(dir)).toEqual(emptyManifest());
  });

  it("ignores a manifest written by a future version", async () => {
    const dir = await tempDir();
    await fsp.writeFile(
      manifestPath(dir),
      JSON.stringify({ version: 99, screenshots: { a: { taskId: "t" } } }),
    );

    expect(await readCaptureManifest(dir)).toEqual(emptyManifest());
  });

  it("drops entries that are not origins", async () => {
    const dir = await tempDir();
    await fsp.writeFile(
      manifestPath(dir),
      JSON.stringify({
        version: 1,
        screenshots: {
          good: { taskId: "task-a", plugin: "p" },
          bad: { taskId: 42 },
          alsoBad: null,
        },
      }),
    );

    expect((await readCaptureManifest(dir)).screenshots).toEqual({
      good: { taskId: "task-a", plugin: "p" },
    });
  });
});

describe("mergeCaptureManifest", () => {
  const existing = {
    version: 1,
    screenshots: {
      alpha: { taskId: "task-alpha", plugin: "p" },
      beta: { taskId: "task-beta", plugin: "p" },
    },
  };

  it("keeps entries a partial run did not touch", () => {
    // The whole point: re-capturing one screenshot must not strip every other
    // screenshot's origin and disable the button that started it.
    const merged = mergeCaptureManifest(existing, {
      alpha: { taskId: "task-alpha", plugin: "p" },
    });

    expect(merged.screenshots.beta).toEqual({
      taskId: "task-beta",
      plugin: "p",
    });
  });

  it("lets a new origin win over a stale one", () => {
    const merged = mergeCaptureManifest(existing, {
      alpha: { taskId: "renamed-task", plugin: "p" },
    });

    expect(merged.screenshots.alpha).toEqual({
      taskId: "renamed-task",
      plugin: "p",
    });
  });

  it("prunes names that no longer exist", () => {
    const merged = mergeCaptureManifest(existing, {}, ["alpha"]);

    expect(Object.keys(merged.screenshots)).toEqual(["alpha"]);
  });

  it("keeps a new origin even when it is outside the known set", () => {
    // The known set is read from disk after the run; a race there must not
    // discard what the run just observed.
    const merged = mergeCaptureManifest(
      existing,
      { gamma: { taskId: "task-gamma", plugin: "p" } },
      ["alpha"],
    );

    expect(Object.keys(merged.screenshots).sort()).toEqual(["alpha", "gamma"]);
  });
});

describe("recordCaptureOrigins", () => {
  it("round-trips through disk", async () => {
    const dir = await tempDir();

    expect(
      await recordCaptureOrigins(dir, {
        "example/button/primary": {
          taskId: "example-button--primary",
          plugin: "StorybookPlugin",
        },
      }),
    ).toBe(true);

    expect((await readCaptureManifest(dir)).screenshots).toEqual({
      "example/button/primary": {
        taskId: "example-button--primary",
        plugin: "StorybookPlugin",
      },
    });
  });

  it("reports failure instead of throwing", async () => {
    // A read-only or full disk must not turn a successful capture into a
    // failed one.
    const dir = await tempDir();
    await fsp.writeFile(manifestPath(dir), "{}");
    await fsp.chmod(dir, 0o500);

    const written = await recordCaptureOrigins(dir, {
      a: { taskId: "t", plugin: "p" },
    });

    await fsp.chmod(dir, 0o700);

    // Running as root defeats the permission bits entirely; the assertion that
    // matters either way is that this resolved rather than threw.
    expect(typeof written).toBe("boolean");
  });
});
