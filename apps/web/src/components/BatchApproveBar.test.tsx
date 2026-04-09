import type { Screenshot } from "@cappa/core";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { BatchApproveBar } from "./BatchApproveBar";

const newScreenshot: Screenshot = {
  id: "1",
  name: "screenshot-1",
  category: "new",
  actualPath: "/actual.png",
};

const changedScreenshot: Screenshot = {
  id: "2",
  name: "screenshot-2",
  category: "changed",
  actualPath: "/actual.png",
  expectedPath: "/expected.png",
  diffPath: "/diff.png",
};

const passedScreenshot: Screenshot = {
  id: "3",
  name: "screenshot-3",
  category: "passed",
  actualPath: "/actual.png",
  expectedPath: "/expected.png",
};

const defaultProps = {
  isSelectMode: false,
  onSelectModeChange: vi.fn(),
  selectedIds: new Set<string>(),
  screenshots: [newScreenshot, changedScreenshot],
  onSelectAll: vi.fn(),
  onApproveSelected: vi.fn(),
  onApproveAll: vi.fn(),
  onClearSelection: vi.fn(),
};

describe("BatchApproveBar", () => {
  it("renders Select button when not in select mode", async () => {
    const screen = await render(<BatchApproveBar {...defaultProps} />);
    await expect.element(screen.getByText("Select")).toBeVisible();
  });

  it("returns null when all screenshots are passed (no approvable items)", async () => {
    const { container } = await render(
      <BatchApproveBar {...defaultProps} screenshots={[passedScreenshot]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("clicking Select button activates select mode", async () => {
    const onSelectModeChange = vi.fn();
    const screen = await render(
      <BatchApproveBar
        {...defaultProps}
        onSelectModeChange={onSelectModeChange}
      />,
    );
    await userEvent.click(screen.getByText("Select"));
    expect(onSelectModeChange).toHaveBeenCalledWith(true);
  });

  it("shows Cancel, Select all, and Approve buttons when in select mode", async () => {
    const screen = await render(
      <BatchApproveBar {...defaultProps} isSelectMode />,
    );
    await expect.element(screen.getByText("Cancel")).toBeVisible();
    await expect.element(screen.getByText("Select all")).toBeVisible();
    await expect.element(screen.getByText(/Approve selected/)).toBeVisible();
  });

  it("shows selected count when items are selected", async () => {
    const screen = await render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        selectedIds={new Set(["1"])}
      />,
    );
    await expect.element(screen.getByText("1 selected")).toBeVisible();
  });

  it("clicking Cancel deactivates select mode", async () => {
    const onSelectModeChange = vi.fn();
    const screen = await render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        onSelectModeChange={onSelectModeChange}
      />,
    );
    await userEvent.click(screen.getByText("Cancel"));
    expect(onSelectModeChange).toHaveBeenCalledWith(false);
  });

  it("Approve selected button is disabled when no approvable items selected", async () => {
    const screen = await render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        selectedIds={new Set()}
      />,
    );
    await expect
      .element(screen.getByRole("button", { name: /Approve selected/ }))
      .toBeDisabled();
  });

  it("clicking Approve selected calls onApproveSelected with correct names", async () => {
    const onApproveSelected = vi.fn();
    const screen = await render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        selectedIds={new Set(["1", "2"])}
        onApproveSelected={onApproveSelected}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Approve selected/ }),
    );
    expect(onApproveSelected).toHaveBeenCalledWith([
      "screenshot-1",
      "screenshot-2",
    ]);
  });

  it("Approve selected is disabled when isPending=true", async () => {
    const screen = await render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        selectedIds={new Set(["1"])}
        isPending
      />,
    );
    await expect
      .element(screen.getByRole("button", { name: /Approve selected/ }))
      .toBeDisabled();
  });

  it("clicking Select all calls onSelectAll", async () => {
    const onSelectAll = vi.fn();
    const screen = await render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        onSelectAll={onSelectAll}
      />,
    );
    await userEvent.click(screen.getByText("Select all"));
    expect(onSelectAll).toHaveBeenCalled();
  });
});
