# @cappa/cli

## 0.13.0

### Minor Changes

- 180c4a6: Add `cappa capture --server <url>`, capturing against a `cappa serve` host.
  
  The browser runs on one machine and the CI job on another. Everything downstream
  is unchanged: the same live output, the same failure report, the same exit code.
  Pair it with `--token <token>`, which also reads `CAPPA_TOKEN`.
  
  A pre-flight `GET /api/health` turns four failures into four distinct messages
  before any capture starts — an unreachable host, a rejected token, a protocol
  mismatch, and a `--read-only` host that cannot capture — rather than letting
  them arrive mid-run. A host that is already busy reports that it is, instead of
  raising a stack trace.
  
  Two documented differences from a local capture:
  
  - **`onFail` receives relative paths only.** The screenshot files are on the
    host, so the `absolute*Path` fields would be fiction. They are left undefined
    and the reason is logged once. The callback still runs.
  - **Diff regions are best effort.** The protocol carries
    `diffMeta.interpretation` opaquely so a diff-engine upgrade is not a breaking
    wire change, so the changed-screenshot report now narrows it and omits the
    region breakdown when it does not match. Diff statistics are typed in the
    protocol and always render. Local capture is unaffected — it narrows a value
    that already matched.
  
  Ctrl-C cancels the run on the host and waits, briefly, for it to confirm before
  exiting 130; a second Ctrl-C leaves at once and says the remote run may still be
  going.
- 98c862e: Add `cappa capture --watch`: capture once, then re-capture affected tasks on
  every file change, holding one browser open across iterations.
  
  Each iteration prints what changed, the tasks that did not pass, and a one-line
  summary. A failing screenshot does not stop the session or set a non-zero exit
  code — it is what you are there to fix. Ctrl-C stops the watcher, closes the
  browser and exits `0`.
  
  `--watch` refuses to combine with `--ci` or `--server`, with a message rather
  than a silent no-op.
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
- aeaaf3d: Add `review.browserIdleTimeout` and shut `cappa review` down cleanly.
  
  `review.browserIdleTimeout` (default `300000`) controls how long the browser stays alive
  between captures started from the interactive UI. Keeping it warm makes an interactive
  capture feel immediate instead of paying browser startup on every click; evicting it once
  idle stops a forgotten review session holding a browser process indefinitely. Set it to `0`
  to shut the browser down after every run. It has no effect on `cappa capture`, which starts
  and stops a browser per invocation either way.
  
  `cappa review` now handles SIGINT and SIGTERM: it closes the HTTP server first so no new run
  can start mid-teardown, then closes the engine, which aborts any active run and shuts the
  browser down — previously a killed review server could leave an orphaned Chromium behind.
  The two closes are independent, so a server that fails to close still cannot prevent the
  browser from being cleaned up, and a second Ctrl-C exits immediately rather than making you
  reach for `kill -9`.
  
  When `cappa review` generates an access token, the URL carrying it is now also logged at
  warning level. It was only printed via `success`, which is suppressed below `-l 3`, so a
  quieter log level produced a token the user could never see — locking them out of their own
  review UI.
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

