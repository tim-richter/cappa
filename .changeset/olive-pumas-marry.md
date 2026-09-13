---
"@cappa/server": patch
---

Fix review-UI navigation breaking on the approval it is meant to follow

Two things went wrong the moment you approved a screenshot from its detail page.

**Next and Prev jumped to the approved screenshots.** The server computes `next`/`prev`
over the whole list in the order it returns it, and that order is by category. Approving
the open screenshot re-categorises it — a `changed` screenshot becomes `passed` and sorts
last — so the links that came back with the next response pointed into the block of
already-approved screenshots. Working through a review by alternating **Approve** and
**Next** walked the screenshots that had just been approved instead of the ones still
waiting. The order is now fixed when the review opens and does not move under the cursor:
an id keeps its place for as long as the session lasts, ids the server stops listing drop
out, and a capture run finishing mid-review adds its screenshots at the end.

**Approving a deleted screenshot left an error on screen.** Approving a `deleted`
screenshot accepts the deletion, so its baseline is unlinked and the screenshot stops
existing — but the page stayed on its URL and went on asking the server for it, settling
on "Error fetching screenshot" right after a successful approval. It now moves on to the
next screenshot instead, replacing the history entry so Back does not return to a URL that
can only 404.

Approving from the detail page also invalidates the screenshot lists and their counts now,
not just the open screenshot, so the sidebar and category tabs no longer go stale behind it.
