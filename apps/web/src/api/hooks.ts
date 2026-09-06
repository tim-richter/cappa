import { RunInProgressError, UnknownTargetsError } from "@cappa/client";
import type { ScreenshotCategory, StartRunRequest } from "@cappa/protocol";
import {
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { client } from "./client";
import {
  initialRunState,
  type RunViewState,
  runStateReducer,
} from "./runState";

export const captureKeys = {
  config: ["config"] as const,
  plugins: ["plugins"] as const,
  targets: ["targets"] as const,
  runs: ["runs"] as const,
  run: (id: string) => ["runs", id] as const,
};

/**
 * Query keys for the review surface.
 *
 * These are the keys the raw-`fetch` call sites used, unchanged. Both a
 * finished capture run and a batch approval invalidate by the bare
 * `["screenshots"]` and `["screenshot"]` prefixes, so every key here has to
 * stay under one of those two or it will quietly stop refreshing.
 */
export const screenshotKeys = {
  /** The unfiltered list, keyed on the bare prefix (the sidebar total). */
  all: ["screenshots"] as const,
  /** One page's list: a category, a search term, or neither. */
  list: (filter?: string | null) => ["screenshots", filter ?? null] as const,
  /** The prefix every single-screenshot query sits under. */
  details: ["screenshot"] as const,
  detail: (id: string | undefined) => ["screenshot", id] as const,
};

/** Every screenshot. Used for the sidebar's total. */
export const useScreenshotTotal = () =>
  useQuery({
    queryKey: screenshotKeys.all,
    queryFn: () => client.listScreenshots(),
    select: (screenshots) => screenshots.length,
  });

/** How many screenshots a category holds, or all of them when given none. */
export const useScreenshotCount = (category?: ScreenshotCategory) =>
  useQuery({
    queryKey: screenshotKeys.list(category),
    queryFn: () => client.listScreenshots(category ? { category } : {}),
    select: (screenshots) => screenshots.length,
  });

export const useScreenshotsByCategory = (category: ScreenshotCategory) =>
  useQuery({
    queryKey: screenshotKeys.list(category),
    queryFn: () => client.listScreenshots({ category }),
  });

/** The full list, narrowed by a name search when there is one. */
export const useScreenshotSearch = (search: string | null) =>
  useQuery({
    queryKey: screenshotKeys.list(search),
    queryFn: () => client.listScreenshots(search ? { search } : {}),
  });

/**
 * One screenshot.
 *
 * `client.getScreenshot` resolves to `undefined` for an id the server does not
 * have, so callers must treat a settled `undefined` as not-found rather than
 * as still loading.
 */
export const useScreenshot = (id: string | undefined) =>
  useQuery({
    queryKey: screenshotKeys.detail(id),
    queryFn: () => client.getScreenshot(id as string),
    enabled: id !== undefined,
  });

/** Server config, including whether capture is available at all. */
export const useServerConfig = () =>
  useQuery({
    queryKey: captureKeys.config,
    queryFn: () => client.config(),
    staleTime: Number.POSITIVE_INFINITY,
  });

export const usePlugins = () =>
  useQuery({
    queryKey: captureKeys.plugins,
    queryFn: () => client.listPlugins(),
  });

/**
 * Discovered capture targets.
 *
 * Discovery needs the browser, which a run holds, so the server answers with a
 * `409` while one is active. That is expected rather than broken — retrying
 * would just fail again, so it is left to the caller to refetch afterwards.
 */
export const useTargets = (options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: captureKeys.targets,
    queryFn: () => client.listTargets(),
    enabled: options.enabled ?? true,
    retry: (failureCount, error) =>
      !(error instanceof RunInProgressError) && failureCount < 2,
  });

export const useRuns = () =>
  useQuery({
    queryKey: captureKeys.runs,
    queryFn: () => client.listRuns(),
  });

export const useStartRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: StartRunRequest = {}) => client.startRun(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: captureKeys.runs });
    },
  });
};

export const useCancelRun = () =>
  useMutation({
    mutationFn: (runId: string) => client.cancelRun(runId),
  });

/** Human-readable reason a run could not be started. */
export const describeStartRunError = (error: unknown): string => {
  if (error instanceof RunInProgressError) {
    return "A capture run is already in progress.";
  }
  if (error instanceof UnknownTargetsError) {
    return `Unknown targets: ${error.taskIds.join(", ")}`;
  }
  return error instanceof Error ? error.message : "Failed to start the run";
};

export type UseRunEventsResult = RunViewState & {
  /** True while the event stream is attached. */
  isStreaming: boolean;
  /** Set when the stream itself failed, not when the run did. */
  streamError?: unknown;
};

/**
 * Subscribe to a run's events and fold them into render state.
 *
 * Kept out of the query cache deliberately: this is a stream, not a resource,
 * and react-query's refetch semantics would fight it. On a terminal event the
 * screenshot queries are invalidated so the rest of the UI catches up.
 */
export const useRunEvents = (runId: string | undefined): UseRunEventsResult => {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(runStateReducer, initialRunState);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<unknown>();
  const finishedRef = useRef(false);

  // `useReducer` cannot be reset by key here, so reset explicitly when the run
  // changes — otherwise a second run renders on top of the first one's tasks.
  const previousRunId = useRef<string | undefined>(undefined);
  if (previousRunId.current !== runId) {
    previousRunId.current = runId;
    finishedRef.current = false;
  }

  useEffect(() => {
    if (!runId) {
      return;
    }

    dispatch({ type: "reset" });
    setStreamError(undefined);
    setIsStreaming(true);

    const unsubscribe = client.subscribeRun(
      runId,
      (event) => {
        dispatch(event);

        if (
          !finishedRef.current &&
          (event.type === "run:complete" || event.type === "run:error")
        ) {
          finishedRef.current = true;
          setIsStreaming(false);
          // Screenshots on disk have changed; let the rest of the UI catch up.
          queryClient.invalidateQueries({ queryKey: ["screenshots"] });
          queryClient.invalidateQueries({ queryKey: ["screenshot"] });
          queryClient.invalidateQueries({ queryKey: captureKeys.runs });
          queryClient.invalidateQueries({ queryKey: captureKeys.targets });
        }
      },
      { onError: setStreamError },
    );

    return () => {
      unsubscribe();
      setIsStreaming(false);
    };
  }, [runId, queryClient]);

  return { ...state, isStreaming, streamError };
};

/**
 * Start a capture for a single screenshot — the "re-capture this one" button.
 *
 * Always `clearActual: false`: clearing is right for a full run and disastrous
 * for a run of one, which would wipe every other result.
 */
export const useRecapture = () => {
  const startRun = useStartRun();

  const recapture = useCallback(
    (taskId: string) =>
      startRun.mutateAsync({ taskIds: [taskId], clearActual: false }),
    [startRun],
  );

  return { recapture, ...startRun };
};

export type { UseQueryResult };
