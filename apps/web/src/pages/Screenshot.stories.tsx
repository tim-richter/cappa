import type { Meta, StoryObj } from "@storybook/react-vite";
import { RouterProvider } from "react-router";
import { createPageRouter } from "@/routes";

const meta = {
  title: "Pages/Screenshot",
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

export const Changed: Story = {
  render: () => <PageStory path="/screenshots/3" />,
};

export const ChangedDark: Story = {
  render: () => <PageStory path="/screenshots/3" />,
  decorators: [darkModeDecorator],
};

export const New: Story = {
  render: () => <PageStory path="/screenshots/1" />,
};

export const NewDark: Story = {
  render: () => <PageStory path="/screenshots/1" />,
  decorators: [darkModeDecorator],
};

export const Deleted: Story = {
  render: () => <PageStory path="/screenshots/2" />,
};

export const DeletedDark: Story = {
  render: () => <PageStory path="/screenshots/2" />,
  decorators: [darkModeDecorator],
};

export const Passed: Story = {
  render: () => <PageStory path="/screenshots/4" />,
};

export const PassedDark: Story = {
  render: () => <PageStory path="/screenshots/4" />,
  decorators: [darkModeDecorator],
};
