import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockPlugins, mockTargets } from "@/mocks/capture";
import { CapturePanel } from "./CapturePanel";

const meta = {
  title: "Capture/CapturePanel",
  component: CapturePanel,
  parameters: { layout: "padded" },
  args: {
    targets: mockTargets,
    plugins: mockPlugins,
    onStart: () => {},
    onRefreshTargets: () => {},
  },
} satisfies Meta<typeof CapturePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SinglePlugin: Story = {
  args: { plugins: [mockPlugins[0]] },
};

export const Discovering: Story = {
  args: { targets: [], isDiscovering: true },
};

export const NothingDiscovered: Story = {
  args: { targets: [] },
};

export const RunInProgress: Story = {
  args: { isRunActive: true },
};

export const ManyTargets: Story = {
  args: {
    targets: Array.from({ length: 40 }, (_, index) => ({
      id: `component--variant-${index + 1}`,
      url: `http://localhost:6006/?id=${index}`,
      plugin: index % 3 === 0 ? "docs" : "demo",
    })),
  },
};

export const WatchAvailable: Story = {
  args: {
    watch: { supported: true, active: false, onToggle: () => {} },
  },
};

export const Watching: Story = {
  args: {
    watch: { supported: true, active: true, onToggle: () => {} },
  },
};

export const WatchingAfterAChange: Story = {
  args: {
    watch: {
      supported: true,
      active: true,
      onToggle: () => {},
      lastChange: {
        files: ["src/components/Button.stories.tsx"],
        scope: "tasks",
        taskIds: ["Screenshot 1", "Screenshot 2"],
        runId: "run-1",
        at: 0,
      },
    },
  },
};

export const WatchCouldNotStartARun: Story = {
  args: {
    watch: {
      supported: true,
      active: true,
      onToggle: () => {},
      lastChange: {
        files: ["src/components/Button.tsx"],
        scope: "plugins",
        error: "A capture run is already in progress (run-9)",
        at: 0,
      },
    },
  },
};
