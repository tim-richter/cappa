---
"@cappa/core": minor
---

Add watch mode to `LocalEngine`: `startWatch`, `stopWatch`, `getWatchStatus`
and `subscribeWatch`.

A watch session watches the project, debounces changes (300ms by default), asks
each plugin which tasks a changed file affects, and drives the existing
`startRun` with the result — so a watch capture is an ordinary run with the same
events, the same run store and the same one-run-at-a-time rule. `clearActual` is
always false, a change arriving during a run is queued rather than rejected, and
a resolved set larger than `maxTasks` (200) falls back to a filtered full run.

An active session holds a `WarmBrowser` lease that suspends idle eviction, so a
session left idle does not pay browser start-up on the next save.
