import { describe, expect, it } from "vitest";
import { mergeReviewOrder } from "./reviewOrder";

describe("mergeReviewOrder", () => {
  it("takes the server's order when nothing is remembered yet", () => {
    expect(mergeReviewOrder([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  /**
   * The bug this exists for: approving a `changed` screenshot makes it
   * `passed`, and the server sorts by category — so the id the cursor is on
   * moves to the end of the list, and "Next" from it lands on whatever now
   * follows it among the approved screenshots rather than on the next one
   * waiting for review.
   */
  it("ignores a reorder of ids it already knows", () => {
    const order = mergeReviewOrder([], ["a", "b", "c"]);

    expect(mergeReviewOrder(order, ["b", "c", "a"])).toEqual(["a", "b", "c"]);
  });

  it("returns the same array when nothing moved", () => {
    const order = mergeReviewOrder([], ["a", "b"]);

    expect(mergeReviewOrder(order, ["b", "a"])).toBe(order);
  });

  it("drops an id the server no longer lists", () => {
    const order = mergeReviewOrder([], ["a", "b", "c"]);

    expect(mergeReviewOrder(order, ["a", "c"])).toEqual(["a", "c"]);
  });

  /**
   * A capture run finishing mid-review must not shuffle the screenshots the
   * cursor is walking, so its new ones go on the end.
   */
  it("appends ids it has not seen before", () => {
    const order = mergeReviewOrder([], ["b", "c"]);

    expect(mergeReviewOrder(order, ["a", "b", "c", "d"])).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("is idempotent", () => {
    const once = mergeReviewOrder(["a", "b"], ["b", "c", "a"]);

    expect(mergeReviewOrder(once, ["b", "c", "a"])).toBe(once);
  });
});
