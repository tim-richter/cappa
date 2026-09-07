import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginTask } from "../plugin";
import type {
  RunnablePlugin,
  RunSummary,
  StartRunRequest,
} from "../runner/types";
import { WatchSession } from "./WatchSession";

/**
 * The one test that uses a real watcher.
 *
 * Every other watch test injects a stand-in, which is the right trade for
 * behaviour — but it means nothing exercises the chokidar wiring itself: the
 * roots it is handed, the `ignored` predicate, whether an editor's save arrives
 * as an event this session acts on. Those are exactly the things that break
 * silently, and the only way to see them is to write a file to a real disk.
 */
let projectDir: string;

const storyFile = () => path.join(projectDir, "src", "Button.stories.tsx");

const task = (id: string, file: string): PluginTask => ({
  id,
  url: `http://x/${id}`,
  data: { file },
});

const plugin = (tasks: PluginTask[]): RunnablePlugin => ({
  name: "storybook",
  description: "storybook plugin",
  discover: async () => tasks,
  execute: async () => ({}),
  watch: {
    paths: ["**/*.stories.tsx"],
    resolve: (changed, all) => {
      const affected = all
        .filter(
          (entry) =>
            path.resolve(projectDir, (entry.data as { file: string }).file) ===
            path.resolve(projectDir, changed),
        )
        .map((entry) => entry.id);
      return affected.length > 0 ? affected : null;
    },
  },
});

const waitFor = async <T>(
  read: () => T | undefined,
  timeoutMs = 8000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for the watcher");
};

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cappa-watch-"));
  fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "screenshots", "actual"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(projectDir, "node_modules"), { recursive: true });
  fs.writeFileSync(storyFile(), "export const Primary = {};\n");
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe("WatchSession against a real watcher", () => {
  const build = () => {
    const requests: StartRunRequest[] = [];

    const session = new WatchSession({
      plugins: [plugin([task("button--primary", "src/Button.stories.tsx")])],
      cwd: projectDir,
      debounceMs: 30,
      ignoredPaths: ["screenshots"],
      discover: async () =>
        new Map([
          [
            "storybook",
            [task("button--primary", "src/Button.stories.tsx")] as PluginTask[],
          ],
        ]),
      startRun: async (request) => {
        requests.push(request);
        return { id: `run-${requests.length}` } as RunSummary;
      },
      waitForRun: async () => {},
    });

    return { session, requests };
  };

  it("re-captures the stories of a file that was saved", async () => {
    const { session, requests } = build();
    await session.start();

    try {
      fs.writeFileSync(storyFile(), "export const Primary = { changed: 1 };\n");

      const request = await waitFor(() => requests[0]);

      expect(request.taskIds).toEqual(["button--primary"]);
      expect(request.clearActual).toBe(false);
      expect(request.trigger?.files).toEqual(["src/Button.stories.tsx"]);
    } finally {
      await session.stop();
    }
  });

  it("does not trigger on its own screenshot output", async () => {
    const { session, requests } = build();
    await session.start();

    try {
      // The failure this rules out is a loop: a capture writes PNGs into the
      // output directory, and if those count as changes every run starts the
      // next one, forever.
      fs.writeFileSync(
        path.join(projectDir, "screenshots", "actual", "button.png"),
        "not really a png",
      );
      fs.writeFileSync(
        path.join(projectDir, "node_modules", "installed.js"),
        "module.exports = {};",
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(requests).toHaveLength(0);
    } finally {
      await session.stop();
    }
  });

  it("stops listening once stopped", async () => {
    const { session, requests } = build();
    await session.start();
    await session.stop();

    fs.writeFileSync(storyFile(), "export const Primary = { later: 1 };\n");
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(requests).toHaveLength(0);
  });
});
