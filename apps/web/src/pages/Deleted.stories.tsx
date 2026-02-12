import type { Meta, StoryObj } from "@storybook/react-vite";
import { RouterProvider } from "react-router";
import { createPageRouter } from "@/routes";

const meta = {
  title: "Pages/Deleted",
  parameters: {
    layout: "fullscreen",
    useRouterProvider: true,
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PageStory = ({ path }: { path: string }) => (
  <RouterProvider router={createPageRouter(path)} />
);

const darkModeDecorator = (Story: React.ComponentType) => (
  <div className="dark min-h-screen bg-background">
    <Story />
  </div>
);

export const Default: Story = {
  render: () => <PageStory path="/deleted" />,
};

export const Dark: Story = {
  render: () => <PageStory path="/deleted" />,
  decorators: [darkModeDecorator],
};
