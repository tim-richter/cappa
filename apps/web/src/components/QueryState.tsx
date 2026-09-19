import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib/utils";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type { FC, ReactNode } from "react";
import { queryErrorMessage, queryErrorStatus } from "@/util/queryError";

/**
 * A placeholder shaped roughly like the list it stands in for.
 *
 * The skeleton says "something is coming" to anyone who can see it; the
 * screen-reader-only label says the same thing to anyone who cannot, without
 * putting an unstyled "Loading..." back on the page.
 */
export const LoadingState: FC<{ label?: string; rows?: number }> = ({
  label = "Loading…",
  rows = 4,
}) => (
  <div role="status" aria-busy="true" className="flex flex-col gap-3">
    <span className="sr-only">{label}</span>

    {Array.from({ length: rows }, (_, index) => (
      <Skeleton key={index} className="h-12 w-full" />
    ))}
  </div>
);

export interface ErrorStateProps {
  title?: string;
  /** The rejection itself; its message and status are shown to the user. */
  error?: unknown;
  /** Shown instead of the error's own message, for failures without one. */
  description?: ReactNode;
  onRetry?: () => void;
  className?: string;
}

/**
 * A failed request, said out loud.
 *
 * Every page used to render a bare `Error fetching screenshots` that named
 * neither the status nor the server's reason, and offered nothing but a page
 * reload — so the message and the retry are the whole point of this component.
 */
export const ErrorState: FC<ErrorStateProps> = ({
  title = "Something went wrong",
  error,
  description,
  onRetry,
  className,
}) => {
  const status = queryErrorStatus(error);

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-8 text-center",
        className,
      )}
    >
      <TriangleAlert className="h-6 w-6 text-destructive" aria-hidden="true" />

      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">
          {description ?? queryErrorMessage(error)}
        </p>
        {status !== undefined ? (
          <p className="text-xs text-muted-foreground">HTTP {status}</p>
        ) : null}
      </div>

      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </div>
  );
};

export interface QueryStateProps<TData, TError> {
  query: UseQueryResult<TData, TError>;
  /** Headline for the error state, e.g. "Couldn't load screenshots". */
  errorTitle?: string;
  /** Announced while the query is pending, e.g. "Loading screenshots". */
  loadingLabel?: string;
  /** Replaces the default skeleton, for surfaces it does not fit. */
  loading?: ReactNode;
  /** Wraps the loading and error states, for pages that centre them. */
  className?: string;
  children: (data: TData) => ReactNode;
}

/**
 * The pending → error → data fork every data page repeats.
 *
 * It exists so that improving any one of those three states improves all of
 * them: the six pages used to carry their own copy, which is how five of them
 * ended up with an unstyled `<div>Loading...</div>` and none of them with a
 * retry.
 */
export function QueryState<TData, TError>({
  query,
  errorTitle,
  loadingLabel,
  loading,
  className,
  children,
}: QueryStateProps<TData, TError>) {
  const wrap = (state: ReactNode): ReactNode =>
    className ? <div className={className}>{state}</div> : state;

  if (query.isPending) {
    return wrap(loading ?? <LoadingState label={loadingLabel} />);
  }

  if (query.isError) {
    return wrap(
      <ErrorState
        title={errorTitle}
        error={query.error}
        onRetry={() => {
          query.refetch();
        }}
      />,
    );
  }

  return <>{children(query.data)}</>;
}
