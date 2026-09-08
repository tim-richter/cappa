# @cappa/protocol

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
- aeaaf3d: Add the capture engine seam, the wire protocol, and a shared config loader.
  
  **New `@cappa/protocol`** — the wire contract (zod schemas plus inferred types) for
  runs, run events, targets, screenshots and every request/response body, together with the
  route table and a `PROTOCOL_VERSION`. Depends only on `zod`: no `node:*`, no
  `playwright-core`, so a browser client can install it without pulling in native diff
  bindings. Compile-time assertions in the package fail the build if its shapes drift from
  `@cappa/core`.
  
  **New `@cappa/config`** — `loadConfig` / `getConfig` moved out of `@cappa/cli` so anything
  that needs to evaluate `cappa.config.ts` can, without depending on the CLI. Both now accept
  an explicit `cwd` (and `getConfig` a `command`) instead of always reading `process.cwd()`
  and `process.argv`.
  
  **`@cappa/core`** gains the engine layer:
  
  - `CaptureEngine` — the interface a UI drives captures through, deliberately
    serializable in both directions so a remote implementation is possible later.
  - `LocalEngine` — in-process implementation. Runs one capture at a time, caches
    discovered targets, validates requested task ids against them, and reads the screenshot
    index from disk on every call rather than caching a snapshot.
  - `WarmBrowser` — keeps the browser alive between runs behind an idle timeout (default 5
    minutes) so an interactive capture does not pay Chromium startup every time.
  - `RunStore` — run registry with a bounded per-run event log and replay from a given
    sequence number, so a dropped event stream can resume without gaps.
  - `ScreenshotStore` / `FsScreenshotStore` — storage interface over screenshot bytes, with
    the local-filesystem implementation.
  - `ScreenshotTool.recycleContexts()` and `closeContexts()` — replace the context pool
    without restarting the browser. A reused browser's pages carry cookies, storage and
    scroll position from the previous run, so a warm engine recycles contexts before each
    run to keep captures identical to a cold CLI run. `close()` now also clears `browser`.
  
  `@cappa/cli` keeps its behaviour; it consumes `@cappa/config` and no longer bundles `jiti`.
- 98c862e: Add the watch contract: `watch:start` / `watch:change` / `watch:stop` events,
  `watchStatusSchema`, `startWatchRequestSchema`, a `trigger` on
  `startRunRequestSchema`, the `CAPPA_WATCH_IN_PROGRESS` error code, the
  `/api/watch` routes and a `capabilities.watch` flag.
  
  All additive, and `capabilities.watch` is optional so a newer client still
  parses an older server's health response — `PROTOCOL_VERSION` stays at 1.
- 180c4a6: Carry `ScreenshotTool`'s own output on the run event stream.
  
  `ScreenshotTool` wrote the lines a user actually watches — `Screenshot saved`,
  `Screenshot passed visual comparison`, the retry warnings — straight to the
  global logger. In-process that is fine. With the browser on another machine it
  meant those lines stayed in the *host's* terminal while a
  `cappa capture --server` client showed a run with no commentary.
  
  `CaptureRunner` now installs a log sink on the tool for the duration of a run,
  so its output travels as `log` events like everything else, and removes it again
  afterwards — including when the run throws, since a tool still pointing at a
  finished run's stream would swallow whatever it logged next.
  
  `RunLogLevel` gains `success`, which is the level those lines use. This is a
  wire change, and it lands before `PROTOCOL_VERSION` 1 has ever been published,
  so it is part of what v1 will be rather than a bump.
  
  A remote capture's terminal output is now identical to a local one. The
  exception is a plugin that logs on its own account through `getLogger()`: that
  still goes to the host's terminal. A plugin whose output should reach a remote
  client can log through `screenshotTool.logger`, which is routed into the run
  while one is in flight.
- ba73521: Export the `ChangedScreenshot` type. The schema was already exported; the
  inferred type was not, so a consumer rendering a diff comparison had to narrow
  the full union itself.

### Patch Changes

- 4485e88: Build and type-check with TypeScript 7. The catalog-pinned `typescript` devDependency moves from
  `6.0.3` to `7.0.2`, so declaration files are now emitted by the native compiler. No source or public
  API changes.
