import { CappaHttpError } from "@cappa/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ErrorState, LoadingState, QueryState } from "./QueryState";

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const Subject = ({ queryFn }: { queryFn: () => Promise<string> }) => {
  const query = useQuery({ queryKey: ["subject"], queryFn });

  return (
    <QueryState
      query={query}
      errorTitle="Couldn't load screenshots"
      loadingLabel="Loading screenshots"
    >
      {(data) => <p>{data}</p>}
    </QueryState>
  );
};

describe("LoadingState", () => {
  it("announces itself without dumping empty boxes on a screen reader", async () => {
    const screen = await render(<LoadingState label="Loading screenshots" />);
    await expect.element(screen.getByRole("status")).toBeVisible();
    await expect.element(screen.getByText("Loading screenshots")).toBeVisible();
  });
});

describe("ErrorState", () => {
  it("shows the error's own message and status", async () => {
    const screen = await render(
      <ErrorState
        title="Couldn't load screenshots"
        error={new CappaHttpError("Screenshot store is gone", 500)}
      />,
    );

    await expect
      .element(screen.getByText("Couldn't load screenshots"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Screenshot store is gone"))
      .toBeVisible();
    await expect.element(screen.getByText("HTTP 500")).toBeVisible();
  });

  it("is an alert so it is announced when it replaces the page", async () => {
    const screen = await render(<ErrorState error={new Error("boom")} />);
    await expect.element(screen.getByRole("alert")).toBeVisible();
  });

  it("omits the status for a failure that never reached the server", async () => {
    const screen = await render(<ErrorState error={new Error("boom")} />);
    const statuses = await screen.getByText(/^HTTP /).elements();
    expect(statuses.length).toBe(0);
  });

  it("offers no retry when there is nothing to retry with", async () => {
    const screen = await render(<ErrorState error={new Error("boom")} />);
    const buttons = await screen.getByRole("button").elements();
    expect(buttons.length).toBe(0);
  });

  it("calls onRetry when the retry action is used", async () => {
    const onRetry = vi.fn();
    const screen = await render(
      <ErrorState error={new Error("boom")} onRetry={onRetry} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("QueryState", () => {
  it("shows the loading state while the query is pending", async () => {
    const screen = await renderWithQueryClient(
      <Subject queryFn={() => new Promise<string>(() => {})} />,
    );

    await expect.element(screen.getByRole("status")).toBeVisible();
    await expect.element(screen.getByText("Loading screenshots")).toBeVisible();
  });

  it("renders the data once the query settles", async () => {
    const screen = await renderWithQueryClient(
      <Subject queryFn={async () => "loaded"} />,
    );

    await expect.element(screen.getByText("loaded")).toBeVisible();
  });

  it("shows a styled error with the server's reason when the query fails", async () => {
    const screen = await renderWithQueryClient(
      <Subject
        queryFn={async () => {
          throw new CappaHttpError("Screenshot store is gone", 500);
        }}
      />,
    );

    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect
      .element(screen.getByText("Couldn't load screenshots"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Screenshot store is gone"))
      .toBeVisible();
    await expect.element(screen.getByText("HTTP 500")).toBeVisible();
  });

  it("recovers without a page reload when retry succeeds", async () => {
    let attempt = 0;
    const screen = await renderWithQueryClient(
      <Subject
        queryFn={async () => {
          attempt += 1;
          if (attempt === 1) throw new CappaHttpError("temporary", 500);
          return "loaded";
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await expect.element(screen.getByText("loaded")).toBeVisible();
  });
});
