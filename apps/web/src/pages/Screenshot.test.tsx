import { describe, expect, it, vi } from "vitest";
import { renderPageWithRoute } from "../test/utils";
import { Screenshot } from "./Screenshot";

describe("Screenshot page", () => {
  it("shows loading state initially", async () => {
    const screen = renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
    );
    await expect.element(screen.getByText("Loading...")).toBeVisible();
  });

  it("renders screenshot viewer after data loads for new screenshot", async () => {
    const screen = renderPageWithRoute(
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
    const screen = renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
    );
    await expect
      .element(screen.getByText("Error fetching screenshot"))
      .toBeVisible();
    vi.restoreAllMocks();
  });

  it("renders comparison viewer for a changed screenshot", async () => {
    const screen = renderPageWithRoute(
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
});
