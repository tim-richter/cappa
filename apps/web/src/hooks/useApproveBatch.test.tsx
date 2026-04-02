import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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
    const user = userEvent.setup();
    let capturedBody: unknown;

    server.use(
      http.post("/api/screenshots/approve-batch", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ approved: ["screenshot-1"], errors: [] });
      }),
    );

    const Wrapper = createWrapper();
    const { getByText } = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>,
    );

    await user.click(getByText("Approve"));

    await waitFor(() => {
      expect(capturedBody).toEqual({
        names: ["screenshot-1", "screenshot-2"],
      });
    });
  });

  it("returns approved screenshots on success", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const Wrapper = createWrapper();
    const { getByText } = render(
      <Wrapper>
        <TestComponent onSuccess={onSuccess} />
      </Wrapper>,
    );

    await user.click(getByText("Approve"));

    await waitFor(() => {
      expect(
        getByText("approved:screenshot-1,screenshot-2"),
      ).toBeTruthy();
    });
  });

  it("shows error state when request fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/screenshots/approve-batch", () => {
        return HttpResponse.json(
          { error: "server error" },
          { status: 500, statusText: "Internal Server Error" },
        );
      }),
    );

    const Wrapper = createWrapper();
    const { getByText } = render(
      <Wrapper>
        <TestComponent />
      </Wrapper>,
    );

    await user.click(getByText("Approve"));

    await waitFor(() => {
      expect(getByText(/error:/)).toBeTruthy();
    });
  });

  it("calls onSuccess callback after successful mutation", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const Wrapper = createWrapper();
    const { getByText } = render(
      <Wrapper>
        <TestComponent onSuccess={onSuccess} />
      </Wrapper>,
    );

    await user.click(getByText("Approve"));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      const [data] = onSuccess.mock.calls[0] as [
        { approved: string[]; errors: unknown[] },
      ];
      expect(data.approved).toEqual(["screenshot-1", "screenshot-2"]);
      expect(data.errors).toEqual([]);
    });
  });
});
