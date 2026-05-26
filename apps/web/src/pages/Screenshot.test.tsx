import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/setup";
import { renderPageWithRoute } from "../test/utils";
import { Screenshot } from "./Screenshot";

function pressKey(key: string) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

describe("Screenshot page", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state initially", async () => {
    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
    );
    await expect.element(screen.getByText("Loading...")).toBeVisible();
  });

  it("renders screenshot viewer after data loads for new screenshot", async () => {
    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
    );
    await expect
      .poll(async () => (await screen.getByRole("img").elements()).length, {
        timeout: 3000,
      })
      .toBeGreaterThan(0);
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
    );
    await expect
      .element(screen.getByText("Error fetching screenshot"))
      .toBeVisible();
  });

  it("renders comparison viewer for a changed screenshot", async () => {
    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/3",
      <Screenshot />,
    );
    await expect
      .poll(async () => (await screen.getByRole("img").elements()).length, {
        timeout: 3000,
      })
      .toBeGreaterThan(0);
  });

  it("keeps the selected view mode when navigating to another changed screenshot", async () => {
    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/3",
      <Screenshot />,
    );

    await expect.element(screen.getByLabelText("Diff Only")).toBeVisible();
    await screen.getByLabelText("Diff Only").click();
    await expect
      .element(screen.getByRole("heading", { name: "Visual Differences" }))
      .toBeVisible();

    await screen.getByRole("link", { name: "Next" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "4" }))
      .toBeVisible();

    await screen.getByRole("link", { name: "Next" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "5" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Visual Differences" }))
      .toBeVisible();
  });

  it("navigates to the next screenshot when ArrowRight is pressed", async () => {
    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/3",
      <Screenshot />,
    );

    await expect
      .element(screen.getByRole("heading", { name: "3" }))
      .toBeVisible();

    pressKey("ArrowRight");

    await expect
      .element(screen.getByRole("heading", { name: "4" }))
      .toBeVisible();
  });

  it("navigates to the previous screenshot when ArrowLeft is pressed", async () => {
    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/3",
      <Screenshot />,
    );

    await expect
      .element(screen.getByRole("heading", { name: "3" }))
      .toBeVisible();

    pressKey("ArrowLeft");

    await expect
      .element(screen.getByRole("heading", { name: "2" }))
      .toBeVisible();
  });

  it("approves the screenshot when the 'a' key is pressed", async () => {
    let capturedBody: unknown;

    server.use(
      http.patch("/api/screenshots/:id", async ({ request, params }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          name: params.id,
          id: params.id,
          category: "new",
          actualPath: "/images/4a.png",
          approved: true,
        });
      }),
    );

    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/3",
      <Screenshot />,
    );

    await expect
      .element(screen.getByRole("heading", { name: "3" }))
      .toBeVisible();

    pressKey("a");

    await expect.poll(() => capturedBody).toEqual({ approved: true });
  });

  it("initializes changed screenshots from persisted view mode", async () => {
    localStorage.setItem("cappa.review.viewMode", "diff-only");

    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/3",
      <Screenshot />,
    );

    await expect
      .element(screen.getByRole("heading", { name: "Visual Differences" }))
      .toBeVisible();
  });
});
