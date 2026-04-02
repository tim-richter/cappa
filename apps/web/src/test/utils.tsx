import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement, ReactNode } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  createMemoryRouter,
  RouterProvider,
} from "react-router";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: true,
      },
      mutations: { retry: false },
    },
  });
}

interface RenderOptions {
  route?: string;
  /** Initial nuqs URL search params (for pages using useQueryState) */
  searchParams?: Record<string, string>;
}

/**
 * Render a component with React Query + nuqs (testing adapter) + MemoryRouter.
 * Use for unit tests of components that use router links but not nuqs URL state.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/" }: RenderOptions = {},
) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <NuqsTestingAdapter>{ui}</NuqsTestingAdapter>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Render a page component using React Router's createMemoryRouter + NuqsTestingAdapter.
 * Use for integration tests of pages that use useNavigate, useParams, useLocation, and useQueryState.
 */
export function renderPage(
  ui: ReactElement,
  { route = "/", searchParams }: RenderOptions = {},
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
    </QueryClientProvider>,
  );
}

export { MemoryRouter, Route, Routes };
