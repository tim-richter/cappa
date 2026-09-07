import { Button } from "@ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/tooltip";
import { toast } from "@ui/lib/utils";
import { Camera, Loader2 } from "lucide-react";
import { type FC, useEffect, useState } from "react";
import {
  describeStartRunError,
  useActiveRun,
  useRecapture,
  useRunEvents,
  useServerConfig,
} from "@/api/hooks";
import { isRunFinished } from "@/api/runState";

export interface RecaptureButtonProps {
  /**
   * The task id to re-capture, as `discover` produced it.
   *
   * Explicitly *not* the screenshot name: the two are unrelated for most
   * plugins (Storybook writes `example/button/primary` for the task
   * `example-button--primary`), and passing a name here is how this button
   * used to fail with `CAPPA_UNKNOWN_TARGETS` on every Storybook screenshot.
   * `undefined` for a screenshot the engine has no recorded task for.
   */
  taskId: string | undefined;
  label?: string;
  size?: "sm" | "md";
}

/**
 * Re-capture a single screenshot: a run of one.
 *
 * Hidden on a read-only server, where capture routes are refused anyway —
 * better to not offer the button than to offer one that 403s. Hidden for the
 * same reason when the screenshot has no known task: a screenshot captured
 * before this version, or by a plugin that did not go through a run, cannot be
 * addressed and the request would be rejected.
 */
export const RecaptureButton: FC<RecaptureButtonProps> = ({
  taskId,
  label = "Re-capture",
  size = "sm",
}) => {
  const { data: config } = useServerConfig();
  const { recapture, isPending } = useRecapture();
  const [runId, setRunId] = useState<string>();
  const run = useRunEvents(runId);

  // Any run holds the engine, not just one this button started, so a run
  // begun elsewhere has to disable it too — otherwise the only feedback is a
  // 409 toast.
  const activeRun = useActiveRun();

  const finished = runId !== undefined && isRunFinished(run.state);
  const busy =
    isPending || (runId !== undefined && !finished) || activeRun !== undefined;

  useEffect(() => {
    if (!runId || !finished) {
      return;
    }

    if (run.state === "completed") {
      toast.success(`Re-captured ${taskId}`);
    } else if (run.state === "failed") {
      toast.error(run.error?.message ?? `Failed to re-capture ${taskId}`);
    }

    setRunId(undefined);
  }, [runId, finished, run.state, run.error, taskId]);

  if (config?.readOnly || taskId === undefined) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={size === "sm" ? "sm" : undefined}
          aria-label={`${label} ${taskId}`}
          disabled={busy}
          onClick={async () => {
            try {
              const summary = await recapture(taskId);
              setRunId(summary.id);
            } catch (error) {
              toast.error(describeStartRunError(error));
            }
          }}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
          {label}
        </Button>
      </TooltipTrigger>

      <TooltipContent>Capture this screenshot again</TooltipContent>
    </Tooltip>
  );
};
