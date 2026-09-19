import { delay, HttpResponse, http } from "msw";
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

  /** The same page with the toast host `Layout` mounts in the app. */
  const openDetailWithToaster = () =>
    renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/1",
      <Screenshot />,
      undefined,
      { withToaster: true },
    );

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

  it("confirms the approval", async () => {
    const screen = await openDetailWithToaster();
    await userEvent.click(
      await screen.getByRole("button", { name: /approve/i }),
    );

    await expect.element(screen.getByText("Approved 1")).toBeVisible();
  });

  /**
   * Regression: the single-approve mutation returned without checking the
   * response and had no `onError`, so a 403 from a read-only server or a 500
   * from a broken store looked exactly like success — no badge, no toast, no
   * hint that the click had done nothing.
   */
  it("reports a failed request and stays unapproved", async () => {
    server.use(
      http.post("/api/screenshots/approve-batch", () =>
        HttpResponse.json(
          { error: "Screenshot store is gone" },
          { status: 500 },
        ),
      ),
    );

    const screen = await openDetailWithToaster();
    await userEvent.click(
      await screen.getByRole("button", { name: /approve/i }),
    );

    await expect
      .element(screen.getByText("Screenshot store is gone"))
      .toBeVisible();
    // Still offering approval, because nothing was approved.
    await expect
      .element(screen.getByRole("button", { name: /approve/i }))
      .toBeVisible();
  });

  it("reports a name the engine refused", async () => {
    server.use(
      http.post("/api/screenshots/approve-batch", () =>
        HttpResponse.json({
          approved: [],
          errors: [{ name: "1", error: "no actual screenshot" }],
        }),
      ),
    );

    const screen = await openDetailWithToaster();
    await userEvent.click(
      await screen.getByRole("button", { name: /approve/i }),
    );

    await expect
      .element(screen.getByText("Failed to approve 1: no actual screenshot"))
      .toBeVisible();
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

  /**
   * Regression: `canApprove` was `!config?.readOnly`, which reads as "allowed"
   * while `/api/config` is still in flight. On a read-only server that put a
   * live approve button and a live `a` shortcut on screen for the duration of
   * that request — offering exactly what the server answers with a 403. The
   * delay makes the window wide enough to observe deterministically; without
   * it this only failed on a loaded CI machine.
   */
  it("does not offer approval while the server is still answering", async () => {
    server.use(
      http.get("/api/config", async () => {
        await delay(300);
        return HttpResponse.json({ theme: "light", readOnly: true });
      }),
    );

    const screen = await openDetail();
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

/**
 * The server computes `next`/`prev` over the whole list in the order it
 * returns it, and that order is by category — so approving the open screenshot
 * moves it, and the links that come back with the next response point
 * somewhere else entirely.
 */
describe("navigation order survives an approval", () => {
  const changed = (id: string) => ({
    id,
    name: id,
    category: "changed" as const,
    actualPath: "/images/4a.png",
    expectedPath: "/images/4b.png",
    diffPath: "/images/4diff.png",
  });

  const passed = (id: string) => ({
    id,
    name: id,
    category: "passed" as const,
    actualPath: "/images/4a.png",
    expectedPath: "/images/4b.png",
  });

  it("keeps pointing at the screenshot that was next before", async () => {
    let approved = false;

    server.use(
      http.get("/api/screenshots", ({ request }) => {
        if (new URL(request.url).searchParams.get("category")) {
          return HttpResponse.json([]);
        }

        // Approving "3" makes it `passed`, which the server sorts last.
        return HttpResponse.json(
          approved
            ? [changed("6"), passed("4"), passed("3")]
            : [changed("3"), changed("6"), passed("4")],
        );
      }),
      http.get("/api/screenshots/3", () =>
        HttpResponse.json(
          approved
            ? { ...passed("3"), approved: true, next: undefined, prev: "4" }
            : { ...changed("3"), next: "6", prev: undefined },
        ),
      ),
      http.post("/api/screenshots/approve-batch", () => {
        approved = true;
        return HttpResponse.json({ approved: ["3"], errors: [] });
      }),
    );

    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/3",
      <Screenshot />,
    );

    const next = screen.getByRole("link", { name: /next/i });
    await expect.element(next).toHaveAttribute("href", "/screenshots/6");

    await userEvent.click(
      await screen.getByRole("button", { name: /approve/i }),
    );

    // Wait for the re-categorised screenshot to actually be on screen: the
    // approve control goes away once the refetch reports it approved.
    await expect.poll(() => approved).toBe(true);
    await expect
      .poll(
        async () =>
          (await screen.getByRole("button", { name: /approve/i }).elements())
            .length,
      )
      .toBe(0);

    // Next still walks on to the screenshot that has not been reviewed yet.
    await expect.element(next).toHaveAttribute("href", "/screenshots/6");
  });
});

/**
 * Approving a `deleted` screenshot accepts the deletion, so the screenshot
 * itself stops existing. The open page went on asking for it and settled on
 * "Error fetching screenshot" — after a successful approval, at the exact
 * moment the user was told it worked.
 */
describe("approving a deleted screenshot", () => {
  it("moves on to the next screenshot instead of 404ing on its own URL", async () => {
    let approved = false;

    server.use(
      http.get("/api/screenshots", ({ request }) => {
        if (new URL(request.url).searchParams.get("category")) {
          return HttpResponse.json([]);
        }

        return HttpResponse.json(
          approved
            ? [
                {
                  id: "3",
                  name: "3",
                  category: "changed",
                  actualPath: "/images/4a.png",
                  expectedPath: "/images/4b.png",
                  diffPath: "/images/4diff.png",
                },
              ]
            : [
                {
                  id: "2",
                  name: "2",
                  category: "deleted",
                  expectedPath: "/images/4b.png",
                },
                {
                  id: "3",
                  name: "3",
                  category: "changed",
                  actualPath: "/images/4a.png",
                  expectedPath: "/images/4b.png",
                  diffPath: "/images/4diff.png",
                },
              ],
        );
      }),
      http.get("/api/screenshots/2", () =>
        approved
          ? HttpResponse.json(
              { error: "Screenshot not found" },
              { status: 404 },
            )
          : HttpResponse.json({
              id: "2",
              name: "2",
              category: "deleted",
              expectedPath: "/images/4b.png",
              next: "3",
              prev: undefined,
            }),
      ),
      http.post("/api/screenshots/approve-batch", () => {
        approved = true;
        return HttpResponse.json({ approved: ["2"], errors: [] });
      }),
    );

    const screen = await renderPageWithRoute(
      "/screenshots/:id",
      "/screenshots/2",
      <Screenshot />,
    );

    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("2");

    await userEvent.click(
      await screen.getByRole("button", { name: /approve/i }),
    );

    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("3");
    expect(await screen.getByText(/error fetching/i).elements()).toHaveLength(
      0,
    );
  });
});