- aeaaf3d: Extract the capture orchestrator out of the CLI into a new `CaptureRunner` in `@cappa/core`.
  
  `CaptureRunner` owns the discover → filter → execute pipeline that previously lived inside the
  `capture` command. It emits a typed, sequence-numbered `RunEvent` stream, supports cancellation via
  `abort()`, and can capture a subset of the discovered tasks (`plugins`, `filter`, `taskIds`). It
  takes an already-initialised `ScreenshotTool`, so a long-lived process can keep one browser warm
  across runs.
  
  `@cappa/core` now also exports `groupScreenshots` and `collectScreenshots` (moved from `@cappa/cli`,
  which was not a published entry point for them), along with the runner types: `RunEvent`,
  `RunSummary`, `RunDetail`, `StartRunRequest`, `TaskStatus`, `Target`, plus `didScreenshotFail`,
  `toTaskStatus`, `filterTasks`, `selectTasks` and `getDeletedScreenshots`.
  
  `cappa capture` is now a consumer of that event stream and renders it to the terminal. Its output,
  exit codes and `onFail` behaviour are unchanged.
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
- 180c4a6: Drive `cappa capture` through a `CaptureEngine`.
  
  `capture` built a `ScreenshotTool` and a `CaptureRunner` by hand while `review` built a
  `LocalEngine` that builds the same two internally — two ways to start a run, and the CLI's
  was the one that skipped the engine's concurrency guard, target cache and typed errors.
  `capture` now starts a run on the engine, renders its event stream, and takes failures from
  `getRun`, so both commands reach a run the same way. Screenshot results for the `onFail`
  payload and the changed-screenshot report are read through `engine.listScreenshots()`
  rather than the filesystem directly.
  
  `@cappa/config` gains `configToEngineOptions(config)`, the config-to-engine mapping the two
  commands were each keeping their own copy of. How long a browser stays warm is left to the
  caller, since it is a per-command policy: `review` uses the configured timeout, and a
  one-shot `capture` keeps no browser warm at all.
  
  No user-visible change — terminal output and exit codes are unchanged.
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
- 4485e88: Build and type-check with TypeScript 7. The catalog-pinned `typescript` devDependency moves from
  `6.0.3` to `7.0.2`, so declaration files are now emitted by the native compiler. No source or public
  API changes.
- 98c862e: Shut down cleanly when the browser is already gone.
  
  A Ctrl-C in a terminal is delivered to the whole foreground process group,
  Chromium included, so by the time cappa's signal handler closes the browser
  every context can already be dead — and the resulting protocol error turned a
  clean quit into an uncaught exception. `ScreenshotTool.close` and the CLI's
  signal handlers now treat that as the ordinary case.
- Updated dependencies [aeaaf3d]
- Updated dependencies [ba73521]
- Updated dependencies [aeaaf3d]
- Updated dependencies [ba73521]
- Updated dependencies [aeaaf3d]
- Updated dependencies [180c4a6]
- Updated dependencies [98c862e]
- Updated dependencies [b92b9c4]
- Updated dependencies [98c862e]
- Updated dependencies [ba73521]
- Updated dependencies [aeaaf3d]
- Updated dependencies [aeaaf3d]
- Updated dependencies [180c4a6]
- Updated dependencies [ba73521]
- Updated dependencies [ba73521]
- Updated dependencies [b92b9c4]
- Updated dependencies [4485e88]
- Updated dependencies [98c862e]
- Updated dependencies [180c4a6]
- Updated dependencies [ba73521]
- Updated dependencies [98c862e]
- Updated dependencies [98c862e]
- Updated dependencies [ba73521]
- Updated dependencies [98c862e]
- Updated dependencies [aeaaf3d]
  - @cappa/server@0.9.0
  - @cappa/core@0.13.0
  - @cappa/client@0.9.0
  - @cappa/config@0.1.0
  - @cappa/logger@0.0.12

## 0.12.0

### Minor Changes

- e400216: Print the diff interpretation in `cappa capture` output. When a run fails, a "Changed Screenshots" box now lists every changed screenshot with its diff percentage and — when `diff.interpret` is enabled — its severity, summary and detected regions (change type, position and bounding box), so CI logs show where a change happened without opening the review UI. `cappa status` shows the same per-region breakdown. Regions are listed largest first and capped at five per screenshot; use the new `--max-regions <count>` flag on either command to list more (or `0` to omit the breakdown).

## 0.11.1

### Patch Changes

- Updated dependencies [9a3a5c0]
  - @cappa/server@0.8.6

## 0.11.0

### Minor Changes

- 84c0de4: Add `--filter` / `-f` option to the `capture` command to filter tasks by id using a glob pattern. Also exports the `PluginTask` type from `@cappa/core`.

### Patch Changes

- Updated dependencies [84c0de4]
  - @cappa/core@0.12.4
  - @cappa/server@0.8.5

## 0.10.5

### Patch Changes

- Updated dependencies [98940bf]
  - @cappa/core@0.12.3
  - @cappa/server@0.8.4

## 0.10.4

### Patch Changes

- Updated dependencies [ef49619]
  - @cappa/core@0.12.2
  - @cappa/server@0.8.3

## 0.10.3

### Patch Changes

