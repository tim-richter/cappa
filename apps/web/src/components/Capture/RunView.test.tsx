import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { UseRunEventsResult } from "@/api/hooks";
import { initialRunState } from "@/api/runState";
import { RunView } from "./RunView";

const runState = (
  overrides: Partial<UseRunEventsResult> = {},
): UseRunEventsResult => ({
  ...initialRunState,
  isStreaming: false,
  ...overrides,
});

describe("RunView", () => {
  it("shows the discovery state before any task exists", async () => {
    const screen = await render(
      <RunView run={runState({ state: "discovering" })} runId="run-1" />,
    );

    await expect.element(screen.getByText("Discovering tasks")).toBeVisible();
    await expect.element(screen.getByText("No tasks yet.")).toBeVisible();
  });

  it("renders progress against the discovered total", async () => {
    const screen = await render(
      <RunView
        run={runState({ state: "running", completed: 1, total: 4 })}
        runId="run-1"
      />,
    );

    await expect.element(screen.getByText("1 of 4 captured")).toBeVisible();
    await expect
      .element(screen.getByRole("progressbar"))
      .toHaveAttribute("aria-valuenow", "25");
  });

  it("lists tasks with their status and duration", async () => {
    const screen = await render(
      <RunView
        run={runState({
          state: "running",
          tasks: [
            {
              id: "button--primary",
              plugin: "demo",
              url: "u",
              status: "changed",
              durationMs: 120,
            },
          ],
        })}
        runId="run-1"
      />,
    );

    await expect.element(screen.getByText("button--primary")).toBeVisible();
    // "changed" also appears in the counts summary, so scope to the table row.
    await expect
      .element(screen.getByRole("cell", { name: "changed" }))
      .toBeVisible();
    await expect.element(screen.getByText("120ms")).toBeVisible();
  });

  it("summarises the outcome by status", async () => {
    const screen = await render(
      <RunView
        run={runState({
          state: "completed",
          tasks: [
            { id: "a", plugin: "p", url: "u", status: "passed" },
            { id: "b", plugin: "p", url: "u", status: "passed" },
            { id: "c", plugin: "p", url: "u", status: "failed" },
          ],
        })}
        runId="run-1"
      />,
    );

    await expect.element(screen.getByText("Completed")).toBeVisible();
    await expect.element(screen.getByText("2")).toBeVisible();
  });

  it("renders the log output", async () => {
    const screen = await render(
      <RunView
        run={runState({
          logs: [{ seq: 1, level: "info", message: "Processing 3 tasks" }],
        })}
        runId="run-1"
      />,
    );

    await expect.element(screen.getByText("Processing 3 tasks")).toBeVisible();
  });

  it("shows an empty log pane before any output", async () => {
    const screen = await render(<RunView run={runState()} runId="run-1" />);

    await expect.element(screen.getByText("No output yet.")).toBeVisible();
  });

  it("surfaces a run error", async () => {
    const screen = await render(
      <RunView
        run={runState({
          state: "failed",
          error: { name: "Error", message: "plugin exploded" },
        })}
        runId="run-1"
      />,
    );

    await expect.element(screen.getByText("plugin exploded")).toBeVisible();
    await expect.element(screen.getByText("Failed")).toBeVisible();
  });

  it("says when the stream dropped but the run is still going", async () => {
    const screen = await render(
      <RunView
        run={runState({ state: "running", streamError: new Error("gone") })}
        runId="run-1"
      />,
    );

    await expect
      .element(screen.getByText("Lost the event stream — reconnecting…"))
      .toBeVisible();
  });

  it("offers cancel while the run is in flight", async () => {
    const onCancel = vi.fn();
    const screen = await render(
      <RunView
        run={runState({ state: "running" })}
        runId="run-1"
        onCancel={onCancel}
      />,
    );

    await screen.getByRole("button", { name: "Cancel" }).click();

    expect(onCancel).toHaveBeenCalled();
  });

  it("hides cancel once the run has finished", async () => {
    const screen = await render(
      <RunView
        run={runState({ state: "completed" })}
        runId="run-1"
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Cancel" }).elements(),
    ).toHaveLength(0);
  });

  it("reports the run duration when it is known", async () => {
    const screen = await render(
      <RunView
        run={runState({
          state: "completed",
          summary: {
            id: "run-1",
            state: "completed",
            request: {},
            startedAt: 0,
            durationMs: 2500,
            totalTasks: 1,
            completedTasks: 1,
            failedTasks: 0,
            deletedScreenshots: [],
            anyTasksRan: true,
          },
        })}
        runId="run-1"
      />,
    );

    await expect.element(screen.getByText("in 2.50s")).toBeVisible();
  });

  it("shows the cancelled state", async () => {
    const screen = await render(
      <RunView run={runState({ state: "cancelled" })} runId="run-1" />,
    );

    await expect.element(screen.getByText("Cancelled")).toBeVisible();
  });
});
