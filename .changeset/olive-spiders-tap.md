---
"@cappa/client": minor
---

Add `getScreenshot(id)`, fetching a single screenshot by the id the server
assigns it. Returns `undefined` for an unknown id rather than throwing, matching
`getRun`, and carries `next`/`prev` so a detail view can navigate the full,
unfiltered list.

It is not part of `CaptureEngine`: an engine discovers and captures, while
addressing one screenshot by a server-assigned view id is a review concern that
only exists over HTTP.