- 26f09dc: Add info-level progress feedback during capture so users see `[N/total] captured <task>` as each screenshot completes, instead of silence until the plugin finishes.
- 5548381: perf(cli): replace static pre-chunking with work-stealing pool in capture

  Replace fixed chunk assignment with a shared work queue so pages grab the
  next task as soon as they finish the current one. Reuses and extends the
  existing `mapWithConcurrency` utility from `@cappa/core` to support return
  values and worker indices. Eliminates idle tail time when task durations vary.

- Updated dependencies [5548381]
- Updated dependencies [9b49288]
  - @cappa/core@0.12.1
  - @cappa/server@0.8.2

## 0.10.2

### Patch Changes

- ee60b61: fix(cli): make `approve --filter` case-insensitive

  `--filter Button` now matches `Button/Primary` as expected. Previously the filter was lowercased but compared against the raw-cased screenshot name, so capitalized story names never matched.

- 466eb57: fix(cli): exit 1 for new and deleted screenshots so CI catches unreviewed baselines

  New screenshots (no baseline to compare) now return `success: false` instead of `true`, so `capture` exits 1 and the failure report lists them alongside changed screenshots. After all plugins finish, `capture` also checks for deleted screenshots (baselines with no corresponding actual) and exits 1 if any are found. This aligns the exit code with the `onFail` callback, which already included both categories.

- c4f1011: fix(cli): register SIGINT/SIGTERM handlers so Ctrl-C during capture closes the browser before exit
- 3656ed1: `cappa status` now exits with code 1 when any screenshots are new, changed, or deleted, making it usable as a CI/script gate (e.g. `cappa status && deploy.sh`).

## 0.10.1

### Patch Changes

- 06cc73f: fix: pass through `diff.interpret` when normalizing the pixel diff config

  The CLI's config normalization rebuilt the pixel `diff` object from a fixed
  field whitelist that omitted `interpret`, so `diff: { interpret: true }` in
  `cappa.config.ts` was silently dropped before reaching the screenshot tool. As
  a result the interpretation pass never ran and no `diff/<name>.json` sidecars
  were written, so the CLI `status` output and the review UI never surfaced any
  interpretation. The flag is now forwarded correctly.

## 0.10.0

### Minor Changes

- f90c13e: Add opt-in structured diff interpretation via `diff.interpret`. When enabled, changed screenshots get a `diff/<name>.json` sidecar (alongside the diff image) describing _what_ changed — additions, deletions, color shifts and content changes grouped into regions, with a human-readable summary and severity. The sidecar is only written when interpretation is enabled (no extra files appear otherwise), is read back when the review UI and CLI rebuild state from disk, and is exposed on `ChangedScreenshot.diffMeta`.

  When the sidecar is present, the `cappa status` command prints a per-screenshot breakdown of changed screenshots (diff percentage, severity, region count and summary), and the review UI surfaces a severity badge, an interpretation summary banner and interactive, color-coded region overlays on the diff view.

  Interpretation is pixel-diff only and ignored when `diff.type: 'gmsd'`.

### Patch Changes

- Updated dependencies [f90c13e]
  - @cappa/core@0.12.0
  - @cappa/server@0.8.1

## 0.9.1

### Patch Changes

- 480735f: update deps
- Updated dependencies [e4c8abc]
- Updated dependencies [480735f]
  - @cappa/core@0.11.0
  - @cappa/server@0.8.0

## 0.9.0

### Minor Changes

- fdbc39e: Adding a configuration option to override the default port 3000 for the review UI.

### Patch Changes

- Updated dependencies [fdbc39e]
  - @cappa/core@0.10.0
  - @cappa/server@0.7.1

## 0.8.4

### Patch Changes

- 079307b: update deps
- Updated dependencies [079307b]
- Updated dependencies [f13c5da]
- Updated dependencies [dd02a52]
  - @cappa/server@0.7.0

## 0.8.3

### Patch Changes

- Updated dependencies [a14c04b]
  - @cappa/core@0.9.0
  - @cappa/server@0.6.1

## 0.8.2

### Patch Changes

- Updated dependencies [26c55a9]
  - @cappa/server@0.6.0

## 0.8.1

### Patch Changes

- 3c247a1: chore: upgrade deps
- Updated dependencies [3c247a1]
  - @cappa/server@0.5.7
  - @cappa/core@0.8.1
  - @cappa/logger@0.0.11

