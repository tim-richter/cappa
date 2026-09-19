import type { Screenshot } from "@cappa/protocol";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/setup";
import { renderPage } from "../test/utils";
import { Home } from "./Home";

describe("Home page", () => {
  it("shows loading state initially", async () => {
    const screen = await renderPage(<Home />, { route: "/" });
    await expect.element(screen.getByRole("status")).toBeVisible();
    await expect.element(screen.getByText("Loading screenshots")).toBeVisible();
  });

  it("renders all category sections after data loads", async () => {
    const screen = await renderPage(<Home />, { route: "/" });
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
    const screen = await renderPage(<Home />, { route: "/" });

    await expect.element(screen.getByText("New Screenshot")).toBeVisible();
    await expect.element(screen.getByText("Deleted Screenshot")).toBeVisible();
    await expect.element(screen.getByText("Passed Screenshot")).toBeVisible();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const screen = await renderPage(<Home />, { route: "/" });
    await expect
      .element(screen.getByText("Couldn't load screenshots"))
      .toBeVisible();
    await expect.element(screen.getByText("Network error")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Retry" }))
      .toBeVisible();
    vi.restoreAllMocks();
  });

  it("renders Select button from BatchApproveBar", async () => {
    const screen = await renderPage(<Home />, { route: "/" });
    await expect.element(screen.getByText("Select")).toBeVisible();
  });

  it("renders screenshots matching search when search param is set", async () => {
    const screen = await renderPage(<Home />, {
      route: "/",
      searchParams: { search: "something" },
    });
    await expect.element(screen.getByText("Screenshot 1")).toBeVisible();
  });

  it("says the page is empty rather than rendering four blank sections", async () => {
    server.use(
      http.get("/api/screenshots", () => HttpResponse.json<Screenshot[]>([])),
    );

    const screen = await renderPage(<Home />, { route: "/" });

    await expect.element(screen.getByText("No screenshots")).toBeVisible();
    await expect
      .element(screen.getByText("Run `cappa capture` to capture some."))
      .toBeVisible();
  });

  it("names the search term when nothing matches it", async () => {
    server.use(
      http.get("/api/screenshots", () => HttpResponse.json<Screenshot[]>([])),
    );

    const screen = await renderPage(<Home />, {
      route: "/",
      searchParams: { search: "nothing-matches-this" },
    });

    await expect
      .element(
        screen.getByText(
          "No screenshots match \u201Cnothing-matches-this\u201D.",
        ),
      )
      .toBeVisible();
  });
});
