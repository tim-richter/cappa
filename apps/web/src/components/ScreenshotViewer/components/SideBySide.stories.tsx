import type { Meta, StoryObj } from "@storybook/react-vite";
import { SideBySide } from "./SideBySide";

const meta = {
  title: "ScreenshotViewer/SideBySide",
  component: SideBySide,
} satisfies Meta<typeof SideBySide>;

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