## 0.8.0

### Minor Changes

- eef23fa: Add `connectionTimeout` config option (default: 20s) to prevent indefinite hangs when targets like Storybook are unreachable

### Patch Changes

- Updated dependencies [eef23fa]
  - @cappa/core@0.8.0
  - @cappa/server@0.5.6

## 0.7.11

### Patch Changes

- Updated dependencies [f5e5977]
  - @cappa/server@0.5.5

## 0.7.10

### Patch Changes

- feff10a: fix deletion in ui
- Updated dependencies [feff10a]
- Updated dependencies [6a21106]
  - @cappa/core@0.7.3
  - @cappa/server@0.5.4

## 0.7.9

### Patch Changes

- Updated dependencies [dd34818]
  - @cappa/server@0.5.3

## 0.7.8

### Patch Changes

- Updated dependencies [a7b0539]
  - @cappa/core@0.7.2
  - @cappa/server@0.5.2

## 0.7.7

### Patch Changes

- Updated dependencies [9c0b5e5]
  - @cappa/server@0.5.1

## 0.7.6

### Patch Changes

- Updated dependencies [52cd104]
- Updated dependencies [830622d]
  - @cappa/server@0.5.0

## 0.7.5

### Patch Changes

- Updated dependencies [21ebbc5]
  - @cappa/core@0.7.1
  - @cappa/server@0.4.1

## 0.7.4

### Patch Changes

- Updated dependencies [b6d8ad7]
- Updated dependencies [558a782]
  - @cappa/core@0.7.0
  - @cappa/server@0.4.0

## 0.7.3

### Patch Changes

- Updated dependencies [b1eb4c8]
  - @cappa/core@0.6.3
  - @cappa/server@0.3.5

## 0.7.2

### Patch Changes

- 66124db: Update dependencies to latest versions
- Updated dependencies [66124db]
  - @cappa/core@0.6.2
  - @cappa/logger@0.0.10
  - @cappa/server@0.3.4

## 0.7.1

### Patch Changes

- 09f5068: chore(deps): upgrade + minimatch security fix
- Updated dependencies [09f5068]
  - @cappa/core@0.6.1
  - @cappa/server@0.3.3

## 0.7.0

### Minor Changes

- a9109e9: Remove the dedicated `ci` command and add a `--ci` option to `cappa capture`.

  When CI mode is enabled (either with `cappa capture --ci` or `CI=true`), Cappa now executes the configured `onFail` callback for failing screenshots.

- 337f150: Add global `screenshot.fullPage` and `screenshot.viewport` configuration.

  Screenshots now default to full-page capture (`fullPage: true`) at the global level. This applies to all plugins (including Storybook) when per-task options don't override it. Set `screenshot.fullPage: false` in `cappa.config.ts` to use viewport-only screenshots by default.

### Patch Changes

- ccc1c16: fix diff option typing and runtime handling for pixel and gmsd algorithms across config and Storybook per-screenshot overrides.
- 5159a52: fix: build
- Updated dependencies [ccc1c16]
- Updated dependencies [337f150]
- Updated dependencies [b70bb4e]
- Updated dependencies [5159a52]
  - @cappa/core@0.6.0
  - @cappa/logger@0.0.9
  - @cappa/server@0.3.2

## 0.6.1

### Patch Changes

- Updated dependencies [1606296]
  - @cappa/core@0.5.1
  - @cappa/server@0.3.1

## 0.6.0

### Minor Changes

- 11aeef9: feat: add review.theme config option for dark mode in review UI

### Patch Changes

- Updated dependencies [3f392e2]
- Updated dependencies [11aeef9]
- Updated dependencies [34d27f5]
  - @cappa/core@0.5.0
  - @cappa/server@0.3.0

## 0.5.2

### Patch Changes

- Updated dependencies [0f15cef]
  - @cappa/server@0.2.11

## 0.5.1

### Patch Changes

- Updated dependencies [5fb1cb5]
  - @cappa/core@0.4.7
  - @cappa/server@0.2.10

## 0.5.0

### Minor Changes

- 13d5697: feat(cli): add more detailed error report

### Patch Changes

