import type { Screenshot } from "@cappa/core";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { List } from "./List";

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
    category: "changed",
    actualPath: "/actual2.png",
    expectedPath: "/expected2.png",
    diffPath: "/diff2.png",
  },
];

function renderList(props: Partial<React.ComponentProps<typeof List>> = {}) {
  return render(
    <MemoryRouter>
      <List screenshots={screenshots} {...props} />
    </MemoryRouter>,
  );
}

describe("List", () => {
  it("renders all screenshot names", () => {
    const { getByText } = renderList();
    expect(getByText("Screenshot One")).toBeTruthy();
    expect(getByText("Screenshot Two")).toBeTruthy();
  });

  it("renders links to screenshot detail pages", () => {
    const { getAllByRole } = renderList();
    const links = getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === "/screenshots/1")).toBe(
      true,
    );
    expect(links.some((l) => l.getAttribute("href") === "/screenshots/2")).toBe(
      true,
    );
  });

  it("renders a header row with Name column", () => {
    const { getByRole } = renderList();
    expect(getByRole("columnheader", { name: "Name" })).toBeTruthy();
  });

  it("in select mode clicking a row link calls onSelectionChange", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const selection = {
      selectedIds: new Set<string>(),
      onSelectionChange,
    };
    const { getAllByRole } = renderList({ showCheckboxes: true, selection });
    const links = getAllByRole("link");
    await user.click(links[0]);
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it("renders 'No results.' for empty screenshots array", () => {
    const { getByText } = renderList({ screenshots: [] });
    expect(getByText("No results.")).toBeTruthy();
  });

  it("table has expected number of rows for screenshots", () => {
    const { getAllByRole } = renderList();
    const rows = getAllByRole("row");
    // header row + one row per screenshot
    expect(rows.length).toBe(screenshots.length + 1);
  });
});
