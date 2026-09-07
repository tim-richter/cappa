import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/setup";
import { renderPage } from "@/test/utils";
import { Layout } from "./Layout";

/**
 * A rejected access token used to render as an empty app: ten seconds of
 * retries, then "Error fetching screenshots" in the list and a blank sidebar
 * total — none of which says what is actually wrong or how to fix it.
 *
 * The version-mismatch half of this lives in its own file: that failure is
 * cached for the lifetime of the client (it cannot resolve itself, unlike a
 * token that may arrive on the next load) and `client` is a module singleton,
 * so it would leak into every test that followed it.
 */
describe("Layout when the server refuses the client", () => {
  it("renders the app when the server answers", async () => {
    const screen = await renderPage(<Layout />, { route: "/" });

    await expect
      .poll(async () => (await screen.getByRole("alert").elements()).length)
      .toBe(0);
  });

  it("explains a rejected access token", async () => {
    server.use(
      http.get("/api/health", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
      http.get("/api/config", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    );

    const screen = await renderPage(<Layout />, { route: "/" });

    await expect
      .element(screen.getByText("Access token required"))
      .toBeVisible();
  });

  it("says how to recover, not just that something failed", async () => {
    server.use(
      http.get("/api/health", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
      http.get("/api/config", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    );

    const screen = await renderPage(<Layout />, { route: "/" });

    await expect
      .element(screen.getByText(/full/i, { exact: false }))
      .toBeVisible();
  });
});
