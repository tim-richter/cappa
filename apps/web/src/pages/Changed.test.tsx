import type { Screenshot } from "@cappa/protocol";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { server } from "../test/setup";
import { renderPage } from "../test/utils";
import { Changed } from "./Changed";

describe("Changed page", () => {
  it("shows loading state initially", async () => {
    const screen = await renderPage(<Changed />, { route: "/changed" });
    await expect.element(screen.getByRole("status")).toBeVisible();
    await expect.element(screen.getByText("Loading screenshots")).toBeVisible();
  });

  it("renders changed screenshots after data loads", async () => {
    const screen = await renderPage(<Changed />, { route: "/changed" });
    await expect.element(screen.getByText("Screenshot 3")).toBeVisible();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const screen = await renderPage(<Changed />, { route: "/changed" });
    await expect
      .element(screen.getByText("Couldn't load screenshots"))
      .toBeVisible();
    await expect.element(screen.getByText("Network error")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Retry" }))
      .toBeVisible();
    vi.restoreAllMocks();
  });

  it("shows a styled, retryable error when the API fails with a 500", async () => {
    server.use(
      http.get("/api/screenshots", () =>
        HttpResponse.json(
          { error: "Screenshot store is gone" },
          { status: 500 },
        ),
      ),
    );

    const screen = await renderPage(<Changed />, { route: "/changed" });

    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect
      .element(screen.getByText("Couldn't load screenshots"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Screenshot store is gone"))
      .toBeVisible();
    await expect.element(screen.getByText("HTTP 500")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Retry" }))
      .toBeVisible();
  });

  it("recovers from a failed request without a page reload", async () => {
    let failed = false;

    server.use(
      http.get("/api/screenshots", () => {
        if (failed) {
          return HttpResponse.json<Screenshot[]>([
            {
              name: "Screenshot 3",
              id: "3",
              actualPath: "https://picsum.photos/200/300",
              expectedPath: "https://picsum.photos/200/300",
              diffPath: "https://picsum.photos/200/300",
              category: "changed",
            },
          ]);
        }

        failed = true;
        return HttpResponse.json({ error: "Temporary" }, { status: 500 });
      }),
    );

    const screen = await renderPage(<Changed />, { route: "/changed" });

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await expect.element(screen.getByText("Screenshot 3")).toBeVisible();
  });

  it("explains an empty category in list view", async () => {
    server.use(
      http.get("/api/screenshots", () => HttpResponse.json<Screenshot[]>([])),
    );

    const screen = await renderPage(<Changed />, {
      route: "/changed",
      searchParams: { view: "list" },
    });

    await expect
      .element(screen.getByText("No changed screenshots"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Everything matches the baseline."))
      .toBeVisible();
  });

  it("explains an empty category in grid view", async () => {
    server.use(
      http.get("/api/screenshots", () => HttpResponse.json<Screenshot[]>([])),
    );

    const screen = await renderPage(<Changed />, {
      route: "/changed",
      searchParams: { view: "grid" },
    });

    await expect
      .element(screen.getByText("No changed screenshots"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Everything matches the baseline."))
      .toBeVisible();
  });

  it("renders batch approve controls", async () => {
    const screen = await renderPage(<Changed />, { route: "/changed" });
    await expect.element(screen.getByText("Select")).toBeVisible();
  });

  it("activating select mode shows Cancel and Select all buttons", async () => {
    const screen = await renderPage(<Changed />, { route: "/changed" });

    await userEvent.click(screen.getByText("Select"));

    await expect.element(screen.getByText("Cancel")).toBeVisible();
    await expect.element(screen.getByText("Select all")).toBeVisible();
  });

  it("selecting all and approving calls the approve API", async () => {
    let capturedNames: string[] | undefined;

    server.use(
      http.post("/api/screenshots/approve-batch", async ({ request }) => {
        const body = (await request.json()) as { names: string[] };
        capturedNames = body.names;
        return HttpResponse.json({ approved: body.names, errors: [] });
      }),
    );

    const screen = await renderPage(<Changed />, { route: "/changed" });

    await userEvent.click(screen.getByText("Select"));
    await userEvent.click(screen.getByText("Select all"));
    await userEvent.click(
      screen.getByRole("button", { name: /Approve selected/ }),
    );

    await expect.poll(() => capturedNames).toEqual(["Screenshot 3"]);
  });
});
