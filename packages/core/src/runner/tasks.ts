import { glob } from "node:fs/promises";
import path from "node:path";
import type { PluginTask } from "../plugin";
import type { PluginCaptureResult, TaskStatus } from "./types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Decide whether a plugin's `execute` result represents a failed screenshot.
 *
 * Plugins return loosely-shaped objects, so this inspects the three signals that
 * matter: an explicit `error`, an explicit `success: false`, or a missing
 * `filepath` on a task that was not skipped.
 */
export const didScreenshotFail = (result: unknown): boolean => {
  if (!isObject(result)) {
    return false;
  }

  if ("error" in result && result.error != null) {
    return true;
  }

  if ("success" in result) {
    const { success } = result as PluginCaptureResult;
    if (success === false) {
      return true;
    }
  }

  if ("filepath" in result) {
    const { filepath, skipped } = result as PluginCaptureResult;
    if (!filepath && skipped !== true) {
      return true;
    }
  }

  return false;
};

/**
 * Map a plugin result onto the status shown in the UI.
 *
 * Mirrors the screenshot categories: a capture with no baseline is `new`, a
 * failing comparison is `changed`, and anything `didScreenshotFail` flags for
 * another reason is `failed`.
 */
export const toTaskStatus = (result: unknown): TaskStatus => {
  if (!isObject(result)) {
    return "passed";
  }

  const typed = result as PluginCaptureResult;

  if (typed.skipped === true) {
    return "skipped";
  }

  if ("error" in typed && typed.error != null) {
    return "failed";
  }

  if (typed.isNew === true) {
    return "new";
  }

  if (typed.success === false) {
    return "changed";
  }

  if (didScreenshotFail(typed)) {
    return "failed";
  }

  return "passed";
};

/** Restrict `tasks` to those whose id matches the glob `filter`. */
export function filterTasks(tasks: PluginTask[], filter: string): PluginTask[] {
  return tasks.filter((task) => path.matchesGlob(task.id, filter));
}

/** Restrict `tasks` to an explicit set of ids. */
export function selectTasks(
  tasks: PluginTask[],
  taskIds: readonly string[],
): PluginTask[] {
  const wanted = new Set(taskIds);
  return tasks.filter((task) => wanted.has(task.id));
}

/**
 * Baselines in `expected/` that have no counterpart in `actual/` — screenshots
 * that existed when the baseline was approved but were not captured this run.
 */
export async function getDeletedScreenshots(
  outputDir: string,
): Promise<string[]> {
  const actualDir = path.resolve(outputDir, "actual");
  const expectedDir = path.resolve(outputDir, "expected");

  const [actualFiles, expectedFiles] = await Promise.all([
    Array.fromAsync(glob(path.join(actualDir, "**/*.png"))),
    Array.fromAsync(glob(path.join(expectedDir, "**/*.png"))),
  ]);

  const actualRelative = new Set(
    actualFiles.map((p) => path.relative(actualDir, p)),
  );

  return expectedFiles
    .map((p) => path.relative(expectedDir, p))
    .filter((rel) => !actualRelative.has(rel));
}
