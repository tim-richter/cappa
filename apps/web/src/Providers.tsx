import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7'

const queryClient = new QueryClient();

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        {children}
      </NuqsAdapter>
    </QueryClientProvider>
  );
};
