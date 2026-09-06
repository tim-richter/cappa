import { describe, expect, it } from "vitest";
import { client } from "./client";

/**
 * Every field the review UI renders has to survive `@cappa/client`'s zod parse.
 *
 * This is the one failure mode the migration to the client introduces: zod
 * strips keys the schema does not describe, so a field the server sends and a
 * page reads disappears silently — no error, no type error, just a feature that
 * quietly stops working. It happened once already, to `next`/`prev`, and was
 * caught by luck rather than by a test.
 *
 * These run the real client against the msw handlers, so a field dropped from
 * the protocol fails here rather than in someone's browser.
 */

/** Read by `List`, `Grid` and `CategoryBadge` on every list page. */
const LIST_FIELDS = ["id", "name", "category"] as const;

describe("fields the list pages render survive the parse", () => {
  it("keeps the identity fields on every screenshot", async () => {
    const screenshots = await client.listScreenshots();

    expect(screenshots.length).toBeGreaterThan(0);
    for (const screenshot of screenshots) {
      for (const field of LIST_FIELDS) {
        expect(screenshot[field], `${field} on ${screenshot.id}`).toBeDefined();
      }
    }
  });

  it("keeps the image path each category previews with", async () => {
    // `findPreviewScreenshot` picks a different path per category; a stripped
    // one renders a broken image rather than throwing.
    const byCategory = async (category: "new" | "deleted" | "changed") =>
      (await client.listScreenshots({ category }))[0];

    expect(await byCategory("new")).toHaveProperty("actualPath");
    expect(await byCategory("deleted")).toHaveProperty("expectedPath");
    expect(await byCategory("changed")).toHaveProperty("diffPath");
  });
});

describe("fields the detail page renders survive the parse", () => {
  it("keeps next and prev, which drive arrow-key navigation", async () => {
    const screenshot = await client.getScreenshot("1");

    expect(screenshot).toMatchObject({ next: "2", prev: "5" });
  });

  it("keeps the diff metadata and its opaque interpretation", async () => {
    // `interpretation` is `unknown` in the protocol on purpose — its shape
    // belongs to the diff engine — but it must still arrive, or the region
    // overlay silently renders nothing.
    const screenshot = await client.getScreenshot("3");

    expect(screenshot).toMatchObject({ category: "changed" });
    expect(screenshot).toHaveProperty("diffMeta.numDiffPixels");
    expect(screenshot).toHaveProperty("diffMeta.interpretation.regions");
  });
});
