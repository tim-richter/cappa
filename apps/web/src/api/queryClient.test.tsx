import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import { Toaster } from "@ui/components/sonner";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "./queryClient";

/**
 * A mutation that fails and is never asked about.
 *
 * This is the shape every approve surface used to have: `fetch` rejects (or
 * resolves with a 500 the client turns into a rejection), nothing is
 * listening, and the user is shown nothing at all. The global handler exists
 * so that "nobody handled it" reports the failure rather than swallowing it.
 */
function FailingMutation({
  message,
  errorToast,
}: {
  message: string;
  errorToast?: boolean;
}) {
  const { mutate } = useMutation({
    mutationFn: async () => {
      throw new Error(message);
    },
    meta: errorToast === undefined ? undefined : { errorToast },
  });

  return (
    <button type="button" onClick={() => mutate()}>
      Go
    </button>
  );
}

const renderWithClient = (ui: ReactNode) => {
  const queryClient = createQueryClient({ mutations: { retry: false } });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
};

describe("createQueryClient", () => {
  it("reports a mutation failure nobody else handled", async () => {
    const screen = await renderWithClient(
      <FailingMutation message="approve-batch exploded" />,
    );

    await userEvent.click(screen.getByText("Go"));

    await expect
      .element(screen.getByText("approve-batch exploded"))
      .toBeVisible();
  });

  it("stays quiet for a mutation that reports its own failures", async () => {
    // A message of its own, because sonner's toast list is global: a toast
    // another test raised can still be on screen here.
    const screen = await renderWithClient(
      <FailingMutation message="reported elsewhere" errorToast={false} />,
    );

    await userEvent.click(screen.getByText("Go"));
    // Nothing to wait for but the absence, so give the toast a chance to
    // appear before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(
      await screen.getByText("reported elsewhere").elements(),
    ).toHaveLength(0);
  });
});
