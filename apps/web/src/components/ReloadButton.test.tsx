import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { useScreenshotsByCategory } from "@/api/hooks";
import { server } from "@/test/setup";
import { renderWithProviders } from "@/test/utils";
import { ReloadButton } from "./ReloadButton";

const ChangedCount = () => {
  const { data } = useScreenshotsByCategory("changed");
  return <p>{data === undefined ? "loading" : `${data.length} changed`}</p>;
};

/**
 * A screenshot re-captured from the UI used to sit in "changed" until
 * `cappa review` was restarted. The server answers from disk every time, so a
 * reload only has to throw the cached lists away.
 */
describe("ReloadButton", () => {
  it("re-fetches the screenshot lists", async () => {
    let changed = [
      {
        id: "1",
        name: "button",
        category: "changed",
        actualPath: "/a.png",
        expectedPath: "/e.png",
        diffPath: "/d.png",
      },
    ];
    server.use(http.get("/api/screenshots", () => HttpResponse.json(changed)));

    const screen = await renderWithProviders(
      <>
        <ReloadButton />
        <ChangedCount />
      </>,
    );

    await expect.element(screen.getByText("1 changed")).toBeInTheDocument();

    // The re-capture passed: the server would now report nothing changed.
    changed = [];
    await screen.getByRole("button", { name: "Reload screenshots" }).click();

    await expect.element(screen.getByText("0 changed")).toBeInTheDocument();
  });
});
