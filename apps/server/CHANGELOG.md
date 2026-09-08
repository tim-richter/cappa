# @cappa/server

## 0.9.0

### Minor Changes

- aeaaf3d: Add the interactive capture surface to the review UI.
  
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
- 180c4a6: Add `cappa serve`, a capture host without the review UI's framing.
  
  `cappa review` assumes a person is about to open a browser: it names itself after
  the UI, prints a URL, and generates an access token off loopback so that URL is
  usable. `cappa serve` is the same server for a machine — `--port`, `--host`,
  `--token`, `--read-only`, `--no-ui` — that logs one structured line and then goes
  quiet. It is what a remote `cappa capture --server` will connect to.
  
  The one deliberate divergence is the token. `review` generates one off loopback
  because a human is reading the URL it prints; `serve` has no such reader, so
  generating one there would produce a daemon nobody can authenticate against.
  Off loopback `serve` requires a token and refuses to start without one, naming
  `--token` and `CAPPA_TOKEN` in the error.
  
  `--token` now falls back to `CAPPA_TOKEN` on both commands, so a CI job need not
  put the token in its process list.
  
  `@cappa/server`'s `createServer` gains a `ui` option, separating "serve the
  review UI" from "run in production mode" — `--no-ui` skips the UI's static files
  and its SPA fallback while leaving `/api/*` untouched.
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
- ba73521: Remove `PATCH /api/screenshots/:id`. It validated `{ approved: true }` and then
  called the same engine method `POST /api/screenshots/approve-batch` does, with
  `{ approved: false }` an explicit no-op — un-approving is not a concept, since a
  baseline is replaced rather than withdrawn. It was a second spelling of one
  mutation. The review UI now approves a single screenshot through
  `approve-batch` with one name, like everything else.
  
  The route was unversioned and undocumented, and its only consumer was the review
  UI that ships alongside this package.
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
- 98c862e: Serve the watch session: `GET/POST/DELETE /api/watch` and the
  `GET /api/watch/events` stream, with `capabilities.watch` on `/api/health`.
  
  Mutations are refused on a read-only server like every other mutation, and an
  engine that cannot see the files answers `501` rather than a missing route — a
  remote engine has no filesystem to watch, and a client should be told which.
  
  The review UI gains a watch toggle: turn it on and every save re-captures what
  it affects, streaming into the run view already built for it. Watch state is
  read back from the server, so a reload — or a session started from
  `cappa capture --watch` — shows the truth rather than this tab's guess.
- aeaaf3d: Make the server stateful and expose the capture routes.
  
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

### Patch Changes

- ba73521: Fix the review UI returning `401` for every screenshot request when the server
  is bound off loopback. The review pages — the lists, the sidebar total, the
  header count, the detail page and the theme — used raw `fetch` and never sent
  the access token, so `cappa review --host <non-loopback>` served a UI whose
  capture surface worked and whose entire review surface was empty. They now go
  through `@cappa/client`, which sends the token on every request.
- ba73521: Hide the approval controls when the server is read-only. The capture surface was
  already hidden, but the detail page's approve button, its `A` shortcut and the
  batch approve bar on every list page were still offered — and a read-only server
  answers `403`, so all three could only fail. They are now withheld along with
  the rest of the mutating UI.
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
- ba73521: Fix the review UI losing its access token after the first page load. When the
  server is bound off loopback it requires a token and prints it once, as part of
  the URL it tells you to open. The UI read that token out of the query string on
  every module load, but the token is only ever in the address bar on that first
  load — so any client-side navigation or reload left the UI unauthenticated and
  every capture request came back `401`.
  
  The token is now captured once, kept in `sessionStorage` for the tab, and read
  back on later loads. It is also removed from the address bar as soon as it has
  been captured, so it stops leaking into bookmarks, screenshots and the referer
  header. `sessionStorage` rather than `localStorage`: the token grants capture
  control over the machine running the server, so it should not outlive the tab —
  a new tab still needs the URL the server printed.
  
  Loopback servers, which use no token, are unaffected.
- 4485e88: Build and type-check with TypeScript 7. The catalog-pinned `typescript` devDependency moves from
  `6.0.3` to `7.0.2`, so declaration files are now emitted by the native compiler. No source or public
  API changes.
- ba73521: Fix the review UI's header showing a blank title and no count on the home page.
  The header derived its category from the first path segment and asserted it was
  one — but that segment is `""` on `/`, and the server rejects `?category=` with
  a `400`, so the count query failed and the title looked up an entry that does
  not exist. The home page now reads "All Screenshots" with the total count, and
  a path segment that is not a category no longer reaches the API.
