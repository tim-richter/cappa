import type { StartRunRequest } from "@cappa/protocol";
import { describe, expect, it, vi } from "vitest";
import { mockPlugins, mockTargets } from "@/mocks/capture";
import { renderWithProviders } from "@/test/utils";
import { CapturePanel } from "./CapturePanel";

const setup = async (
  props: Partial<Parameters<typeof CapturePanel>[0]> = {},
) => {
  const onStart = vi.fn<(request: StartRunRequest) => void>();
  const screen = await renderWithProviders(
    <CapturePanel
      targets={mockTargets}
      plugins={mockPlugins}
      onStart={onStart}
      {...props}
    />,
  );
  return { screen, onStart };
};

describe("CapturePanel", () => {
  it("lists every discovered target", async () => {
    const { screen } = await setup();

    for (const target of mockTargets) {
      await expect.element(screen.getByText(target.id)).toBeVisible();
    }
  });

  it("captures everything when nothing is selected", async () => {
    const { screen, onStart } = await setup();

    await screen.getByRole("button", { name: "Start capture" }).click();

    expect(onStart).toHaveBeenCalledWith({});
  });

  it("captures only the selected tasks, without clearing the rest", async () => {
    const { screen, onStart } = await setup();

    await screen.getByLabelText(mockTargets[1].id).click();
    await screen.getByRole("button", { name: "Start capture" }).click();

    // clearActual must be false for a partial run, or it wipes results it is
    // not re-capturing.
    expect(onStart).toHaveBeenCalledWith({
      taskIds: [mockTargets[1].id],
      clearActual: false,
    });
  });

  it("captures a whole plugin when one is ticked", async () => {
    const { screen, onStart } = await setup();

    await screen.getByLabelText("docs").click();
    await screen.getByRole("button", { name: "Start capture" }).click();

    expect(onStart).toHaveBeenCalledWith({ plugins: ["docs"] });
  });

  it("filters the visible tasks", async () => {
    const { screen } = await setup();

    await screen.getByLabelText("Filter tasks").fill("Screenshot 3");

    await expect.element(screen.getByText("Screenshot 3")).toBeVisible();
    expect(screen.getByText("Screenshot 1").elements()).toHaveLength(0);
  });

  it("narrows the list to a plugin's tasks", async () => {
    const { screen } = await setup();

    await screen.getByLabelText("docs").click();

    await expect.element(screen.getByText("Screenshot 3")).toBeVisible();
    expect(screen.getByText("Screenshot 1").elements()).toHaveLength(0);
  });

  it("selects and clears every visible task", async () => {
    const { screen, onStart } = await setup();

    await screen.getByRole("button", { name: "Select all" }).click();
    await screen.getByRole("button", { name: "Start capture" }).click();

    expect(onStart).toHaveBeenCalledWith({
      taskIds: mockTargets.map((target) => target.id),
      clearActual: false,
    });

    await screen.getByRole("button", { name: "Clear selection" }).click();
    await screen.getByRole("button", { name: "Start capture" }).click();

    expect(onStart).toHaveBeenLastCalledWith({});
  });

  it("selects only what the filter shows", async () => {
    const { screen, onStart } = await setup();

    await screen.getByLabelText("Filter tasks").fill("Screenshot 3");
    await screen.getByRole("button", { name: "Select all" }).click();
    await screen.getByRole("button", { name: "Start capture" }).click();

    expect(onStart).toHaveBeenCalledWith({
      taskIds: ["Screenshot 3"],
      clearActual: false,
    });
  });

  it("says what it is about to capture", async () => {
    const { screen } = await setup();

    await expect
      .element(screen.getByText(/will capture everything/))
      .toBeVisible();

    await screen.getByLabelText(mockTargets[0].id).click();

    await expect.element(screen.getByText(/1 selected/)).toBeVisible();
  });

  it("disables starting while a run is active", async () => {
    const { screen } = await setup({ isRunActive: true });

    await expect
      .element(screen.getByRole("button", { name: "Run in progress" }))
      .toBeDisabled();
  });

  it("reports an empty discovery", async () => {
    const { screen } = await setup({ targets: [] });

    await expect
      .element(screen.getByText("No tasks discovered."))
      .toBeVisible();
  });

  it("reports a filter that matches nothing", async () => {
    const { screen } = await setup();

    await screen.getByLabelText("Filter tasks").fill("nothing-matches-this");

    await expect
      .element(screen.getByText("No tasks match this filter."))
      .toBeVisible();
  });

  it("re-discovers on request", async () => {
    const onRefreshTargets = vi.fn();
    const { screen } = await setup({ onRefreshTargets });

    await screen.getByRole("button", { name: "Rediscover" }).click();

    expect(onRefreshTargets).toHaveBeenCalled();
  });

  it("hides the plugin picker when there is only one plugin", async () => {
    const { screen } = await setup({ plugins: [mockPlugins[0]] });

    expect(screen.getByText("Plugins:").elements()).toHaveLength(0);
  });
});

describe("CapturePanel watch toggle", () => {
  it("is absent when the server cannot watch", async () => {
    const { screen } = await setup({
      watch: { supported: false, active: false, onToggle: vi.fn() },
    });

    // A control that could only ever fail is worse than no control.
    await expect
      .element(screen.getByLabelText("Watch files"))
      .not.toBeInTheDocument();
  });

  it("turns watching on and off", async () => {
    const onToggle = vi.fn();
    const { screen } = await setup({
      watch: { supported: true, active: false, onToggle },
    });

    await screen.getByLabelText("Watch files").click();

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("says what it is doing while watching", async () => {
    const { screen } = await setup({
      watch: { supported: true, active: true, onToggle: vi.fn() },
    });

    await expect
      .element(screen.getByText(/Watching for file changes/))
      .toBeVisible();
  });

  it("reports the last change and what it re-captured", async () => {
    const { screen } = await setup({
      watch: {
        supported: true,
        active: true,
        onToggle: vi.fn(),
        lastChange: {
          files: ["src/Button.stories.tsx"],
          scope: "tasks",
          taskIds: ["a", "b"],
          runId: "run-2",
          at: 0,
        },
      },
    });

    await expect
      .element(
        screen.getByText(
          "src/Button.stories.tsx changed — re-capturing 2 tasks",
        ),
      )
      .toBeVisible();
  });

  it("reports a change that could not start a run", async () => {
    const { screen } = await setup({
      watch: {
        supported: true,
        active: true,
        onToggle: vi.fn(),
        lastChange: {
          files: ["a.tsx", "b.tsx"],
          scope: "all",
          error: "A capture run is already in progress (run-9)",
          at: 0,
        },
      },
    });

    await expect
      .element(screen.getByText(/could not start a run/))
      .toBeVisible();
  });
});
