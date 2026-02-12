import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScreenshotComparison } from "./ScreenshotViewer";

const meta = {
  title: "ScreenshotViewer",
  component: ScreenshotComparison,
} satisfies Meta<typeof ScreenshotComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

const darkModeDecorator = (Story: React.ComponentType) => (
  <div className="dark min-h-screen bg-background">
    <Story />
  </div>
);

const passedArgs = {
  screenshot: {
    id: "1",
    name: "Overlay",
    category: "passed" as const,
    expectedPath: "/1b.jpeg",
    actualPath: "/1a.jpeg",
    diffPath: "/1diff.png",
    next: "/2a.jpeg",
    prev: "/1a.jpeg",
  },
  onBack: () => {},
};

const changedArgs = {
  screenshot: {
    id: "1",
    name: "Overlay",
    category: "changed" as const,
    expectedPath: "/1b.jpeg",
    actualPath: "/1a.jpeg",
    diffPath: "/1diff.png",
    next: "/5a.png",
    prev: "/4a.png",
  },
  onBack: () => {},
};

const deletedArgs = {
  screenshot: {
    id: "1",
    name: "Overlay",
    category: "deleted" as const,
    expectedPath: "/1b.jpeg",
    actualPath: "/1a.jpeg",
    diffPath: "/1diff.png",
    next: "/5a.png",
    prev: "/4a.png",
  },
  onBack: () => {},
};

const newArgs = {
  screenshot: {
    id: "1",
    name: "Overlay",
    category: "new" as const,
    actualPath: "/1a.jpeg",
    expectedPath: undefined,
    diffPath: undefined,
    next: "/5a.png",
    prev: "/4a.png",
  },
  onBack: () => {},
};

export const Passed: Story = {
  args: passedArgs,
};

export const PassedDark: Story = {
  args: passedArgs,
  decorators: [darkModeDecorator],
};

export const Changed: Story = {
  args: changedArgs,
};

export const ChangedDark: Story = {
  args: changedArgs,
  decorators: [darkModeDecorator],
};

export const Deleted: Story = {
  args: deletedArgs,
};

export const DeletedDark: Story = {
  args: deletedArgs,
  decorators: [darkModeDecorator],
};

export const New: Story = {
  args: newArgs,
};

export const NewDark: Story = {
  args: newArgs,
  decorators: [darkModeDecorator],
};
