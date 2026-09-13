/**
 * Fold the server's screenshot order into the one the review session is
 * already walking.
 *
 * The server orders screenshots by category, so approving one moves it:
 * a `changed` screenshot becomes `passed` and jumps to the end of the list,
 * taking the `next`/`prev` links computed from that list with it. Reading the
 * order back from every response is therefore how "approve, then Next" stops
 * walking the screenshots still waiting for review and starts walking the ones
 * just approved.
 *
 * So an id that has already been seen keeps its position for as long as the
 * review session lasts. Only two things change it: an id the server no longer
 * lists drops out (an approved `deleted` screenshot, whose baseline is gone),
 * and an id it has not listed before is appended in the order it arrived —
 * a capture run finishing mid-review adds its screenshots at the end rather
 * than shuffling the ones under the cursor.
 *
 * Returns `previous` unchanged when nothing moved, so a refetch that changed
 * only categories does not invalidate anything downstream.
 */
export const mergeReviewOrder = (
  previous: string[],
  incoming: string[],
): string[] => {
  const listed = new Set(incoming);
  const kept = previous.filter((id) => listed.has(id));

  const known = new Set(kept);
  const added = incoming.filter((id) => !known.has(id));

  if (added.length === 0 && kept.length === previous.length) {
    return previous;
  }

  return [...kept, ...added];
};
