import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ScreenshotFileSystem } from "../filesystem";
import type ScreenshotTool from "../screenshot";
import {
  MANIFEST_FILENAME,
  readCaptureManifest,
} from "../screenshots/manifest";
import { CaptureRunner } from "./CaptureRunner";
import type { RunnablePlugin } from "./types";

/**
 * The capture manifest, end to end through the runner.
 *
 * Deliberately a separate file from `CaptureRunner.test.ts`, which mocks
 * `node:fs/promises` wholesale — the manifest is only interesting if it
 * actually reaches disk.
 */

const dirs: string[] = [];

const tempDir = async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-runner-"));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true })),
  );
});

type FakeTool = ScreenshotTool & {
  /** Stands in for the tool writing a file during `execute`. */
  emitCapture: (page: unknown, filename: string) => void;
};

const createTool = (outputDir: string, concurrency = 1): FakeTool => {
  let sink: ((page: unknown, filename: string) => void) | null = null;
  const pages = new Map<number, object>();

  return {
    outputDir,
    concurrency,
    getPageFromPool: (index: number) => {
      if (!pages.has(index)) {
        pages.set(index, { worker: index });
      }
      return pages.get(index);
    },
    setLogSink: () => {},
    setCaptureSink: (next: typeof sink) => {
      sink = next;
    },
    emitCapture: (page: unknown, filename: string) => sink?.(page, filename),
  } as unknown as FakeTool;
};

/** Writes a real file, so the manifest's pruning has something to see. */
const writeActual = async (outputDir: string, filename: string) => {
  const target = path.join(outputDir, "actual", filename);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, "");
};

describe("CaptureRunner capture manifest", () => {
  it("records the task that produced each screenshot", async () => {
    const outputDir = await tempDir();
    const tool = createTool(outputDir);

    // Storybook's shape exactly: the filename and the task id have nothing in
    // common, which is why the manifest has to exist at all.
    const plugin: RunnablePlugin = {
      name: "StorybookPlugin",
      discover: async () => [
        {
          id: "example-button--primary",
          url: "http://localhost:6006/?id=example-button--primary",
        },
      ],
      execute: async (_task, page) => {
        await writeActual(outputDir, "example/button/primary.png");
        tool.emitCapture(page, "example/button/primary.png");
        return { success: true };
      },
    };

    const runner = new CaptureRunner({
      screenshotTool: tool,
      plugins: [plugin],
      outputDir,
      fileSystem: new ScreenshotFileSystem(outputDir),
    });

    await runner.run({ clearActual: false });

    expect((await readCaptureManifest(outputDir)).screenshots).toEqual({
      "example/button/primary": {
        taskId: "example-button--primary",
        plugin: "StorybookPlugin",
      },
    });
  });

  it("attributes variants to the task that captured them", async () => {
    const outputDir = await tempDir();
    const tool = createTool(outputDir);

    const plugin: RunnablePlugin = {
      name: "pages",
      discover: async () => [{ id: "home", url: "http://localhost:3000/" }],
      execute: async (_task, page) => {
        for (const filename of ["home.png", "home--dark.png"]) {
          await writeActual(outputDir, filename);
          tool.emitCapture(page, filename);
        }
        return { success: true };
      },
    };

    const runner = new CaptureRunner({
      screenshotTool: tool,
      plugins: [plugin],
      outputDir,
      fileSystem: new ScreenshotFileSystem(outputDir),
    });

    await runner.run({ clearActual: false });

    const { screenshots } = await readCaptureManifest(outputDir);
    // A variant's filename is invented by the tool, never stated by the plugin
    // — observing the write is the only way to attribute it.
    expect(screenshots["home--dark"]).toEqual({
      taskId: "home",
      plugin: "pages",
    });
  });

  it("keeps concurrent tasks apart", async () => {
    const outputDir = await tempDir();
    const tool = createTool(outputDir, 2);

    let started = 0;
    const bothStarted = Promise.withResolvers<void>();

    const plugin: RunnablePlugin = {
      name: "pages",
      discover: async () => [
        { id: "task-a", url: "http://localhost/a" },
        { id: "task-b", url: "http://localhost/b" },
      ],
      execute: async (task, page) => {
        // Overlap the two tasks, so a single "current task" on the tool would
        // attribute both screenshots to whichever finished last.
        started += 1;
        if (started === 2) {
          bothStarted.resolve();
        }
        await bothStarted.promise;

        const filename = `${task.id}-shot.png`;
        await writeActual(outputDir, filename);
        tool.emitCapture(page, filename);
        return { success: true };
      },
    };

    const runner = new CaptureRunner({
      screenshotTool: tool,
      plugins: [plugin],
      outputDir,
      fileSystem: new ScreenshotFileSystem(outputDir),
    });

    await runner.run({ clearActual: false });

    const { screenshots } = await readCaptureManifest(outputDir);
    expect(screenshots["task-a-shot"]?.taskId).toBe("task-a");
    expect(screenshots["task-b-shot"]?.taskId).toBe("task-b");
  });

  it("preserves origins a partial run did not re-capture", async () => {
    const outputDir = await tempDir();

    const runOne = async (taskId: string, filename: string): Promise<void> => {
      const tool = createTool(outputDir);
      const plugin: RunnablePlugin = {
        name: "pages",
        discover: async () => [
          { id: taskId, url: `http://localhost/${taskId}` },
        ],
        execute: async (_task, page) => {
          await writeActual(outputDir, filename);
          tool.emitCapture(page, filename);
          return { success: true };
        },
      };

      await new CaptureRunner({
        screenshotTool: tool,
        plugins: [plugin],
        outputDir,
        fileSystem: new ScreenshotFileSystem(outputDir),
      }).run({ clearActual: false });
    };

    await runOne("task-a", "a.png");
    await runOne("task-b", "b.png");

    // The second run only knew about `b`. Losing `a` here would disable the
    // re-capture button for every screenshot the last run did not touch.
    const { screenshots } = await readCaptureManifest(outputDir);
    expect(screenshots.a?.taskId).toBe("task-a");
    expect(screenshots.b?.taskId).toBe("task-b");
  });

  it("does not fail a run when the manifest cannot be written", async () => {
    const outputDir = await tempDir();
    const tool = createTool(outputDir);

    // A directory where the manifest file belongs: `writeFile` fails with
    // EISDIR, which is the closest honest stand-in for a read-only or full
    // disk. A capture that succeeded must still be reported as succeeded.
    await fsp.mkdir(path.join(outputDir, MANIFEST_FILENAME), {
      recursive: true,
    });

    const plugin: RunnablePlugin = {
      name: "pages",
      discover: async () => [{ id: "home", url: "http://localhost/" }],
      execute: async (_task, page) => {
        await writeActual(outputDir, "home.png");
        tool.emitCapture(page, "home.png");
        return { success: true };
      },
    };

    const detail = await new CaptureRunner({
      screenshotTool: tool,
      plugins: [plugin],
      outputDir,
      fileSystem: new ScreenshotFileSystem(outputDir),
    }).run({ clearActual: false });

    expect(detail.state).toBe("completed");
    expect((await readCaptureManifest(outputDir)).screenshots).toEqual({});
  });
});
