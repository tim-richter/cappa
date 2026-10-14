import type { RunDetail, TaskFailure } from "@cappa/core";
import type { ReportableScreenshot } from "./describeChanges";

/**
 * What `cappa capture --json` prints: one document an agent or a script can
 * act on, instead of a progress log and report boxes to scrape.
 *
 * It separates the two reasons a capture "fails", which the exit code alone
 * cannot: `errors` are tasks that broke (a story threw, a page timed out) and
 * need fixing before anything can be judged; `results` are screenshots that
 * captured fine but differ from their baseline and need reviewing.
 */
export type CaptureJsonReport = {
  /** Nothing failed and nothing differs. Mirrors the exit code. */
  ok: boolean;
  runId?: string;
  durationMs: number;
  tasks: { total: number; completed: number; failed: number };
  screenshots: {
    total: number;
    passed: number;
    changed: number;
    new: number;
    deleted: number;
  };
  /** Tasks that did not produce a comparable screenshot. */
  errors: Array<{ taskId: string; plugin: string; error: string }>;
  /** Every screenshot that is not `passed`. */
  results: Array<{
    name: string;
    category: string;
    taskId?: string;
    plugin?: string;
    percentDifference?: number;
  }>;
  /** The command that picks up from here, when there is something to review. */
  next?: string;
};

const errorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
};

/**
 * A task failure that is a broken capture rather than a visual difference.
 *
 * A changed or new screenshot is reported as a failed task too; those are
 * already in `results` with their category, so only the failures that never
 * produced a comparable image belong here.
 */
const toCaptureError = (
  failure: TaskFailure,
): CaptureJsonReport["errors"][number] | undefined => {
  const { result } = failure;
  if (result.error !== undefined && result.error !== null) {
    return {
      taskId: failure.taskId,
      plugin: failure.pluginName,
      error: errorMessage(result.error),
    };
  }
  if (!result.filepath && result.skipped !== true) {
    return {
      taskId: failure.taskId,
      plugin: failure.pluginName,
      error: "no screenshot was produced",
    };
  }
  return undefined;
};

export const buildCaptureJsonReport = ({
  detail,
  screenshots,
  durationMs,
}: {
  detail: RunDetail | undefined;
  screenshots: readonly ReportableScreenshot[];
  durationMs: number;
}): CaptureJsonReport => {
  const failures = detail?.failures ?? [];
  const deleted = detail?.deletedScreenshots ?? [];
  const count = (category: string) =>
    screenshots.filter((s) => s.category === category).length;

  const results = screenshots
    .filter((s) => s.category !== "passed")
    .map((s) => {
      const origin = s as ReportableScreenshot & {
        taskId?: string;
        plugin?: string;
      };
      return {
        name: s.name,
        category: s.category,
        ...(origin.taskId
          ? { taskId: origin.taskId, plugin: origin.plugin }
          : {}),
        ...(s.diffMeta?.percentDifference !== undefined
          ? { percentDifference: s.diffMeta.percentDifference }
          : {}),
      };
    });

  const errors = failures.flatMap((failure) => {
    const error = toCaptureError(failure);
    return error ? [error] : [];
  });

  return {
    ok: failures.length === 0 && deleted.length === 0,
    ...(detail ? { runId: detail.id } : {}),
    durationMs: Math.round(durationMs),
    tasks: {
      total: detail?.totalTasks ?? 0,
      completed: detail?.completedTasks ?? 0,
      failed: detail?.failedTasks ?? 0,
    },
    screenshots: {
      total: screenshots.length,
      passed: count("passed"),
      changed: count("changed"),
      new: count("new"),
      deleted: count("deleted"),
    },
    errors,
    results,
    ...(results.length > 0 ? { next: "cappa agent check --json" } : {}),
  };
};
