import type { Meta, StoryObj } from "@storybook/react-vite";
import { Overlay } from "./Overlay";

const meta = {
  title: "ScreenshotViewer/Overlay",
  component: Overlay,
} satisfies Meta<typeof Overlay>;

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
    category: "passed" as const,
    expectedPath: "/1b.jpeg",
    actualPath: "/1a.jpeg",
  },
};

const smallArgs = {
  screenshot: {
    id: "1",
    name: "Overlay",
    category: "passed" as const,
    expectedPath: "/4a.png",
    actualPath: "/4b.png",
  },
};

export const Page: Story = {
  args: pageArgs,
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
