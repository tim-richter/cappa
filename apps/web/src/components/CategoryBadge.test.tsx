import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryBadge } from "./CategoryBadge";

describe("CategoryBadge", () => {
  it("renders 'new' category with correct text", () => {
    const { getByText } = render(<CategoryBadge category="new" />);
    expect(getByText("new")).toBeTruthy();
  });

  it("renders 'changed' category with correct text", () => {
    const { getByText } = render(<CategoryBadge category="changed" />);
    expect(getByText("changed")).toBeTruthy();
  });

  it("renders 'deleted' category with correct text", () => {
    const { getByText } = render(<CategoryBadge category="deleted" />);
    expect(getByText("deleted")).toBeTruthy();
  });

  it("renders 'passed' category with correct text", () => {
    const { getByText } = render(<CategoryBadge category="passed" />);
    expect(getByText("passed")).toBeTruthy();
  });

  it("applies additional className", () => {
    const { container } = render(
      <CategoryBadge category="new" className="custom-class" />,
    );
    expect(container.firstElementChild?.className).toContain("custom-class");
  });

  it("applies orange color class for changed", () => {
    const { container } = render(<CategoryBadge category="changed" />);
    expect(container.firstElementChild?.className).toContain("bg-orange");
  });

  it("applies blue color class for new", () => {
    const { container } = render(<CategoryBadge category="new" />);
    expect(container.firstElementChild?.className).toContain("bg-blue");
  });

  it("applies red color class for deleted", () => {
    const { container } = render(<CategoryBadge category="deleted" />);
    expect(container.firstElementChild?.className).toContain("bg-red");
  });

  it("applies green color class for passed", () => {
    const { container } = render(<CategoryBadge category="passed" />);
    expect(container.firstElementChild?.className).toContain("bg-green");
  });
});
