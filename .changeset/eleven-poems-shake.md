---
"@cappa/server": minor
---

Add the interactive capture surface to the review UI.

A new **Capture** page picks what to run — everything, a plugin, a text filter, or an
explicit set of tasks — and starts it. The run then renders live from the server's event
stream: a progress bar, per-task rows moving from pending through running to their outcome,
counts by status, and the run's log output. Runs can be cancelled while in flight.

Every screenshot's detail page gains a **Re-capture** button that runs just that one, without
clearing the rest of the results.

When a run finishes, the screenshot lists refresh on their own, so the changed/new/passed
tabs reflect what was just captured without a manual reload.

The whole surface is driven through `@cappa/client`, so the UI holds a `CaptureEngine`
rather than a pile of `fetch` calls — the same interface a remote capture server would
provide. On a read-only server the capture page and the re-capture buttons are hidden
entirely rather than offered and refused.
