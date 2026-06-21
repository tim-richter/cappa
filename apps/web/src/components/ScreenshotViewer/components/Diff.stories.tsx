import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockDiffMeta } from "@/mocks/diffMeta";
import { Diff } from "./Diff";

const meta = {
  title: "ScreenshotViewer/Diff",
  component: Diff,
} satisfies Meta<typeof Diff>;

export default meta;
type Story = StoryObj<typeof meta>;

const darkModeDecorator = (Story: React.ComponentType) => (
  <div className="dark min-h-screen bg-background p-4">
    <Story />
  </div>
);

const pageArgs = {
  screenshot: {
    id: "1",
    name: "Overlay",
    category: "changed" as const,
    expectedPath: "/1b.jpeg",
    actualPath: "/1a.jpeg",
    diffPath: "/1diff.png",
  },
};

const smallArgs = {
  screenshot: {
    id: "1",
    name: "Overlay",
    category: "changed" as const,
    expectedPath: "/4a.png",
    actualPath: "/4b.png",
    diffPath: "/4diff.png",
  },
};

const interpretedArgs = {
  screenshot: {
    ...pageArgs.screenshot,
    diffMeta: mockDiffMeta,
  },
};

export const Page: Story = {
  args: pageArgs,
};

/**
 * A changed screenshot without interpretation data (`diff.interpret` disabled or
 * an older capture). The view falls back to just the diff image — no severity
 * badge, summary banner or region overlays.
 */
export const WithoutInterpretation: Story = {
  args: pageArgs,
};

export const Interpreted: Story = {
  args: interpretedArgs,
};

export const InterpretedDark: Story = {
  args: interpretedArgs,
  decorators: [darkModeDecorator],
};

export const PageDark: Story = {
  args: pageArgs,
  decorators: [darkModeDecorator],
};

export const Small: Story = {
  args: smallArgs,
};

export const SmallDark: Story = {
  args: smallArgs,
  decorators: [darkModeDecorator],
};
