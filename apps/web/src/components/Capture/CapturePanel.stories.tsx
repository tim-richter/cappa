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
