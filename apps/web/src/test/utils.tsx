import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@ui/components/sonner";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement, ReactNode } from "react";
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from "react-router";
import { render } from "vitest-browser-react";
import { createQueryClient } from "@/api/queryClient";

/**
 * The app's own query client, with the retries turned off.
 *
 * Built by `createQueryClient` rather than by hand so tests exercise what the
 * UI actually runs — the global mutation error handler included. A hand-rolled
 * `new QueryClient()` here is how the silent approve failures stayed invisible
 * to the suite as well as to the user.
 */
function createTestQueryClient() {
  return createQueryClient({
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    },
    mutations: { retry: false },
  });
}

interface RenderOptions {
  route?: string;
  /** Initial nuqs URL search params (for pages using useQueryState) */
  searchParams?: Record<string, string>;
  /**
   * Mount the toaster, as `Layout` does in the app.
   *
   * Opt-in: a test that asserts on absences ("no buttons are rendered") should
   * not have to account for a toast host it never asked for.
   */
  withToaster?: boolean;
}

/**
 * Render a component with React Query + nuqs (testing adapter) + MemoryRouter.
 * Use for unit tests of components that use router links but not nuqs URL state.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", withToaster = false }: RenderOptions = {},
) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <NuqsTestingAdapter>{ui}</NuqsTestingAdapter>
      </MemoryRouter>
      {withToaster && <Toaster />}
    </QueryClientProvider>,
  );
}

/**
 * Render a page component using React Router's createMemoryRouter + NuqsTestingAdapter.
 * Use for integration tests of pages that use useNavigate, useParams, useLocation, and useQueryState.
 */
export function renderPage(
  ui: ReactElement,
  { route = "/", searchParams, withToaster = false }: RenderOptions = {},
) {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter(
    [
      {
        path: route,
        element: ui,
      },
    ],
    { initialEntries: [route] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter searchParams={searchParams}>
        <RouterProvider router={router} />
      </NuqsTestingAdapter>
      {withToaster && <Toaster />}
    </QueryClientProvider>,
  );
}

/**
 * Render a page that uses useParams with a specific URL route.
 * E.g. renderPageWithRoute('/screenshots/:id', '/screenshots/3', <Screenshot />)
 */
export function renderPageWithRoute(
  pattern: string,
  path: string,
  ui: ReactElement,
  wrapper?: (children: ReactNode) => ReactElement,
  { withToaster = false }: Pick<RenderOptions, "withToaster"> = {},
) {
  const queryClient = createTestQueryClient();
  const Wrapper = wrapper;
  const router = createMemoryRouter(
    [
      {
        path: pattern,
        element: ui,
      },
    ],
    { initialEntries: [path] },
  );
  const content = Wrapper ? (
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>
  ) : (
    <RouterProvider router={router} />
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter>{content}</NuqsTestingAdapter>
      {withToaster && <Toaster />}
    </QueryClientProvider>,
  );
}

export { MemoryRouter, Route, Routes };