- 52922a9: deps: upgrade dependencies
- Updated dependencies [52922a9]
  - @cappa/core@0.4.6
  - @cappa/server@0.2.9

## 0.4.5

### Patch Changes

- c248f15: fix(cli): cjs import

## 0.4.4

### Patch Changes

- c3b2cfc: fix: new diff types
- Updated dependencies [c3b2cfc]
  - @cappa/core@0.4.5
  - @cappa/server@0.2.8

## 0.4.3

### Patch Changes

- Updated dependencies [e59bfe7]
  - @cappa/core@0.4.4
  - @cappa/server@0.2.7

## 0.4.2

### Patch Changes

- Updated dependencies [365290f]
  - @cappa/logger@0.0.8
  - @cappa/core@0.4.3
  - @cappa/server@0.2.6

## 0.4.1

### Patch Changes

- 1fad7cc: fix: deleted screenshot handling in approve command
- Updated dependencies [1fad7cc]
  - @cappa/logger@0.0.7
  - @cappa/core@0.4.2
  - @cappa/server@0.2.5

## 0.4.0

### Minor Changes

- 188da53: Ensure `cappa approve` removes expected screenshots that no longer have a matching capture so stale baselines are cleaned up automatically.

## 0.3.2

### Patch Changes

- 298486b: fix: package export types
- Updated dependencies [298486b]
  - @cappa/logger@0.0.6
  - @cappa/core@0.4.1
  - @cappa/server@0.2.4

## 0.3.1

### Patch Changes

- Updated dependencies [1304724]
  - @cappa/server@0.2.3

## 0.3.0

### Minor Changes

- 915be10: Add a `logConsoleEvents` base configuration option that controls whether Playwright console
  messages are logged during captures, and have the Storybook plugin respect the global setting.

### Patch Changes

- Updated dependencies [915be10]
- Updated dependencies [1e8f301]
  - @cappa/core@0.4.0
  - @cappa/logger@0.0.5
  - @cappa/server@0.2.2

## 0.2.4

### Patch Changes

- 0203154: Sort review screenshots by status so new, deleted, changed, and passed items appear in a predictable order within the review server.
- 772d0f6: Ensure approving screenshots only updates baselines when actual and expected images differ.
- Updated dependencies [772d0f6]
  - @cappa/core@0.3.1
  - @cappa/server@0.2.1

## 0.2.3

### Patch Changes

- Updated dependencies [1228323]
  - @cappa/server@0.2.0

## 0.2.2

### Patch Changes

- Updated dependencies [360fa80]
  - @cappa/server@0.1.11

## 0.2.1

### Patch Changes

- d6fd7cc: Ensure the capture command exits with a non-zero status when any screenshot task fails or produces a comparison failure.

## 0.2.0

### Minor Changes

- e0f7f08: Add an `onFail` configuration callback for failed screenshots and forward environment details to configuration functions.

### Patch Changes

- Updated dependencies [e0f7f08]
  - @cappa/core@0.3.0
  - @cappa/server@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies [faa5c05]
  - @cappa/core@0.2.5
  - @cappa/server@0.1.9

## 0.1.8

### Patch Changes

- 6afa8eb: fix: less redundant logs
- Updated dependencies [6afa8eb]
  - @cappa/core@0.2.4
  - @cappa/server@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [4068bca]
  - @cappa/core@0.2.3
  - @cappa/server@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [6526418]
  - @cappa/core@0.2.2
  - @cappa/server@0.1.6

## 0.1.5

### Patch Changes

- 526857a: feat: add variant and play function support
- Updated dependencies [526857a]
  - @cappa/server@0.1.5
  - @cappa/core@0.2.1
  - @cappa/logger@0.0.4

## 0.1.4

### Patch Changes

- 4428907: Add unit test coverage for CLI commands.
- 88b3648: Centralize screenshot directory management in the core package and update the CLI and server to consume the shared helpers.
- f3f64c6: Switch CLI globbing to the built-in Node.js implementation.
- Updated dependencies [5b1f66f]
- Updated dependencies [87c8ab9]
- Updated dependencies [a1d91c6]
- Updated dependencies [88b3648]
  - @cappa/core@0.2.0
  - @cappa/server@0.1.4

## 0.1.3

### Patch Changes

