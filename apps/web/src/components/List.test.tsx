import type { Screenshot } from "@cappa/core";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
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
  it("renders all screenshot names", async () => {
    const screen = renderList();
    await expect.element(screen.getByText("Screenshot One")).toBeVisible();
    await expect.element(screen.getByText("Screenshot Two")).toBeVisible();
  });

  it("renders links to screenshot detail pages", async () => {
    const { container } = renderList();
    const links = container.querySelectorAll("a[href]");
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/screenshots/1");
    expect(hrefs).toContain("/screenshots/2");
  });

  it("renders a header row with Name column", async () => {
    const { container } = renderList();
    const th = container.querySelector("th");
    expect(th?.textContent?.trim()).toBe("Name");
  });

  it("in select mode clicking a row link calls onSelectionChange", async () => {
    const onSelectionChange = vi.fn();
    const selection = {
      selectedIds: new Set<string>(),
      onSelectionChange,
    };
    const { container } = renderList({ showCheckboxes: true, selection });
    const links = container.querySelectorAll("a[href]");
    await userEvent.click(links[0] as HTMLElement);
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it("renders 'No results.' for empty screenshots array", async () => {
    const screen = renderList({ screenshots: [] });
    await expect.element(screen.getByText("No results.")).toBeVisible();
  });

  it("table has expected number of rows for screenshots", async () => {
    const screen = renderList();
    const rows = await screen.getByRole("row").elements();
    // header row + one row per screenshot
    expect(rows.length).toBe(screenshots.length + 1);
  });
});
