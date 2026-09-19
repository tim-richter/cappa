---
"@cappa/server": patch
---

Say what happened when approving, including when it fails

Approving in the review UI could fail without saying anything. `fetch` only rejects on a
network failure, so a `403` from a read-only server, a `404` for a screenshot that moved,
or a `500` from a broken store all reached the UI as silence: the detail view's approve
mutation returned the response without looking at it and had no error handler at all, and
the batch bar threw correctly but was only ever asked about success. The button stayed
where it was, no badge appeared, no message was shown, and clicking again was the only
feedback available.

**Every approve outcome is now reported.** A single approval is confirmed by name and a
batch by count; a request the server refused shows the server's own message; and a name
the engine rejected inside an otherwise successful response is named too — a `200` is not
proof that anything was approved.

**A failed approval no longer looks like a successful one.** The screenshot stays
unapproved, the page stays where it is, and a batch keeps its selection so retrying is one
click instead of a fresh round of selecting.

Both approve surfaces share one mutation, so they cannot drift apart again, and a failed
mutation nobody handles is now reported by the query client rather than swallowed — which
is what made the original bug invisible.