- ba73521: Fix `@cappa/server` being publishable with a broken review UI. `bin/build.sh`
  built the web UI itself, concurrently with that package's own build, and had no
  `set -e` — so when the UI build failed to resolve `@cappa/client` (not yet
  built when the two raced), the failure was ignored and the broken bundle was
  copied into `public/` and packaged. The script exited `0` throughout, and the
  resulting UI dies in the browser with "Failed to resolve module specifier".
  
  The UI is now built exactly once, by its own package, and `bin/build.sh` only
  packages it: it fails loudly if that build has not run, and rejects a bundle
  containing unresolved `@cappa/*` imports so the failure cannot ship however it
  arises. The root `build` script orders the server last, which the dependency
  graph cannot express — `@cappa/client` dev-depends on `@cappa/server` for its
  integration tests, `@cappa/server` packages `web`, and `web` depends on
  `@cappa/client`.
- Updated dependencies [aeaaf3d]
- Updated dependencies [aeaaf3d]
- Updated dependencies [98c862e]
- Updated dependencies [b92b9c4]
- Updated dependencies [aeaaf3d]
- Updated dependencies [aeaaf3d]
- Updated dependencies [98c862e]
- Updated dependencies [4485e88]
- Updated dependencies [180c4a6]
- Updated dependencies [98c862e]
- Updated dependencies [ba73521]
- Updated dependencies [98c862e]
- Updated dependencies [aeaaf3d]
  - @cappa/core@0.13.0
  - @cappa/protocol@0.9.0

## 0.8.6

### Patch Changes

- 9a3a5c0: security dep updates

## 0.8.5

### Patch Changes

- Updated dependencies [84c0de4]
  - @cappa/core@0.12.4

## 0.8.4

### Patch Changes

- 98940bf: update deps
- Updated dependencies [98940bf]
  - @cappa/core@0.12.3

## 0.8.3

### Patch Changes

- Updated dependencies [ef49619]
  - @cappa/core@0.12.2

## 0.8.2

### Patch Changes

- Updated dependencies [5548381]
- Updated dependencies [9b49288]
  - @cappa/core@0.12.1

## 0.8.1

### Patch Changes

- Updated dependencies [f90c13e]
  - @cappa/core@0.12.0

## 0.8.0

### Minor Changes

- e4c8abc: add support for keyboard shortcuts for screenshot navigation + approval

### Patch Changes

- 480735f: update deps
- Updated dependencies [e4c8abc]
- Updated dependencies [480735f]
  - @cappa/core@0.11.0

## 0.7.1

### Patch Changes

- Updated dependencies [fdbc39e]
  - @cappa/core@0.10.0

## 0.7.0

### Minor Changes

- dd02a52: improve ui controls and persist view mode between screenshot change

### Patch Changes

- 079307b: update deps
- f13c5da: update deps

## 0.6.1

### Patch Changes

- Updated dependencies [a14c04b]
  - @cappa/core@0.9.0

## 0.6.0

### Minor Changes

- 26c55a9: feat: add toggle view

## 0.5.7

### Patch Changes

- 3c247a1: chore: upgrade deps
- Updated dependencies [3c247a1]
  - @cappa/core@0.8.1

## 0.5.6

### Patch Changes

- Updated dependencies [eef23fa]
  - @cappa/core@0.8.0

## 0.5.5

### Patch Changes

- f5e5977: fix(deps): update dependency fastify to v5.8.3 [security]

## 0.5.4

### Patch Changes

- feff10a: fix deletion in ui
- 6a21106: update dependencies
- Updated dependencies [feff10a]
- Updated dependencies [6a21106]
  - @cappa/core@0.7.3

## 0.5.3

### Patch Changes

- dd34818: Fix: caching of screenshots

## 0.5.2

### Patch Changes

- Updated dependencies [a7b0539]
  - @cappa/core@0.7.2

## 0.5.1

### Patch Changes

- 9c0b5e5: give feedback when approving in batch

## 0.5.0

### Minor Changes

- 52cd104: Add `POST /api/screenshots/approve-batch` to approve multiple screenshots by name in one request. The review UI uses this for "Approve selected" and "Approve all in category" batch actions.

### Patch Changes

- 830622d: Refactor screenshot view handling across multiple pages

## 0.4.1

### Patch Changes

- Updated dependencies [21ebbc5]
  - @cappa/core@0.7.1

