import type { Screenshot } from "@cappa/core";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
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

function renderGrid(props: Partial<React.ComponentProps<typeof Grid>> = {}) {
  return render(
    <MemoryRouter>
      <Grid screenshots={screenshots} category="new" {...props} />
    </MemoryRouter>,
  );
}

describe("Grid", () => {
  it("renders all screenshot names", async () => {
    const screen = renderGrid();
    await expect.element(screen.getByText("Screenshot One")).toBeVisible();
    await expect.element(screen.getByText("Screenshot Two")).toBeVisible();
  });

  it("renders links to screenshot detail pages", async () => {
    const { container } = renderGrid();
    const links = container.querySelectorAll("a[href]");
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/screenshots/1");
    expect(hrefs).toContain("/screenshots/2");
  });

  it("renders a category badge for each screenshot", async () => {
    const { container } = renderGrid();
    const badges = container.querySelectorAll('[class*="bg-blue"]');
    expect(badges.length).toBe(2);
  });

  it("does not render checkboxes when showCheckboxes is false", async () => {
    const screen = renderGrid({ showCheckboxes: false });
    const checkboxes = await screen.getByRole("checkbox").elements();
    expect(checkboxes.length).toBe(0);
  });

  it("renders checkboxes when showCheckboxes and selection are provided", async () => {
    const selection = {
      selectedIds: new Set<string>(),
      onSelectionChange: vi.fn(),
    };
    const screen = renderGrid({ showCheckboxes: true, selection });
    const checkboxes = await screen.getByRole("checkbox").elements();
    expect(checkboxes.length).toBe(2);
  });

  it("shows checked state for selected screenshots via aria-checked", async () => {
    const selection = {
      selectedIds: new Set(["1"]),
      onSelectionChange: vi.fn(),
    };
    const screen = renderGrid({ showCheckboxes: true, selection });
    const checkboxes = await screen.getByRole("checkbox").elements();
    const checkedCount = checkboxes.filter(
      (cb) => cb.getAttribute("aria-checked") === "true",
    ).length;
    expect(checkedCount).toBe(1);
  });

  it("clicking a checkbox in select mode calls onSelectionChange", async () => {
    const onSelectionChange = vi.fn();
    const selection = {
      selectedIds: new Set<string>(),
      onSelectionChange,
    };
    const screen = renderGrid({ showCheckboxes: true, selection });
    const checkboxes = await screen.getByRole("checkbox").elements();
    await userEvent.click(checkboxes[0]);
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it("renders an empty grid for empty screenshots array", async () => {
    const { container } = renderGrid({ screenshots: [] });
    const grid = container.querySelector(".grid");
    expect(grid?.children.length).toBe(0);
  });
});
