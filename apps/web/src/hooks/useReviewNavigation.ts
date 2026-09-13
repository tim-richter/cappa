import { useRef } from "react";
import { useScreenshotSearch } from "@/api/hooks";
import { mergeReviewOrder } from "@/util/reviewOrder";

export interface ReviewNavigation {
  next?: string;
  prev?: string;
}

/**
 * Where the Next and Prev controls point from the screenshot currently open.
 *
 * The server sends `next`/`prev` with every screenshot, computed over the
 * whole list in the order it returns it. That order is by category, so it is
 * only correct until the first approval: approving the open screenshot
 * re-categorises it, the refetched links point into the approved block, and
 * Next walks the screenshots that were just approved instead of the ones still
 * waiting. The order the session started with is remembered here instead (see
 * `mergeReviewOrder`), and the links are read off that.
 *
 * The server's own links are the fallback, for an id the list does not cover
 * yet — the first render, before the list has arrived.
 */
export const useReviewNavigation = (
  id: string | undefined,
  serverNext?: string,
  serverPrev?: string,
): ReviewNavigation => {
  const { data } = useScreenshotSearch(null);
  const orderRef = useRef<string[]>([]);

  if (data) {
    // Idempotent given the same list, so a re-render cannot shuffle it.
    orderRef.current = mergeReviewOrder(
      orderRef.current,
      data.map((screenshot) => screenshot.id),
    );
  }

  const order = orderRef.current;
  const index = id === undefined ? -1 : order.indexOf(id);

  if (index === -1) {
    return { next: serverNext, prev: serverPrev };
  }

  return { next: order[index + 1], prev: order[index - 1] };
};
