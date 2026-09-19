import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@ui/components/sonner";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "@/api/queryClient";
import { server } from "../test/setup";
import { useApproveBatch } from "./useApproveBatch";

/**
 * The app's client, so the global mutation error handler is in play — that is
 * what turns a rejected approve into something the user can see.
 */
function createWrapper() {
  const queryClient = createQueryClient({
    queries: { retry: false },
    mutations: { retry: false },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
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
    const screen = await render(
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
    const screen = await render(
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
    const screen = await render(
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
    const screen = await render(
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

/**
 * Every approve outcome has to be visible.
 *
 * `fetch` only rejects on a network failure, and a name the engine refuses
 * comes back inside a `200` — so neither "the promise resolved" nor "the
 * request succeeded" means the screenshot was approved. All three outcomes are
 * reported here, once, for every caller.
 */
describe("useApproveBatch feedback", () => {
  const clickApprove = async () => {
    const Wrapper = createWrapper();
    const screen = await render(
      <Wrapper>
        <TestComponent />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Approve"));
    return screen;
  };

  it("reports a failed request instead of swallowing it", async () => {
    server.use(
      http.post("/api/screenshots/approve-batch", () =>
        HttpResponse.json(
          { error: "Screenshot store is gone" },
          { status: 500 },
        ),
      ),
    );

    const screen = await clickApprove();

    await expect
      .element(screen.getByText("Screenshot store is gone"))
      .toBeVisible();
  });

  it("reports names the engine refused, even inside a 200", async () => {
    server.use(
      http.post("/api/screenshots/approve-batch", () =>
        HttpResponse.json({
          approved: ["screenshot-1"],
          errors: [{ name: "screenshot-2", error: "no actual screenshot" }],
        }),
      ),
    );

    const screen = await clickApprove();

    await expect
      .element(
        screen.getByText(
          "Failed to approve screenshot-2: no actual screenshot",
        ),
      )
      .toBeVisible();
  });

  it("counts the failures when there are several", async () => {
    server.use(
      http.post("/api/screenshots/approve-batch", () =>
        HttpResponse.json({
          approved: [],
          errors: [
            { name: "a", error: "gone" },
            { name: "b", error: "gone" },
            { name: "c", error: "gone" },
            { name: "d", error: "gone" },
          ],
        }),
      ),
    );

    const screen = await clickApprove();

    await expect
      .element(
        screen.getByText(
          "Failed to approve 4 of 4 screenshots: a, b, c and 1 more",
        ),
      )
      .toBeVisible();
  });

  it("confirms a single approval by name", async () => {
    server.use(
      http.post("/api/screenshots/approve-batch", () =>
        HttpResponse.json({ approved: ["button/primary"], errors: [] }),
      ),
    );

    const screen = await clickApprove();

    await expect
      .element(screen.getByText("Approved button/primary"))
      .toBeVisible();
  });

  it("confirms a batch approval by count", async () => {
    const screen = await clickApprove();

    await expect
      .element(screen.getByText("Approved 2 screenshots"))
      .toBeVisible();
  });
});
