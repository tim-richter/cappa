# @cappa/client

## 0.9.0

### Minor Changes

- aeaaf3d: Add `@cappa/client` — a typed client for the capture server.
  
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
- b92b9c4: Fix re-capturing a single screenshot from the review UI
  
  The **Re-capture** button sent the screenshot's *name* as a task id. That is only
  a task id for `@cappa/plugin-pages`: `@cappa/plugin-storybook` writes
  `example/button/primary.png` for the task `example-button--primary`, so every
  click came back `400 CAPPA_UNKNOWN_TARGETS`. Variants never worked either, for
  any plugin.
  
  Nothing on disk recorded the link, so there was nothing to look it up in.
  `CaptureRunner` now records which task produced which screenshot as it captures
  — including variants, whose filenames only `ScreenshotTool` ever sees — into a
  `.cappa-manifest.json` beside `actual/` and `expected/`. `Screenshot` gains an
  optional `taskId` (and `plugin`) read back from it, and the button uses that,
  hiding itself when a screenshot has no recorded task rather than guessing.
  
  The manifest is best-effort throughout: a missing, unreadable or unwritable one
  costs the button and nothing else. A screenshot captured before this release has
  no entry until its next capture.
- 98c862e: Add `startWatch`, `stopWatch`, `getWatchStatus` and `subscribeWatch` to
  `RemoteEngine`, so a client can drive the server's watch session and follow its
  event stream.
  
  The watch stream resumes on a dropped connection exactly like the run stream —
  both now share one implementation — and a `409` maps onto a
  `WatchInProgressError`.
- ba73521: Add `getScreenshot(id)`, fetching a single screenshot by the id the server
  assigns it. Returns `undefined` for an unknown id rather than throwing, matching
  `getRun`, and carries `next`/`prev` so a detail view can navigate the full,
  unfiltered list.
  
  It is not part of `CaptureEngine`: an engine discovers and captures, while
  addressing one screenshot by a server-assigned view id is a review concern that
  only exists over HTTP.
- b92b9c4: Make the review UI honest about a run it did not start, and about being locked out
  
  Three things the UI could not say before:
  
  - **A capture already in flight.** The run id lived in component state, so a
    reload mid-capture — or a `cappa capture` in another terminal — left the page
    showing an idle panel whose Start button could only produce a `409`. It now
    reads the active run from the server and reattaches to it, replaying the
    stream, with the capture controls disabled while somebody else holds the
    browser.
  
  - **A rejected access token.** A `401` was retried like any other failure and
    then reported as "Error fetching screenshots" ten seconds later, with a blank
    sidebar and a capture page offering to start a run over "0 tasks available".
    `@cappa/client` now raises `UnauthorizedError` for a `401`, the UI does not
    retry it, and it explains that the server needs the token from its printed URL.
    A version mismatch gets the same treatment.
  
  - **`cappa review --host 0.0.0.0`** printed `http://0.0.0.0:PORT?token=…`, which
    no browser will open — and that URL is the only place a generated token ever
    appears. It now prints `localhost`.
  
  Also fixes `@cappa/client` caching a *failed* protocol handshake: the first
  unauthenticated call poisoned every later one for the lifetime of the client,
  including calls made after a token became available. A genuine version mismatch
  is still cached, since that one cannot resolve itself.

### Patch Changes

- 4485e88: Build and type-check with TypeScript 7. The catalog-pinned `typescript` devDependency moves from
  `6.0.3` to `7.0.2`, so declaration files are now emitted by the native compiler. No source or public
  API changes.
- 98c862e: Skip run events of an unknown type instead of failing on them.
  
  A newer server can now add event types without breaking an older client: an
  unrecognised type is skipped, its sequence number is still consumed — so a
  reconnect resumes from where the server actually is rather than replaying from
  before it — and the condition is reported once per stream instead of once per
  event. A known event type with a malformed body still surfaces through
  `onError`, because that is a different problem.
- Updated dependencies [aeaaf3d]
- Updated dependencies [b92b9c4]
- Updated dependencies [aeaaf3d]
- Updated dependencies [98c862e]
- Updated dependencies [4485e88]
- Updated dependencies [180c4a6]
- Updated dependencies [ba73521]
  - @cappa/protocol@0.9.0
