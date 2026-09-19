import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("says which kind of nothing a changed page is showing", async () => {
    const screen = await render(<EmptyState category="changed" />);
    await expect
      .element(screen.getByText("No changed screenshots"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Everything matches the baseline."))
      .toBeVisible();
  });

  it("uses category-specific copy for every category", async () => {
    const screen = await render(
      <>
        <EmptyState category="new" />
        <EmptyState category="deleted" />
        <EmptyState category="passed" />
      </>,
    );

    await expect.element(screen.getByText("No new screenshots")).toBeVisible();
    await expect
      .element(screen.getByText("No deleted screenshots"))
      .toBeVisible();
    await expect
      .element(screen.getByText("No passed screenshots"))
      .toBeVisible();
  });

  it("falls back to uncategorised copy without a category", async () => {
    const screen = await render(<EmptyState />);
    await expect.element(screen.getByText("No screenshots")).toBeVisible();
  });

  it("lets the caller replace the description", async () => {
    const screen = await render(
      <EmptyState description="No screenshots match “button”." />,
    );
    await expect
      .element(screen.getByText("No screenshots match “button”."))
      .toBeVisible();
  });
});
