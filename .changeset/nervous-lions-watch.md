---
"@cappa/client": minor
---

Add `startWatch`, `stopWatch`, `getWatchStatus` and `subscribeWatch` to
`RemoteEngine`, so a client can drive the server's watch session and follow its
event stream.

The watch stream resumes on a dropped connection exactly like the run stream —
both now share one implementation — and a `409` maps onto a
`WatchInProgressError`.
