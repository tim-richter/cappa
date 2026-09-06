import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/setup";
import { renderPage } from "../test/utils";
import { Capture } from "./Capture";

/**
 * These drive the real `@cappa/client` against msw, so a run here exercises the
 * whole path the browser takes: POST /api/runs, the SSE stream, the reducer,
 * and the rendered result.
 */
describe("Capture page", () => {
  it("lists discovered targets", async () => {
    const screen = await renderPage(<Capture />, { route: "/capture" });

    await expect.element(screen.getByText("Screenshot 1")).toBeVisible();
    await expect.element(screen.getByText("Screenshot 3")).toBeVisible();
  });

  it("runs a capture and streams it to completion", async () => {
    const screen = await renderPage(<Capture />, { route: "/capture" });

    await screen.getByRole("button", { name: "Start capture" }).click();

    // Terminal state, driven entirely by the mocked event stream.
    await expect.element(screen.getByText("Completed")).toBeVisible();
    await expect.element(screen.getByText("3 of 3 captured")).toBeVisible();
  });

  it("renders each task's outcome from the stream", async () => {
    const screen = await renderPage(<Capture />, { route: "/capture" });

    await screen.getByRole("button", { name: "Start capture" }).click();

    await expect.element(screen.getByText("Completed")).toBeVisible();
    // Each status also appears in the counts summary, so scope to the rows.
    await expect
      .element(screen.getByRole("cell", { name: "passed" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "changed" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "new" }))
      .toBeVisible();
  });

  it("shows log output from the run", async () => {
    const screen = await renderPage(<Capture />, { route: "/capture" });

    await screen.getByRole("button", { name: "Start capture" }).click();

    await expect
      .element(screen.getByText("Processing 3 tasks with concurrency 1"))
      .toBeVisible();
  });

  it("reports a rejected run rather than failing silently", async () => {
    server.use(
      http.post("/api/runs", () =>
        HttpResponse.json(
          {
            error: "A capture run is already in progress (run-9)",
            code: "CAPPA_RUN_IN_PROGRESS",
            activeRunId: "run-9",
          },
          { status: 409 },
        ),
      ),
    );

    const screen = await renderPage(<Capture />, { route: "/capture" });

    await screen.getByRole("button", { name: "Start capture" }).click();

    await expect
      .element(screen.getByText("A capture run is already in progress."))
      .toBeVisible();
  });

  it("hides the capture surface on a read-only server", async () => {
    server.use(
      http.get("/api/config", () =>
        HttpResponse.json({ theme: "light", readOnly: true }),
      ),
    );

    const screen = await renderPage(<Capture />, { route: "/capture" });

    await expect.element(screen.getByText("Capture is disabled")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Start capture" }).elements(),
    ).toHaveLength(0);
  });

  it("surfaces a failed run", async () => {
    server.use(
      http.get("/api/runs/:id/events", () => {
        const events = [
          { seq: 1, runId: "run-1", at: 0, type: "run:start", request: {} },
          {
            seq: 2,
            runId: "run-1",
            at: 0,
            type: "run:error",
            error: { name: "Error", message: "discovery blew up" },
          },
        ];

        return new HttpResponse(
          events
            .map((e) => `id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`)
            .join(""),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }),
    );

    const screen = await renderPage(<Capture />, { route: "/capture" });

    await screen.getByRole("button", { name: "Start capture" }).click();

    await expect.element(screen.getByText("discovery blew up")).toBeVisible();
  });
});
