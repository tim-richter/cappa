import {
  type DefaultOptions,
  MutationCache,
  QueryClient,
} from "@tanstack/react-query";
import { toast } from "@ui/lib/utils";
import { queryErrorMessage } from "@/util/queryError";
import { isTerminalQueryError } from "./hooks";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /**
       * Set to `false` on a mutation that reports its own failures, so the
       * global handler below does not say the same thing a second time.
       */
      errorToast?: boolean;
    };
  }
}

/**
 * Tell the user about a failed mutation — once, and without being asked.
 *
 * Every approve surface used to fail silently: the mutation rejected, nothing
 * was listening, and the button looked like it had done nothing. Handling that
 * per call site meant every new mutation started out silent again, so the
 * default lives here and a mutation with a better message of its own opts out
 * with `meta: { errorToast: false }`.
 */
const reportMutationError = (
  error: unknown,
  meta: { errorToast?: boolean } | undefined,
) => {
  if (meta?.errorToast === false) {
    return;
  }

  toast.error(queryErrorMessage(error));
};

/**
 * The query client the review UI runs on.
 *
 * A factory rather than a module-level instance so tests get the same
 * behaviour — the global mutation error handler included — with their own
 * cache and their own retry settings.
 */
export const createQueryClient = (overrides: DefaultOptions = {}) =>
  new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        reportMutationError(error, mutation.meta),
    }),
    defaultOptions: {
      ...overrides,
      queries: {
        /**
         * Retrying a `401` is how a missing access token became ten seconds of
         * "Loading…" followed by a generic failure. The answer is never going
         * to change between attempts, so fail on the first one and let the UI
         * say what is actually wrong.
         */
        retry: (failureCount, error) =>
          !isTerminalQueryError(error) && failureCount < 3,
        ...overrides.queries,
      },
      mutations: { ...overrides.mutations },
    },
  });
