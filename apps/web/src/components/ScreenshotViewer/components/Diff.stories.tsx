import type { Meta, StoryObj } from "@storybook/react-vite";
import { Diff } from "./Diff";

const meta = {
  title: "ScreenshotViewer/Diff",
  component: Diff,
} satisfies Meta<typeof Diff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {
  args: {
    screenshot: {
      id: "1",
      name: "Overlay",
      category: "passed",
      expectedPath: "/1b.jpeg",
      actualPath: "/1a.jpeg",
      diffPath: "/1diff.png",
    },
  },
};

export const Small: Story = {
  args: {
    screenshot: {
      id: "1",
      name: "Overlay",
      category: "passed",
      expectedPath: "/4a.png",
      actualPath: "/4b.png",
      diffPath: "/4diff.png",
    },
  },
};
