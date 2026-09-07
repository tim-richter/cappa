---
"@cappa/protocol": minor
---

Add the watch contract: `watch:start` / `watch:change` / `watch:stop` events,
`watchStatusSchema`, `startWatchRequestSchema`, a `trigger` on
`startRunRequestSchema`, the `CAPPA_WATCH_IN_PROGRESS` error code, the
`/api/watch` routes and a `capabilities.watch` flag.

All additive, and `capabilities.watch` is optional so a newer client still
parses an older server's health response — `PROTOCOL_VERSION` stays at 1.
