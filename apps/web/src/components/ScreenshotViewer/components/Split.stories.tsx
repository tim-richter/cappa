import type { Meta, StoryObj } from "@storybook/react-vite";
import { Split } from "./Split";

const meta = {
  title: "ScreenshotViewer/Split",
  component: Split,
} satisfies Meta<typeof Split>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {
  args: {
    screenshot: {
      id: "1",
      name: "SideBySide",
      category: "passed",
      expectedPath: "/1b.jpeg",
      actualPath: "/1a.jpeg",
    },
  },
};

export const Small: Story = {
  args: {
    screenshot: {
      id: "1",
      name: "SideBySide",
      category: "passed",
      expectedPath: "/4a.png",
      actualPath: "/4b.png",
    },
  },
};
