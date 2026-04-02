import type { Screenshot } from "@cappa/core";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Grid } from "./Grid";

const screenshots: Screenshot[] = [
  {
    id: "1",
    name: "Screenshot One",
    category: "new",
    actualPath: "/actual1.png",
  },
  {
    id: "2",
    name: "Screenshot Two",
    category: "new",
    actualPath: "/actual2.png",
  },
];

function renderGrid(
  props: Partial<React.ComponentProps<typeof Grid>> = {},
) {
  return render(
    <MemoryRouter>
      <Grid
        screenshots={screenshots}
        category="new"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("Grid", () => {
  it("renders all screenshot names", () => {
    const { getByText } = renderGrid();
    expect(getByText("Screenshot One")).toBeTruthy();
    expect(getByText("Screenshot Two")).toBeTruthy();
  });

  it("renders links to screenshot detail pages", () => {
    const { getAllByRole } = renderGrid();
    const links = getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === "/screenshots/1")).toBe(
      true,
    );
    expect(links.some((l) => l.getAttribute("href") === "/screenshots/2")).toBe(
      true,
    );
  });

  it("renders a category badge for each screenshot", () => {
    const { container } = renderGrid();
    // CategoryBadge renders a Badge element containing the category text
    const badges = container.querySelectorAll('[class*="bg-blue"]');
    expect(badges.length).toBe(2);
  });

  it("does not render checkboxes when showCheckboxes is false", () => {
    const { queryAllByRole } = renderGrid({ showCheckboxes: false });
    const checkboxes = queryAllByRole("checkbox");
    expect(checkboxes.length).toBe(0);
  });

  it("renders checkboxes when showCheckboxes and selection are provided", () => {
    const selection = {
      selectedIds: new Set<string>(),
      onSelectionChange: vi.fn(),
    };
    const { getAllByRole } = renderGrid({
      showCheckboxes: true,
      selection,
    });
    const checkboxes = getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);
  });

  it("shows checked state for selected screenshots via aria-checked", () => {
    const selection = {
      selectedIds: new Set(["1"]),
      onSelectionChange: vi.fn(),
    };
    const { getAllByRole } = renderGrid({
      showCheckboxes: true,
      selection,
    });
    const checkboxes = getAllByRole("checkbox");
    const checkedCount = checkboxes.filter(
      (cb) => cb.getAttribute("aria-checked") === "true",
    ).length;
    expect(checkedCount).toBe(1);
  });

  it("clicking a checkbox in select mode calls onSelectionChange", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const selection = {
      selectedIds: new Set<string>(),
      onSelectionChange,
    };
    const { getAllByRole } = renderGrid({
      showCheckboxes: true,
      selection,
    });
    const checkboxes = getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it("renders an empty grid for empty screenshots array", () => {
    const { container } = renderGrid({ screenshots: [] });
    const grid = container.querySelector(".grid");
    expect(grid?.children.length).toBe(0);
  });
});
