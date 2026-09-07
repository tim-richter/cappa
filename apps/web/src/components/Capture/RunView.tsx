import { Button } from "@ui/components/button";
import { cn } from "@ui/lib/utils";
import { Ban, Loader2 } from "lucide-react";
import { type FC, useEffect, useRef } from "react";
import type { UseRunEventsResult } from "@/api/hooks";
import {
  countByStatus,
  isRunFinished,
  type RunLogLine,
  runProgress,
} from "@/api/runState";
import { RunProgress } from "./RunProgress";
import { TaskStatusBadge } from "./TaskStatusBadge";

const logColors: Record<RunLogLine["level"], string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-orange-600 dark:text-orange-400",
  error: "text-red-600 dark:text-red-400",
};

const stateLabels: Record<string, string> = {
  idle: "Waiting",
  discovering: "Discovering tasks",
  running: "Capturing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Log pane that follows new output unless the user has scrolled up to read. */
const LogPane: FC<{ logs: RunLogLine[] }> = ({ logs }) => {
  const ref = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const element = ref.current;
    if (element && pinnedToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (element && pinnedToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={ref}
      role="log"
      aria-label="Run log"
      className="h-48 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs"
      onScroll={(event) => {
        const element = event.currentTarget;
        pinnedToBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 24;
      }}
    >
      {logs.length === 0 ? (
        <p className="text-muted-foreground">No output yet.</p>
      ) : (
        logs.map((line) => (
          <div key={line.seq} className={logColors[line.level]}>
            {line.message}
          </div>
        ))
      )}
    </div>
  );
};

export interface RunViewProps {
  run: UseRunEventsResult;
  runId?: string;
  onCancel?: () => void;
  isCancelling?: boolean;
}

export const RunView: FC<RunViewProps> = ({
  run,
  runId,
  onCancel,
  isCancelling,
}) => {
  const finished = isRunFinished(run.state);
  const counts = countByStatus(run.tasks);

  return (
    <section className="flex flex-col gap-4" aria-label="Capture run">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {!finished && run.state !== "idle" ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          <h3 className="text-lg font-semibold">
            {stateLabels[run.state] ?? run.state}
          </h3>
          {run.summary?.durationMs !== undefined ? (
            <span className="text-sm text-muted-foreground">
              in {(run.summary.durationMs / 1000).toFixed(2)}s
            </span>
          ) : null}
        </div>

        {onCancel && !finished && runId ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isCancelling}
          >
            <Ban className="size-4" /> Cancel
          </Button>
        ) : null}
      </div>

      {run.trigger ? (
        <p className="text-sm text-muted-foreground">
          Triggered by watch:{" "}
          <span className="font-mono text-xs">
            {run.trigger.files.length === 1
              ? run.trigger.files[0]
              : `${run.trigger.files.length} files changed`}
          </span>
        </p>
      ) : null}

      <RunProgress
        value={runProgress(run)}
        state={run.state}
        completed={run.completed}
        total={run.total}
      />

      {run.error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {run.error.message}
        </p>
      ) : null}

      {run.streamError && !finished ? (
        <p className="text-sm text-muted-foreground">
          Lost the event stream — reconnecting…
        </p>
      ) : null}

      {Object.keys(counts).length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(counts).map(([status, count]) => (
            <span key={status} className="flex items-center gap-1 text-sm">
              <TaskStatusBadge status={status as never} />
              <span className="text-muted-foreground">{count}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Tasks in this capture run</caption>
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Task</th>
              <th className="px-3 py-2 text-left font-medium">Plugin</th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th className="px-3 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {run.tasks.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No tasks yet.
                </td>
              </tr>
            ) : (
              run.tasks.map((task) => (
                <tr
                  key={task.id}
                  className={cn(
                    "border-t border-border",
                    task.status === "running" && "bg-sky-500/5",
                  )}
                >
                  <td className="px-3 py-2 font-mono text-xs">{task.id}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {task.plugin}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {task.durationMs !== undefined
                      ? `${task.durationMs}ms`
                      : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TaskStatusBadge status={task.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <LogPane logs={run.logs} />
    </section>
  );
};
