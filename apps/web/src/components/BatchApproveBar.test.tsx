import type { Screenshot } from "@cappa/core";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  it("renders Select button when not in select mode", () => {
    const { getByText } = render(<BatchApproveBar {...defaultProps} />);
    expect(getByText("Select")).toBeTruthy();
  });

  it("returns null when all screenshots are passed (no approvable items)", () => {
    const { container } = render(
      <BatchApproveBar
        {...defaultProps}
        screenshots={[passedScreenshot]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("clicking Select button activates select mode", async () => {
    const user = userEvent.setup();
    const onSelectModeChange = vi.fn();
    const { getByText } = render(
      <BatchApproveBar
        {...defaultProps}
        onSelectModeChange={onSelectModeChange}
      />,
    );
    await user.click(getByText("Select"));
    expect(onSelectModeChange).toHaveBeenCalledWith(true);
  });

  it("shows Cancel, Select all, and Approve buttons when in select mode", () => {
    const { getByText } = render(
      <BatchApproveBar {...defaultProps} isSelectMode />,
    );
    expect(getByText("Cancel")).toBeTruthy();
    expect(getByText("Select all")).toBeTruthy();
    expect(getByText(/Approve selected/)).toBeTruthy();
  });

  it("shows selected count when items are selected", () => {
    const { getByText } = render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        selectedIds={new Set(["1"])}
      />,
    );
    expect(getByText("1 selected")).toBeTruthy();
  });

  it("clicking Cancel deactivates select mode", async () => {
    const user = userEvent.setup();
    const onSelectModeChange = vi.fn();
    const { getByText } = render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        onSelectModeChange={onSelectModeChange}
      />,
    );
    await user.click(getByText("Cancel"));
    expect(onSelectModeChange).toHaveBeenCalledWith(false);
  });

  it("Approve selected button is disabled when no approvable items selected", () => {
    const { getByRole } = render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        selectedIds={new Set()}
      />,
    );
    const approveBtn = getByRole("button", { name: /Approve selected/ });
    expect(approveBtn).toBeDisabled();
  });

  it("clicking Approve selected calls onApproveSelected with correct names", async () => {
    const user = userEvent.setup();
    const onApproveSelected = vi.fn();
    const { getByRole } = render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        selectedIds={new Set(["1", "2"])}
        onApproveSelected={onApproveSelected}
      />,
    );
    const approveBtn = getByRole("button", { name: /Approve selected/ });
    await user.click(approveBtn);
    expect(onApproveSelected).toHaveBeenCalledWith([
      "screenshot-1",
      "screenshot-2",
    ]);
  });

  it("Approve selected is disabled when isPending=true", () => {
    const { getByRole } = render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        selectedIds={new Set(["1"])}
        isPending
      />,
    );
    const approveBtn = getByRole("button", { name: /Approve selected/ });
    expect(approveBtn).toBeDisabled();
  });

  it("clicking Select all calls onSelectAll", async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    const { getByText } = render(
      <BatchApproveBar
        {...defaultProps}
        isSelectMode
        onSelectAll={onSelectAll}
      />,
    );
    await user.click(getByText("Select all"));
    expect(onSelectAll).toHaveBeenCalled();
  });
});
