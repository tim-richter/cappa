import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/setup";
import { renderPage } from "../test/utils";
import { Passed } from "./Passed";

describe("Passed page", () => {
  it("shows loading state initially", async () => {
    const screen = renderPage(<Passed />, { route: "/passed" });
    await expect.element(screen.getByText("Loading...")).toBeVisible();
  });

  it("renders passed screenshots after data loads", async () => {
    const screen = renderPage(<Passed />, { route: "/passed" });
    await expect.element(screen.getByText("Screenshot 4")).toBeVisible();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const screen = renderPage(<Passed />, { route: "/passed" });
    await expect
      .element(screen.getByText("Error fetching screenshots"))
      .toBeVisible();
    vi.restoreAllMocks();
  });

  it("does not render batch approve controls (passed screenshots are read-only)", async () => {
    const screen = renderPage(<Passed />, { route: "/passed" });
    await expect.element(screen.getByText("Screenshot 4")).toBeVisible();
    const selectButtons = await screen
      .getByRole("button", { name: "Select" })
      .elements();
    expect(selectButtons.length).toBe(0);
  });
});
