import type { Meta, StoryObj } from "@storybook/react-vite";
import type { UseRunEventsResult } from "@/api/hooks";
import { initialRunState, runStateReducer } from "@/api/runState";
import { mockRunEvents } from "@/mocks/capture";
import { RunView } from "./RunView";

const meta = {
  title: "Capture/RunView",
  component: RunView,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RunView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Fold the first `count` events of the mock run, as the live view would. */
const stateAfter = (count: number): UseRunEventsResult => ({
  ...mockRunEvents().slice(0, count).reduce(runStateReducer, initialRunState),
  isStreaming: count < mockRunEvents().length,
});

export const Discovering: Story = {
  args: { run: stateAfter(2), runId: "run-1", onCancel: () => {} },
};

export const Running: Story = {
  args: { run: stateAfter(7), runId: "run-1", onCancel: () => {} },
};

export const Completed: Story = {
  args: { run: stateAfter(10), runId: "run-1" },
};

export const Failed: Story = {
  args: {
    run: {
      ...stateAfter(6),
      state: "failed",
      error: { name: "Error", message: "Storybook did not respond in time" },
      isStreaming: false,
    },
    runId: "run-1",
  },
};

export const Cancelled: Story = {
  args: {
    run: { ...stateAfter(7), state: "cancelled", isStreaming: false },
    runId: "run-1",
  },
};

export const StreamDropped: Story = {
  args: {
    run: {
      ...stateAfter(7),
      streamError: new Error("connection reset"),
      isStreaming: true,
    },
    runId: "run-1",
    onCancel: () => {},
  },
};

export const Empty: Story = {
  args: {
    run: { ...initialRunState, isStreaming: false },
    runId: "run-1",
  },
};