## 0.4.0

### Minor Changes

- 558a782: feat: improve performance for page initialization

### Patch Changes

- Updated dependencies [b6d8ad7]
- Updated dependencies [558a782]
  - @cappa/core@0.7.0

## 0.3.5

### Patch Changes

- Updated dependencies [b1eb4c8]
  - @cappa/core@0.6.3

## 0.3.4

### Patch Changes

- 66124db: Update dependencies to latest versions
- Updated dependencies [66124db]
  - @cappa/core@0.6.2

## 0.3.3

### Patch Changes

- 09f5068: chore(deps): upgrade + minimatch security fix
- Updated dependencies [09f5068]
  - @cappa/core@0.6.1

## 0.3.2

### Patch Changes

- Updated dependencies [ccc1c16]
- Updated dependencies [337f150]
- Updated dependencies [b70bb4e]
- Updated dependencies [5159a52]
  - @cappa/core@0.6.0

## 0.3.1

### Patch Changes

- Updated dependencies [1606296]
  - @cappa/core@0.5.1

## 0.3.0

### Minor Changes

- 11aeef9: feat: add review.theme config option for dark mode in review UI

### Patch Changes

- Updated dependencies [3f392e2]
- Updated dependencies [11aeef9]
- Updated dependencies [34d27f5]
  - @cappa/core@0.5.0

## 0.2.11

### Patch Changes

- 0f15cef: fix: fastify vuln

## 0.2.10

### Patch Changes

- Updated dependencies [5fb1cb5]
  - @cappa/core@0.4.7

## 0.2.9

### Patch Changes

- Updated dependencies [52922a9]
  - @cappa/core@0.4.6

## 0.2.8

### Patch Changes

- Updated dependencies [c3b2cfc]
  - @cappa/core@0.4.5

## 0.2.7

### Patch Changes

- e59bfe7: deps: upgrade dependencies
- Updated dependencies [e59bfe7]
  - @cappa/core@0.4.4

## 0.2.6

### Patch Changes

- Updated dependencies [365290f]
  - @cappa/core@0.4.3

## 0.2.5

### Patch Changes

- Updated dependencies [1fad7cc]
  - @cappa/core@0.4.2

## 0.2.4

### Patch Changes

- 298486b: fix: package export types
- Updated dependencies [298486b]
  - @cappa/core@0.4.1

## 0.2.3

### Patch Changes

- 1304724: fix: ui screenshot count

## 0.2.2

### Patch Changes

- Updated dependencies [915be10]
  - @cappa/core@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies [772d0f6]
  - @cappa/core@0.3.1

## 0.2.0

### Minor Changes

- 1228323: feat: add approve functionality to the frontend

## 0.1.11

### Patch Changes

- 360fa80: fix: simplify screenshotviewer components

## 0.1.10

### Patch Changes

- Updated dependencies [e0f7f08]
  - @cappa/core@0.3.0

## 0.1.9

### Patch Changes

- Updated dependencies [faa5c05]
  - @cappa/core@0.2.5

## 0.1.8

### Patch Changes

- Updated dependencies [6afa8eb]
  - @cappa/core@0.2.4

## 0.1.7

### Patch Changes

- Updated dependencies [4068bca]
  - @cappa/core@0.2.3

## 0.1.6

### Patch Changes

- Updated dependencies [6526418]
  - @cappa/core@0.2.2

## 0.1.5

### Patch Changes

- 526857a: feat: add variant and play function support
- Updated dependencies [526857a]
  - @cappa/core@0.2.1

## 0.1.4

### Patch Changes

- 88b3648: Centralize screenshot directory management in the core package and update the CLI and server to consume the shared helpers.
- Updated dependencies [5b1f66f]
- Updated dependencies [87c8ab9]
- Updated dependencies [a1d91c6]
- Updated dependencies [88b3648]
  - @cappa/core@0.2.0

## 0.1.3

### Patch Changes

- f6456fb: feat: add retry functionality
- Updated dependencies [f6456fb]
  - @cappa/core@0.1.3

## 0.1.2

### Patch Changes

- a772b76: Add better logging + cleanup
- Updated dependencies [a772b76]
  - @cappa/core@0.1.2

## 0.1.1

### Patch Changes

- d640855: Fix server public folder publish
- Updated dependencies [d640855]
  - @cappa/core@0.1.1

## 0.1.0

### Minor Changes

- 78c1423: Add review functionality

### Patch Changes

- Updated dependencies [78c1423]
  - @cappa/core@0.1.0
