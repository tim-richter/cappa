import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockRunSummary, runsHandler } from "@/mocks/capture";
import { server } from "@/test/setup";
import { renderWithProviders } from "@/test/utils";
import { RecaptureButton } from "./RecaptureButton";

/**
 * The button used to be handed `screenshot.name`, which is not a task id for
 * any plugin but `@cappa/plugin-pages` — Storybook writes
 * `example/button/primary` for the task `example-button--primary`. Every click
 * came back `400 CAPPA_UNKNOWN_TARGETS`. These pin the contract that replaced
 * that guess: a real task id, or no button.
 */
describe("RecaptureButton", () => {
  it("starts a run for the task id it was given", async () => {
    const started: unknown[] = [];
    server.use(
      http.post("/api/runs", async ({ request }) => {
        started.push(await request.json());
        return HttpResponse.json(
          { runId: "run-1", run: mockRunSummary },
          { status: 201 },
        );
      }),
    );

    const screen = await renderWithProviders(
      <RecaptureButton taskId="example-button--primary" />,
    );

    await screen
      .getByRole("button", { name: "Re-capture example-button--primary" })
      .click();

    await expect
      .poll(() => started)
      .toEqual([
        {
          taskIds: ["example-button--primary"],
          // Never `true`: clearing `actual/` for a run of one would destroy every
          // other screenshot's result.
          clearActual: false,
        },
      ]);
  });

  it("renders nothing when the screenshot has no known task", async () => {
    // A screenshot captured before the capture manifest existed. There is
    // nothing to ask the engine for, so offering a button that can only fail
    // is worse than offering none.
    const screen = await renderWithProviders(
      <RecaptureButton taskId={undefined} />,
    );

    await expect
      .poll(async () => (await screen.getByRole("button").elements()).length)
      .toBe(0);
  });

  it("renders nothing on a read-only server", async () => {
    server.use(
      http.get("/api/config", () =>
        HttpResponse.json({ theme: "light", readOnly: true }),
      ),
    );

    const screen = await renderWithProviders(<RecaptureButton taskId="home" />);

    await expect
      .poll(async () => (await screen.getByRole("button").elements()).length)
      .toBe(0);
  });

  it("is disabled while another run holds the engine", async () => {
    server.use(runsHandler([mockRunSummary]));

    const screen = await renderWithProviders(<RecaptureButton taskId="home" />);

    await expect
      .element(screen.getByRole("button", { name: "Re-capture home" }))
      .toBeDisabled();
  });
});
