import { describe, expect, it } from "vitest";
import { renderPage } from "../test/utils";
import { Header } from "./Header";

/**
 * The header derives its category from the first path segment. That segment is
 * not always a category — it is `""` on the home page — and the server rejects
 * `?category=` with a `400`, so an unguarded read produced a blank heading and
 * no count on the page every user opens first.
 */
describe("Header category derivation", () => {
  it("shows the category heading and count on a category page", async () => {
    const screen = await renderPage(<Header />, { route: "/changed" });

    await expect
      .element(screen.getByRole("heading", { name: "Changed Screenshots" }))
      .toBeVisible();
    await expect
      .element(screen.getByText(/screenshot\(s\) in this category/))
      .toBeVisible();
  });

  it("falls back to all screenshots on the home page", async () => {
    const screen = await renderPage(<Header />, { route: "/" });

    await expect
      .element(screen.getByRole("heading", { name: "All Screenshots" }))
      .toBeVisible();
  });

  it("counts every screenshot on the home page rather than none", async () => {
    const screen = await renderPage(<Header />, { route: "/" });

    // The mock's unfiltered list holds six. Before the fix this request was
    // `?category=`, a 400, and the count rendered as an empty string.
    await expect.element(screen.getByText("6 screenshot(s)")).toBeVisible();
  });

  it("does not treat a non-category path as a category", async () => {
    const screen = await renderPage(<Header />, { route: "/capture" });

    await expect
      .element(screen.getByRole("heading", { name: "All Screenshots" }))
      .toBeVisible();
  });
});
