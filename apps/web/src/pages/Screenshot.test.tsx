import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/setup";
import { renderPageWithRoute } from "../test/utils";
import { Screenshot } from "./Screenshot";

describe("Screenshot page", () => {
  it("shows loading state initially", () => {
    const { getByText } = renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
    );
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("renders screenshot viewer after data loads for new screenshot", async () => {
    const { findAllByRole } = renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
    );
    // The screenshot viewer renders at least one image
    const imgs = await findAllByRole("img", {}, { timeout: 3000 });
    expect(imgs.length).toBeGreaterThan(0);
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const { findByText } = renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
    );
    expect(await findByText("Error fetching screenshot")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("renders comparison viewer for a changed screenshot", async () => {
    const { findAllByRole } = renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/3",
      <Screenshot />,
    );
    // Changed screenshot has actual, expected, and diff images
    const imgs = await findAllByRole("img", {}, { timeout: 3000 });
    expect(imgs.length).toBeGreaterThan(0);
  });
});
