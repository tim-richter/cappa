import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { server } from "../test/setup";
import { useApproveBatch } from "./useApproveBatch";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function TestComponent({
  onSuccess,
  onError,
}: {
  onSuccess?: (data: { approved: string[]; errors: unknown[] }) => void;
  onError?: (err: Error) => void;
}) {
  const { mutate, isPending, data, error } = useApproveBatch();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          mutate(["screenshot-1", "screenshot-2"], { onSuccess, onError })
        }
      >
        Approve
      </button>
      {isPending && <span>Loading</span>}
      {data && <span>approved:{data.approved.join(",")}</span>}
      {error && <span>error:{error.message}</span>}
    </div>
  );
}

describe("useApproveBatch", () => {
  it("calls POST /api/screenshots/approve-batch with correct body", async () => {
    let capturedBody: unknown;

    server.use(
      http.post("/api/screenshots/approve-batch", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ approved: ["screenshot-1"], errors: [] });
      }),
    );

    const Wrapper = createWrapper();
    const screen = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Approve"));

    await expect
      .poll(() => capturedBody)
      .toEqual({
        names: ["screenshot-1", "screenshot-2"],
      });
  });

  it("returns approved screenshots on success", async () => {
    const Wrapper = createWrapper();
    const screen = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Approve"));

    await expect
      .element(screen.getByText("approved:screenshot-1,screenshot-2"))
      .toBeVisible();
  });

  it("shows error state when request fails", async () => {
    server.use(
      http.post("/api/screenshots/approve-batch", () => {
        return HttpResponse.json(
          { error: "server error" },
          { status: 500, statusText: "Internal Server Error" },
        );
      }),
    );

    const Wrapper = createWrapper();
    const screen = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Approve"));

    await expect.element(screen.getByText(/error:/)).toBeVisible();
  });

  it("calls onSuccess callback after successful mutation", async () => {
    const onSuccess = vi.fn();

    const Wrapper = createWrapper();
    const screen = render(
      <Wrapper>
        <TestComponent onSuccess={onSuccess} />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Approve"));

    await expect.poll(() => onSuccess.mock.calls.length).toBeGreaterThan(0);
    const [data] = onSuccess.mock.calls[0] as [
      { approved: string[]; errors: unknown[] },
    ];
    expect(data.approved).toEqual(["screenshot-1", "screenshot-2"]);
    expect(data.errors).toEqual([]);
  });
});
