---
"@cappa/server": minor
---

Serve the watch session: `GET/POST/DELETE /api/watch` and the
`GET /api/watch/events` stream, with `capabilities.watch` on `/api/health`.

Mutations are refused on a read-only server like every other mutation, and an
engine that cannot see the files answers `501` rather than a missing route — a
remote engine has no filesystem to watch, and a client should be told which.

The review UI gains a watch toggle: turn it on and every save re-captures what
it affects, streaming into the run view already built for it. Watch state is
read back from the server, so a reload — or a session started from
`cappa capture --watch` — shows the truth rather than this tab's guess.
