import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { server } from "../test/setup";
import { renderPage } from "../test/utils";
import { Deleted } from "./Deleted";

describe("Deleted page", () => {
  it("shows loading state initially", async () => {
    const screen = renderPage(<Deleted />, { route: "/deleted" });
    await expect.element(screen.getByText("Loading...")).toBeVisible();
  });

  it("renders deleted screenshots after data loads", async () => {
    const screen = renderPage(<Deleted />, { route: "/deleted" });
    await expect.element(screen.getByText("Screenshot 2")).toBeVisible();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const screen = renderPage(<Deleted />, { route: "/deleted" });
    await expect
      .element(screen.getByText("Error fetching screenshots"))
      .toBeVisible();
    vi.restoreAllMocks();
  });

  it("renders batch approve controls", async () => {
    const screen = renderPage(<Deleted />, { route: "/deleted" });
    await expect.element(screen.getByText("Select")).toBeVisible();
  });

  it("activating select mode shows Cancel and Select all buttons", async () => {
    const screen = renderPage(<Deleted />, { route: "/deleted" });

    await userEvent.click(screen.getByText("Select"));

    await expect.element(screen.getByText("Cancel")).toBeVisible();
    await expect.element(screen.getByText("Select all")).toBeVisible();
  });

  it("approving deleted screenshots calls the approve API", async () => {
    let capturedNames: string[] | undefined;

    server.use(
      http.post("/api/screenshots/approve-batch", async ({ request }) => {
        const body = (await request.json()) as { names: string[] };
        capturedNames = body.names;
        return HttpResponse.json({ approved: body.names, errors: [] });
      }),
    );

    const screen = renderPage(<Deleted />, { route: "/deleted" });

    await userEvent.click(screen.getByText("Select"));
    await userEvent.click(screen.getByText("Select all"));
    await userEvent.click(
      screen.getByRole("button", { name: /Approve selected/ }),
    );

    await expect.poll(() => capturedNames).toEqual(["Screenshot 2"]);
  });
});
