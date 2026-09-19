---
"@cappa/server": patch
---

Give the review UI loading, error and empty states worth reading

Every data page in the review UI rendered the same three lines: an unstyled
`<div>Loading...</div>`, a bare `Error fetching screenshots`, and — for a category with
nothing in it — either a blank white area (grid view) or `No results.` (list view). None
of the three said anything useful, and the error said least of all: the server's own
explanation and the status code were both thrown away, and the only way out was a full
page reload.

**Failures now say what failed and offer a way back.** The error state shows the server's
message and the HTTP status behind it, and a **Retry** action that refetches in place. The
six pages share one `QueryState` wrapper for this, so the loading, error and empty
behaviour is defined once rather than copied per page.

**Loading is a skeleton, not a word.** The page keeps its header and layout while data is
in flight instead of collapsing to a line of text, so nothing jumps when the list arrives.

**An empty category says which kind of empty it is.** "No changed screenshots —
everything matches the baseline" rather than a blank page, in both grid and list view. The
home page skips sections that have nothing in them and says so once when there is nothing
at all, naming the search term when a search is what came back empty.

Opening a screenshot that no longer exists is also reported as missing rather than as a
failed request: a 404 used to reach the page as a rejected query — React Query refuses a
query that resolves to `undefined` — and was reported as a broken one.
