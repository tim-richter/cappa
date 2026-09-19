import { CappaHttpError } from "@cappa/client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./EmptyState";
import { ErrorState, LoadingState } from "./QueryState";

const meta = {
  title: "States/QueryState",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const darkModeDecorator = (Story: React.ComponentType) => (
  <div className="dark min-h-screen bg-background p-4">
    <Story />
  </div>
);

const States = () => (
  <div className="flex flex-col gap-6 p-4">
    <LoadingState label="Loading screenshots" />

    <ErrorState
      title="Couldn't load screenshots"
      error={new CappaHttpError("Screenshot store is gone", 500)}
      onRetry={() => {}}
    />

    <ErrorState
      title="Couldn't load screenshots"
      error={new Error("Failed to fetch")}
      onRetry={() => {}}
    />

    <EmptyState category="changed" />
    <EmptyState category="new" />
  </div>
);

export const Default: Story = {
  render: () => <States />,
};

export const Dark: Story = {
  render: () => <States />,
  decorators: [darkModeDecorator],
};
