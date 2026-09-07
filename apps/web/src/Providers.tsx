import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { isTerminalQueryError } from "./api/hooks";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Retrying a `401` is how a missing access token became ten seconds of
       * "Loading…" followed by a generic failure. The answer is never going to
       * change between attempts, so fail on the first one and let the UI say
       * what is actually wrong.
       */
      retry: (failureCount, error) =>
        !isTerminalQueryError(error) && failureCount < 3,
    },
  },
});

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>{children}</NuqsAdapter>
    </QueryClientProvider>
  );
};
