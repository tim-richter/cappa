import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { Screenshot } from "@/pages/Screenshot";
import { server } from "../../test/setup";
import { renderPageWithRoute } from "../../test/utils";

describe("pixel ratio", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const svg = (width: number, height: number) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'></svg>`,
    )}`;

  const openChanged = (ratios: {
    expectedPixelRatio?: number;
    actualPixelRatio?: number;
  }) => {
    server.use(
      http.get("/api/screenshots/:id", () =>
        HttpResponse.json({
          id: "9",
          name: "scaled",
          category: "changed",
          expectedPath: svg(200, 100),
          actualPath: svg(400, 200),
          diffPath: svg(400, 200),
          ...ratios,
        }),
      ),
    );
    return renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/9",
      <Screenshot />,
    );
  };

  it("explains a baseline captured at another ratio", async () => {
    const screen = await openChanged({ actualPixelRatio: 2 });
    const notice = screen.getByRole("region", { name: "Pixel ratio changed" });

    await expect
      .element(
        notice.getByText("Baseline captured at 1×, this screenshot at 2×"),
      )
      .toBeVisible();
    await expect.element(screen.getByText("1× → 2×")).toBeVisible();
  });

  it("shows a 2× image at its CSS size, so both sides line up", async () => {
    const screen = await openChanged({ actualPixelRatio: 2 });
    const after = screen.getByRole("img", { name: "After" });

    await expect
      .poll(() => (after.element() as HTMLElement).style.width)
      .toBe("200px");
    expect(
      (screen.getByRole("img", { name: "Before" }).element() as HTMLElement)
        .style.width,
    ).toBe("");
  });

  it("shows no notice when the ratios agree", async () => {
    const screen = await openChanged({
      expectedPixelRatio: 2,
      actualPixelRatio: 2,
    });

    await expect.element(screen.getByText("2×", { exact: true })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Pixel ratio changed" }).query(),
    ).toBeNull();
  });
});
