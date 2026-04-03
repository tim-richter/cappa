import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/server";
import { renderPage } from "../test/utils";
import { Changed } from "./Changed";

describe("Changed page", () => {
  it("shows loading state initially", async () => {
    const screen = renderPage(<Changed />, { route: "/changed" });
    await expect.element(screen.getByText("Loading...")).toBeVisible();
  });

  it("renders changed screenshots after data loads", async () => {
    const screen = renderPage(<Changed />, { route: "/changed" });
    await expect.element(screen.getByText("Screenshot 3")).toBeVisible();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const screen = renderPage(<Changed />, { route: "/changed" });
    await expect
      .element(screen.getByText("Error fetching screenshots"))
      .toBeVisible();
    vi.restoreAllMocks();
  });

  it("renders batch approve controls", async () => {
    const screen = renderPage(<Changed />, { route: "/changed" });
    await expect.element(screen.getByText("Select")).toBeVisible();
  });

  it("activating select mode shows Cancel and Select all buttons", async () => {
    const screen = renderPage(<Changed />, { route: "/changed" });

    await screen.getByText("Select").click();

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

    const screen = renderPage(<Changed />, { route: "/changed" });

    await screen.getByText("Select").click();
    await screen.getByText("Select all").click();
    await screen.getByRole("button", { name: /Approve selected/ }).click();

    await expect.poll(() => capturedNames).toEqual(["Screenshot 3"]);
  });
});
