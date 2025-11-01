import type { Meta, StoryObj } from "@storybook/react-vite";
import { Overlay } from "./Overlay";

const meta = {
  title: "ScreenshotViewer/Overlay",
  component: Overlay,
} satisfies Meta<typeof Overlay>;

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
    },
  },
};
