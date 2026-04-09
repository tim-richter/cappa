import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CategoryBadge } from "./CategoryBadge";

describe("CategoryBadge", () => {
  it("renders 'new' category with correct text", async () => {
    const screen = await render(<CategoryBadge category="new" />);
    await expect.element(screen.getByText("new")).toBeVisible();
  });

  it("renders 'changed' category with correct text", async () => {
    const screen = await render(<CategoryBadge category="changed" />);
    await expect.element(screen.getByText("changed")).toBeVisible();
  });

  it("renders 'deleted' category with correct text", async () => {
    const screen = await render(<CategoryBadge category="deleted" />);
    await expect.element(screen.getByText("deleted")).toBeVisible();
  });

  it("renders 'passed' category with correct text", async () => {
    const screen = await render(<CategoryBadge category="passed" />);
    await expect.element(screen.getByText("passed")).toBeVisible();
  });

  it("applies additional className", async () => {
    const { container } = await render(
      <CategoryBadge category="new" className="custom-class" />,
    );
    expect(container.firstElementChild?.className).toContain("custom-class");
  });

  it("applies orange color class for changed", async () => {
    const { container } = await render(<CategoryBadge category="changed" />);
    expect(container.firstElementChild?.className).toContain("bg-orange");
  });

  it("applies blue color class for new", async () => {
    const { container } = await render(<CategoryBadge category="new" />);
    expect(container.firstElementChild?.className).toContain("bg-blue");
  });

  it("applies red color class for deleted", async () => {
    const { container } = await render(<CategoryBadge category="deleted" />);
    expect(container.firstElementChild?.className).toContain("bg-red");
  });

  it("applies green color class for passed", async () => {
    const { container } = await render(<CategoryBadge category="passed" />);
    expect(container.firstElementChild?.className).toContain("bg-green");
  });
});
