import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  createInspectRegion,
  type InspectRegion,
  type InspectRegionField,
} from "../inspectRegions";
import { InspectableImage, InspectPanel, InspectProvider } from "./Inspect";

/**
 * The inspect panel over a screenshot: type the position and size a diff
 * report quoted, see the box on the image.
 */
function InspectHarness({
  initial,
  src = "/1a.jpeg",
}: {
  initial: InspectRegion[];
  src?: string;
}) {
  const [regions, setRegions] = useState(initial);

  return (
    <InspectProvider regions={regions}>
      <div className="flex h-[420px] items-center justify-center overflow-hidden rounded-lg bg-muted p-4">
        <InspectableImage
          src={src}
          alt="Screenshot"
          className="block max-h-full max-w-full object-contain"
        />
      </div>

      <InspectPanel
        regions={regions}
        onAdd={() =>
          setRegions((current) => [...current, createInspectRegion()])
        }
        onUpdate={(id: string, field: InspectRegionField, value: number) =>
          setRegions((current) =>
            current.map((region) =>
              region.id === id ? { ...region, [field]: value } : region,
            ),
          )
        }
        onRemove={(id: string) =>
          setRegions((current) => current.filter((region) => region.id !== id))
        }
        onClear={() => setRegions([])}
        onClose={() => {}}
      />
    </InspectProvider>
  );
}

const meta: Meta<typeof InspectHarness> = {
  title: "ScreenshotViewer/Inspect",
  component: InspectHarness,
};

export default meta;
type Story = StoryObj<typeof InspectHarness>;

export const Empty: Story = {
  args: { initial: [] },
};

export const WithRegions: Story = {
  args: {
    initial: [
      createInspectRegion({ x: 378, y: 488, width: 264, height: 340 }),
      createInspectRegion({ x: 120, y: 90, width: 200, height: 120 }),
    ],
  },
};

/** A report taken at a different viewport: the box does not fit the image. */
export const OutOfBounds: Story = {
  args: {
    src: "/4a.png",
    initial: [createInspectRegion({ x: 300, y: 40, width: 900, height: 400 })],
  },
};

export const Dark: Story = {
  args: WithRegions.args,
  decorators: [
    (Story: React.ComponentType) => (
      <div className="dark min-h-screen bg-background p-4">
        <Story />
      </div>
    ),
  ],
};
