import { beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  InspectableImage,
  InspectPanel,
  InspectProvider,
  useInspectRegionState,
} from "./Inspect";

/** A 200×100 image, so a region's percentages are easy to reason about. */
const IMAGE_SRC = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100'></svg>",
)}`;

function Harness() {
  const {
    regions,
    addRegion,
    updateRegion,
    removeRegion,
    clearRegions,
    setOpen,
  } = useInspectRegionState();

  return (
    <InspectProvider regions={regions}>
      <InspectableImage src={IMAGE_SRC} alt="Diff" />
      <InspectPanel
        regions={regions}
        onAdd={addRegion}
        onUpdate={updateRegion}
        onRemove={removeRegion}
        onClear={clearRegions}
        onClose={() => setOpen(false)}
      />
    </InspectProvider>
  );
}

type Screen = Awaited<ReturnType<typeof render>>;

const regionBoxes = (screen: Screen) =>
  screen.getByTestId("inspect-region").elements();

describe("Inspect", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("draws nothing until a region is added", async () => {
    const screen = await render(<Harness />);

    await expect.element(screen.getByText("Add region")).toBeVisible();
    expect(await regionBoxes(screen)).toHaveLength(0);
  });

  it("draws a typed region over the image at its pixel position", async () => {
    const screen = await render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Add region" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "x" }), "50");
    await userEvent.fill(screen.getByRole("textbox", { name: "y" }), "25");
    await userEvent.fill(screen.getByRole("textbox", { name: "w" }), "100");
    await userEvent.fill(screen.getByRole("textbox", { name: "h" }), "50");

    await expect
      .poll(async () => {
        const [box] = await regionBoxes(screen);
        return box instanceof HTMLElement ? box.style.left : undefined;
      })
      .toBe("25%");

    const [box] = await regionBoxes(screen);
    expect(box).toBeInstanceOf(HTMLElement);
    expect((box as HTMLElement).style).toMatchObject({
      left: "25%",
      top: "25%",
      width: "50%",
      height: "50%",
    });
  });

  it("reports the image size and flags a region that does not fit it", async () => {
    const screen = await render(<Harness />);

    // A report taken at another viewport or scale factor is the usual reason a
    // box overflows, and it is worth saying so rather than drawing off-image.
    await expect.element(screen.getByText("image 200×100")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Add region" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "w" }), "400");

    await expect
      .element(screen.getByText(/Outside the image \(200×100\)/))
      .toBeVisible();
    await expect
      .poll(async () => {
        const [box] = await regionBoxes(screen);
        return (box as HTMLElement | undefined)?.dataset.outside;
      })
      .toBe("true");
  });

  it("removes a region", async () => {
    const screen = await render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Add region" }));
    await expect.poll(async () => (await regionBoxes(screen)).length).toBe(1);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove region 1" }),
    );
    await expect.poll(async () => (await regionBoxes(screen)).length).toBe(0);
  });

  it("keeps regions across mounts", async () => {
    const first = await render(<Harness />);
    await userEvent.click(first.getByRole("button", { name: "Add region" }));
    await userEvent.fill(first.getByRole("textbox", { name: "x" }), "42");
    await expect.poll(async () => (await regionBoxes(first)).length).toBe(1);
    first.unmount();

    // Walking to the next screenshot to look for the same box should not mean
    // typing the coordinates in again.
    const second = await render(<Harness />);
    await expect
      .element(second.getByRole("textbox", { name: "x" }))
      .toHaveValue("42");
  });
});
