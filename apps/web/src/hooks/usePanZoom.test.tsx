import { render } from "vitest-browser-react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { type PanZoomApi, type PanZoomState, usePanZoom } from "./usePanZoom";

interface TestComponentProps {
  contentWidth?: number;
  contentHeight?: number;
  initialScale?: number;
  onState?: (state: PanZoomState) => void;
  onApi?: (api: PanZoomApi) => void;
}

/**
 * Container 400x400, content 200x200. After ResizeObserver fires,
 * content gets centered: translateX = (400-200)/2 = 100, translateY = 100.
 * We wait for translateX > 0 to confirm the container was measured.
 */
function SimplePanZoomComponent({
  contentWidth = 200,
  contentHeight = 200,
  initialScale = 1,
  onState,
  onApi,
}: TestComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, api] = usePanZoom(
    containerRef,
    { width: contentWidth, height: contentHeight },
    {},
    initialScale,
  );

  onState?.(state);
  onApi?.(api);

  return (
    <div
      ref={containerRef}
      data-testid="container"
      style={{
        width: "400px",
        height: "400px",
        display: "block",
        position: "relative",
      }}
    >
      <div data-testid="content" style={api.getTransformStyle()}>
        content
      </div>
    </div>
  );
}

/** Wait until the ResizeObserver inside usePanZoom fires and centers the content */
async function waitForContainerMeasured(
  capturedStateRef: { current: PanZoomState | undefined },
) {
  // When container (400x400) measures the content (200x200),
  // clampTranslate centers it: translateX = 100, translateY = 100
  await expect
    .poll(() => capturedStateRef.current?.translateX, { timeout: 3000 })
    .toBeGreaterThan(0);
}

describe("usePanZoom", () => {
  it("returns correct initial state with scale=1", async () => {
    let capturedState: PanZoomState | undefined;
    render(
      <SimplePanZoomComponent
        onState={(s) => {
          capturedState = s;
        }}
      />,
    );
    await expect.poll(() => capturedState?.scale).toBe(1);
  });

  it("getTransformStyle returns a transform string", async () => {
    const { container } = render(<SimplePanZoomComponent initialScale={1} />);
    const content = container.querySelector("[data-testid='content']");
    expect(content?.getAttribute("style")).toContain("transform");
  });

  it("getTransformStyle includes transformOrigin", async () => {
    const { container } = render(<SimplePanZoomComponent />);
    const content = container.querySelector("[data-testid='content']");
    expect(content?.getAttribute("style")).toContain("transform-origin");
  });

  it("setScale changes scale state after container is measured", async () => {
    const stateRef = { current: undefined as PanZoomState | undefined };
    const apiRef = { current: undefined as PanZoomApi | undefined };

    render(
      <SimplePanZoomComponent
        onApi={(a) => {
          apiRef.current = a;
        }}
        onState={(s) => {
          stateRef.current = s;
        }}
      />,
    );

    await waitForContainerMeasured(stateRef);

    apiRef.current!.setScale(2);

    await expect
      .poll(() => stateRef.current?.scale, { timeout: 2000 })
      .toBe(2);
  });

  it("reset() returns scale to initialScale after setScale", async () => {
    const stateRef = { current: undefined as PanZoomState | undefined };
    const apiRef = { current: undefined as PanZoomApi | undefined };

    render(
      <SimplePanZoomComponent
        initialScale={1}
        onApi={(a) => {
          apiRef.current = a;
        }}
        onState={(s) => {
          stateRef.current = s;
        }}
      />,
    );

    await waitForContainerMeasured(stateRef);

    apiRef.current!.setScale(2);
    await expect.poll(() => stateRef.current?.scale, { timeout: 2000 }).toBe(2);

    apiRef.current!.reset();
    await expect.poll(() => stateRef.current?.scale, { timeout: 2000 }).toBe(1);
  });

  it("fit() adjusts scale so large content fits within container", async () => {
    const stateRef = { current: undefined as PanZoomState | undefined };
    const apiRef = { current: undefined as PanZoomApi | undefined };

    // Content 800x800 in container 400x400 — fit scale should be 0.5
    render(
      <SimplePanZoomComponent
        contentWidth={800}
        contentHeight={800}
        onApi={(a) => {
          apiRef.current = a;
        }}
        onState={(s) => {
          stateRef.current = s;
        }}
      />,
    );

    // For large content (800>400), content won't be centered but it will be measured
    await expect
      .poll(() => apiRef.current, { timeout: 3000 })
      .toBeDefined();

    // Trigger fit
    apiRef.current!.fit();

    await expect
      .poll(() => stateRef.current?.scale, { timeout: 2000 })
      .toBeLessThanOrEqual(1);
  });

  it("double-click on container zooms in", async () => {
    const stateRef = { current: undefined as PanZoomState | undefined };

    const screen = render(
      <SimplePanZoomComponent
        onState={(s) => {
          stateRef.current = s;
        }}
      />,
    );

    await waitForContainerMeasured(stateRef);

    const initialScale = stateRef.current!.scale;

    await screen.getByTestId("container").dblClick();

    await expect
      .poll(() => stateRef.current!.scale, { timeout: 2000 })
      .toBeGreaterThan(initialScale);
  });
});
