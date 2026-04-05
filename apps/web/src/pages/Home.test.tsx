import { describe, expect, it, vi } from "vitest";
import { renderPage } from "../test/utils";
import { Home } from "./Home";

describe("Home page", () => {
  it("shows loading state initially", async () => {
    const screen = renderPage(<Home />, { route: "/" });
    await expect.element(screen.getByText("Loading...")).toBeVisible();
  });

  it("renders all category sections after data loads", async () => {
    const screen = renderPage(<Home />, { route: "/" });
    await expect
      .element(screen.getByRole("heading", { name: "New" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Deleted" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Changed" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Passed" }))
      .toBeVisible();
  });

  it("renders screenshot names after data loads", async () => {
    const screen = renderPage(<Home />, { route: "/" });
    await expect.element(screen.getByText("New Screenshot")).toBeVisible();
    await expect.element(screen.getByText("Deleted Screenshot")).toBeVisible();
    await expect.element(screen.getByText("Changed Screenshot")).toBeVisible();
    await expect.element(screen.getByText("Passed Screenshot")).toBeVisible();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const screen = renderPage(<Home />, { route: "/" });
    await expect
      .element(screen.getByText("Error fetching screenshots"))
      .toBeVisible();
    vi.restoreAllMocks();
  });

  it("renders Select button from BatchApproveBar", async () => {
    const screen = renderPage(<Home />, { route: "/" });
    await expect.element(screen.getByText("Select")).toBeVisible();
  });

  it("renders screenshots matching search when search param is set", async () => {
    const screen = renderPage(<Home />, {
      route: "/",
      searchParams: { search: "something" },
    });
    await expect.element(screen.getByText("Screenshot 1")).toBeVisible();
  });
});