- f6456fb: feat: add retry functionality
- Updated dependencies [f6456fb]
  - @cappa/server@0.1.3
  - @cappa/core@0.1.3
  - @cappa/logger@0.0.3

## 0.1.2

### Patch Changes

- a772b76: Add better logging + cleanup
- Updated dependencies [a772b76]
  - @cappa/server@0.1.2
  - @cappa/core@0.1.2
  - @cappa/logger@0.0.2

## 0.1.1

### Patch Changes

- d640855: Fix server public folder publish
- Updated dependencies [d640855]
  - @cappa/server@0.1.1
  - @cappa/core@0.1.1

## 0.1.0

### Minor Changes

- 78c1423: Add review functionality

### Patch Changes

- Updated dependencies [78c1423]
  - @cappa/server@0.1.0
  - @cappa/core@0.1.0

## 0.0.29

### Patch Changes

- Updated dependencies [8c17aac]
  - @cappa/core@0.0.27

## 0.0.28

### Patch Changes

- Updated dependencies [f232833]
  - @cappa/core@0.0.26

## 0.0.27

### Patch Changes

- e949088: Improve ui freezing styles
- Updated dependencies [e949088]
  - @cappa/core@0.0.25

## 0.0.26

### Patch Changes

- 4e109c5: Fix browsers path discovery
- Updated dependencies [4e109c5]
  - @cappa/core@0.0.24

## 0.0.25

### Patch Changes

- df7a7ec: Add more screenshot options
- Updated dependencies [df7a7ec]
  - @cappa/core@0.0.23

## 0.0.24

### Patch Changes

- 27a570a: Always use png screenshots
- Updated dependencies [27a570a]
  - @cappa/core@0.0.22

## 0.0.23

### Patch Changes

- e01e7c5: Add better report output
- Updated dependencies [e01e7c5]
  - @cappa/core@0.0.21

## 0.0.22

### Patch Changes

- eb34ecb: Add clean option to cli
- Updated dependencies [eb34ecb]
  - @cappa/core@0.0.20

## 0.0.21

### Patch Changes

- 63cf442: Use logging in storybook plugin
- Updated dependencies [63cf442]
  - @cappa/core@0.0.19

## 0.0.20

### Patch Changes

- 3a8b89e: Fix skipped stories and report
- Updated dependencies [3a8b89e]
  - @cappa/core@0.0.18

## 0.0.19

### Patch Changes

- 6d7176e: Fix error reporting
- Updated dependencies [6d7176e]
  - @cappa/core@0.0.17

## 0.0.18

### Patch Changes

- 92d164e: Fix directory creation
- Updated dependencies [92d164e]
  - @cappa/core@0.0.16

## 0.0.17

### Patch Changes

- a41a91e: Add fullPage option
- Updated dependencies [a41a91e]
  - @cappa/core@0.0.15

## 0.0.16

### Patch Changes

- b8af138: Screenshot Creation folders
- Updated dependencies [b8af138]
  - @cappa/core@0.0.14

## 0.0.15

### Patch Changes

- Updated dependencies [c538974]
  - @cappa/core@0.0.13

## 0.0.14

### Patch Changes

- 4e529fd: New options
- Updated dependencies [4e529fd]
  - @cappa/core@0.0.12

## 0.0.13

### Patch Changes

- db0af3a: Recreate outputdir

## 0.0.12

### Patch Changes

- 990246d: Fix
- Updated dependencies [990246d]
  - @cappa/core@0.0.11

## 0.0.11

### Patch Changes

- 861821a: Remove output dir

## 0.0.10

### Patch Changes

- c8f7bd8: Fix concurrency
- Updated dependencies [c8f7bd8]
  - @cappa/core@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [37f2587]
  - @cappa/core@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [76854a2]
  - @cappa/core@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies [3c53e57]
  - @cappa/core@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [2acecef]
  - @cappa/core@0.0.6

## 0.0.5

### Patch Changes

- Updated dependencies [a8a0d8f]
  - @cappa/core@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies [148b9ca]
  - @cappa/core@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [bff1e95]
  - @cappa/core@0.0.3

## 0.0.2

### Patch Changes

- b3d2806: Init
- Updated dependencies [b3d2806]
  - @cappa/core@0.0.2
