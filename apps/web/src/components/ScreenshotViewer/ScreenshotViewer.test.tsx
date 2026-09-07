import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Screenshot } from "@/pages/Screenshot";
import { server } from "../../test/setup";
import { renderPageWithRoute } from "../../test/utils";

/**
 * Approving a single screenshot went through `PATCH /api/screenshots/:id`,
 * which no msw handler ever mocked — so this path had no coverage at all, and
 * a request that fell through to the real network passed silently. It is now
 * `approve-batch` with one name, which the handlers do cover.
 */
const readOnlyServer = () =>
  server.use(
    http.get("/api/config", () =>
      HttpResponse.json({ theme: "light", readOnly: true }),
    ),
  );

describe("approving one screenshot", () => {
  const openDetail = () =>
    renderPageWithRoute("/screenshots/:id", "/screenshots/1", <Screenshot />);

  it("posts the screenshot's name to approve-batch", async () => {
    let body: unknown;
    server.use(
      http.post("/api/screenshots/approve-batch", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ approved: ["1"], errors: [] });
      }),
    );

    const screen = await openDetail();
    await userEvent.click(
      await screen.getByRole("button", { name: /approve/i }),
    );

    // The name, not the id: the engine approves by name.
    await expect.poll(() => body).toEqual({ names: ["1"] });
  });

  it("approves on the A key too", async () => {
    let calls = 0;
    server.use(
      http.post("/api/screenshots/approve-batch", () => {
        calls += 1;
        return HttpResponse.json({ approved: ["1"], errors: [] });
      }),
    );

    await openDetail();
    // Wait for the screenshot to load before the shortcut can fire.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await userEvent.keyboard("a");

    await expect.poll(() => calls).toBeGreaterThan(0);
  });
});

describe("read-only mode withholds approval", () => {
  const openDetail = () =>
    renderPageWithRoute("/screenshots/:id", "/screenshots/1", <Screenshot />);

  it("hides the approve button", async () => {
    readOnlyServer();

    const screen = await openDetail();
    // Wait for the screenshot itself to render before asserting an absence.
    await expect.element(screen.getByRole("img").first()).toBeVisible();

    expect(
      await screen.getByRole("button", { name: /approve/i }).elements(),
    ).toHaveLength(0);
  });

  it("ignores the A shortcut", async () => {
    readOnlyServer();
    let calls = 0;
    server.use(
      http.post("/api/screenshots/approve-batch", () => {
        calls += 1;
        return HttpResponse.json({ approved: [], errors: [] });
      }),
    );

    const screen = await openDetail();
    await expect.element(screen.getByRole("img").first()).toBeVisible();
    await userEvent.keyboard("a");
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(calls).toBe(0);
  });
});
