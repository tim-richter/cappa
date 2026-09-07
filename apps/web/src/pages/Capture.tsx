import type { StartRunRequest } from "@cappa/protocol";
import { toast } from "@ui/lib/utils";
import { type FC, useEffect, useState } from "react";
import {
  describeStartRunError,
  useActiveRun,
  useCancelRun,
  usePlugins,
  useRunEvents,
  useServerConfig,
  useStartRun,
  useTargets,
} from "@/api/hooks";
import { isRunFinished } from "@/api/runState";
import { CapturePanel } from "@/components/Capture/CapturePanel";
import { RunView } from "@/components/Capture/RunView";
import { Main } from "@/layout/Main";

export const Capture: FC = () => {
  const [runId, setRunId] = useState<string>();

  const { data: config } = useServerConfig();
  const { data: plugins = [] } = usePlugins();
  const {
    data: targets = [],
    isPending: isDiscovering,
    refetch: refetchTargets,
  } = useTargets();

  const startRun = useStartRun();
  const cancelRun = useCancelRun();

  // The engine runs one capture at a time and the run id lives on the server,
  // so "is a run in flight" is a question to ask it rather than something to
  // remember. Without this a reload — or a `cappa capture` in another terminal
  // — leaves the page showing an idle panel whose only possible outcome is a
  // 409.
  const activeRun = useActiveRun();
  const activeRunId = activeRun?.id;

  useEffect(() => {
    if (activeRunId !== undefined && activeRunId !== runId) {
      setRunId(activeRunId);
    }
  }, [activeRunId, runId]);

  const run = useRunEvents(runId);

  // Kept once adopted, so the finished run's tasks and log stay on screen after
  // it drops out of the active list.
  const isRunActive =
    activeRun !== undefined ||
    (runId !== undefined && !isRunFinished(run.state));

  if (config?.readOnly) {
    return (
      <Main>
        <div className="mx-auto max-w-2xl py-12 text-center">
          <h2 className="text-xl font-semibold">Capture is disabled</h2>
          <p className="mt-2 text-muted-foreground">
            This server is running read-only, so it will not drive a browser or
            change any screenshots. Restart <code>cappa review</code> without{" "}
            <code>--read-only</code> to capture from here.
          </p>
        </div>
      </Main>
    );
  }

  const handleStart = (request: StartRunRequest) => {
    startRun.mutate(request, {
      onSuccess: (summary) => {
        setRunId(summary.id);
        toast.success("Capture started");
      },
      onError: (error) => toast.error(describeStartRunError(error)),
    });
  };

  return (
    <Main>
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        {startRun.isError ? (
          <p
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
          >
            {describeStartRunError(startRun.error)}
          </p>
        ) : null}

        <CapturePanel
          targets={targets}
          plugins={plugins}
          isDiscovering={isDiscovering}
          isStarting={startRun.isPending}
          isRunActive={isRunActive}
          onStart={handleStart}
          onRefreshTargets={() => {
            void refetchTargets();
          }}
        />

        {runId ? (
          <RunView
            run={run}
            runId={runId}
            isCancelling={cancelRun.isPending}
            onCancel={() =>
              cancelRun.mutate(runId, {
                onSuccess: () => toast.success("Cancelling…"),
                onError: (error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to cancel the run",
                  ),
              })
            }
          />
        ) : null}
      </div>
    </Main>
  );
};
