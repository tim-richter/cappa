---
"@cappa/server": minor
"@cappa/core": patch
"@cappa/cli": minor
---

Make the server stateful and expose the capture routes.

`createServer` no longer takes a pre-computed `screenshots` array — it takes a `CaptureEngine`
instead, and reads the screenshot index through it on every request. The open review UI now
reflects a capture run, or a `cappa` invocation in another terminal, instead of showing the
snapshot taken when the server booted. The `diff` option is gone; approval belongs to the
engine.

New routes: `GET /api/plugins`, `GET /api/targets` (`?refresh=1`), `POST /api/runs`,
`GET /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/cancel`, and
`GET /api/runs/:id/events` — a server-sent event stream that tags each frame with the
event's sequence number, so a reconnecting client resumes exactly where it left off via
`Last-Event-ID` (or `?sinceSeq=`). `GET /api/health` now reports the protocol version and
the server's capabilities.

Two new safety controls, because this server drives a real browser and writes to disk:
`readOnly` refuses capture, approval and every other mutation, and `token` requires a shared
secret on every `/api/*` request.

`cappa review` builds a `LocalEngine` from the loaded config and injects it, and gains
`--port`, `--host`, `--read-only` and `--token`. Binding to a non-loopback host without a
token now generates one rather than exposing capture control unauthenticated.

`@cappa/core` adds `isRunInProgressError` and `isUnknownTargetsError`. Prefer these over
`instanceof`: the package ships dual ESM/CJS builds, so an error thrown by a CJS consumer is
not an `instanceof` the ESM copy's class, and the check fails silently.
