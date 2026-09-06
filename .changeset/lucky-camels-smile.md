---
"@cappa/client": minor
"@cappa/protocol": minor
"@cappa/server": patch
---

Add `@cappa/client` — a typed client for the capture server.

`createClient({ baseUrl, token })` returns a `RemoteEngine`: the same capture interface
`LocalEngine` implements, spoken over HTTP and SSE. A UI holding one is indistinguishable
from a UI driving an in-process browser, which is what makes pointing the review UI at a
remote capture server a base-URL change rather than a rewrite. It depends only on
`@cappa/protocol`, so it installs without `playwright-core` or native diff bindings, and
compile-time assertions fail the build if it stops being a drop-in for `CaptureEngine`.

`subscribeRun` streams a run's events and resumes automatically from the last sequence
number it saw if the connection drops, ending on its own once the run finishes. It reads
the stream with `fetch` rather than `EventSource`, deliberately: `EventSource` cannot send
request headers — which would force the access token into the query string, where it lands
in server logs and browser history — and it reconnects on a schedule the caller cannot
observe or cancel.

Responses are validated against the protocol schemas, and the server's status codes are
mapped back onto typed errors (`RunInProgressError`, `UnknownTargetsError`,
`CappaHttpError`). The client checks the server's protocol version on its first call and
fails with `ProtocolMismatchError` rather than mis-parsing responses.

`@cappa/protocol` gains `ERROR_CODES` — carried on error responses so a client can tell a
conflict from a validation failure without installing the engine — and models the
server-computed `next`/`prev` screenshot fields, which schema validation would otherwise
strip.
