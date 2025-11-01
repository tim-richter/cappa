import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScreenshotComparison } from "./ScreenshotViewer";

const meta = {
  title: "ScreenshotViewer",
  component: ScreenshotComparison,
} satisfies Meta<typeof ScreenshotComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Passed: Story = {
  args: {
    screenshot: {
      id: "1",
      name: "Overlay",
      category: "passed",
      expectedPath: "/1b.jpeg",
      actualPath: "/1a.jpeg",
      diffPath: "/1diff.png",
      next: "/2a.jpeg",
      prev: "/1a.jpeg",
    },
    onBack: () => {},
  },
};

export const Changed: Story = {
  args: {
    screenshot: {
      id: "1",
      name: "Overlay",
      category: "changed",
      expectedPath: "/1b.jpeg",
      actualPath: "/1a.jpeg",
      diffPath: "/1diff.png",
      next: "/5a.png",
      prev: "/4a.png",
    },
    onBack: () => {},
  },
};

export const Deleted: Story = {
  args: {
    screenshot: {
      id: "1",
      name: "Overlay",
      category: "deleted",
      expectedPath: "/1b.jpeg",
      actualPath: "/1a.jpeg",
      diffPath: "/1diff.png",
      next: "/5a.png",
      prev: "/4a.png",
    },
    onBack: () => {},
  },
};

export const New: Story = {
  args: {
    screenshot: {
      id: "1",
      name: "Overlay",
      category: "new",
      actualPath: "/1a.jpeg",
      expectedPath: undefined,
      diffPath: undefined,
      next: "/5a.png",
      prev: "/4a.png",
    },
    onBack: () => {},
  },
};
