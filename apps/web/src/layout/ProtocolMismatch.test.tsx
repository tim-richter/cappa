import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/setup";
import { renderPage } from "@/test/utils";
import { Layout } from "./Layout";

/**
 * Its own file on purpose.
 *
 * A version mismatch is the one handshake failure the client caches — it cannot
 * resolve itself, so retrying is pointless — and `client` is a module-level
 * singleton. Any test sharing this file would inherit the poisoned handshake,
 * which is correct behaviour and useless as a test fixture.
 */
describe("Layout against a server on another protocol version", () => {
  it("says which side is out of date", async () => {
    server.use(
      http.get("/api/health", () =>
        HttpResponse.json({
          ok: true,
          protocolVersion: 999,
          capabilities: { capture: true, approve: true, events: true },
        }),
      ),
    );

    const screen = await renderPage(<Layout />, { route: "/" });

    await expect.element(screen.getByText("Version mismatch")).toBeVisible();
    await expect.element(screen.getByText(/999/)).toBeVisible();
  });
});
