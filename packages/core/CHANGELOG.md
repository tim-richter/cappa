# @cappa/core

## 0.13.0

### Minor Changes

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
- 98c862e: Add watch mode to `LocalEngine`: `startWatch`, `stopWatch`, `getWatchStatus`
  and `subscribeWatch`.
  
  A watch session watches the project, debounces changes (300ms by default), asks
  each plugin which tasks a changed file affects, and drives the existing
  `startRun` with the result — so a watch capture is an ordinary run with the same
  events, the same run store and the same one-run-at-a-time rule. `clearActual` is
  always false, a change arriving during a run is queued rather than rejected, and
  a resolved set larger than `maxTasks` (200) falls back to a filtered full run.
  
  An active session holds a `WarmBrowser` lease that suspends idle eviction, so a
  session left idle does not pay browser start-up on the next save.
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
- 98c862e: Add an optional `watch` member to `PluginDef`, so a plugin can map a changed
  file onto the tasks it affects.
  
  `watch.paths` widens what a watch session watches; `watch.resolve(file, tasks)`
  answers with task ids, or `null` for "cannot tell — re-run everything this
  plugin owns". Optional everywhere: a plugin without it keeps working and simply
  contributes its whole task set on any change.

### Patch Changes

- 4485e88: Build and type-check with TypeScript 7. The catalog-pinned `typescript` devDependency moves from
  `6.0.3` to `7.0.2`, so declaration files are now emitted by the native compiler. No source or public
  API changes.
- 98c862e: Shut down cleanly when the browser is already gone.
  
  A Ctrl-C in a terminal is delivered to the whole foreground process group,
  Chromium included, so by the time cappa's signal handler closes the browser
  every context can already be dead — and the resulting protocol error turned a
  clean quit into an uncaught exception. `ScreenshotTool.close` and the CLI's
  signal handlers now treat that as the ordinary case.
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
- Updated dependencies [4485e88]
  - @cappa/logger@0.0.12

## 0.12.4

### Patch Changes

- 84c0de4: Add `--filter` / `-f` option to the `capture` command to filter tasks by id using a glob pattern. Also exports the `PluginTask` type from `@cappa/core`.

## 0.12.3

### Patch Changes

- 98940bf: update deps

## 0.12.2

### Patch Changes

- ef49619: Fix missing diff images when `diff.interpret` is enabled. The native comparison binding skips writing the diff output file when `interpret: true` is passed, causing ENOENT errors during capture. Interpretation is now fetched in a separate call so the diff image is always produced.

## 0.12.1

### Patch Changes

- 5548381: perf(cli): replace static pre-chunking with work-stealing pool in capture

  Replace fixed chunk assignment with a shared work queue so pages grab the
  next task as soon as they finish the current one. Reuses and extends the
  existing `mapWithConcurrency` utility from `@cappa/core` to support return
  values and worker indices. Eliminates idle tail time when task durations vary.

- 9b49288: perf(core): eliminate redundant PNG decodes and temp-file round-trips in image comparison

  - Pass expected-image file path directly to the native comparator instead of reading into a Buffer and writing back to a temp file
  - Replace full sharp decode for PNG validation with an 8-byte signature check
  - Extract image dimensions from the 24-byte IHDR header instead of a full sharp decode
  - Inject diff metadata directly into the PNG buffer instead of decode/set/re-encode

## 0.12.0

### Minor Changes

- f90c13e: Add opt-in structured diff interpretation via `diff.interpret`. When enabled, changed screenshots get a `diff/<name>.json` sidecar (alongside the diff image) describing _what_ changed — additions, deletions, color shifts and content changes grouped into regions, with a human-readable summary and severity. The sidecar is only written when interpretation is enabled (no extra files appear otherwise), is read back when the review UI and CLI rebuild state from disk, and is exposed on `ChangedScreenshot.diffMeta`.

  When the sidecar is present, the `cappa status` command prints a per-screenshot breakdown of changed screenshots (diff percentage, severity, region count and summary), and the review UI surfaces a severity badge, an interpretation summary banner and interactive, color-coded region overlays on the diff view.

  Interpretation is pixel-diff only and ignored when `diff.type: 'gmsd'`.

## 0.11.0

### Minor Changes

- e4c8abc: add support for keyboard shortcuts for screenshot navigation + approval

### Patch Changes

- 480735f: update deps

## 0.10.0

### Minor Changes

- fdbc39e: Adding a configuration option to override the default port 3000 for the review UI.

## 0.9.0

### Minor Changes

- a14c04b: use core-native instead of core to improve performance

## 0.8.1

### Patch Changes

- 3c247a1: chore: upgrade deps
- Updated dependencies [3c247a1]
  - @cappa/logger@0.0.11

## 0.8.0

### Minor Changes

- eef23fa: Add `connectionTimeout` config option (default: 20s) to prevent indefinite hangs when targets like Storybook are unreachable

## 0.7.3

### Patch Changes

- feff10a: fix deletion in ui
- 6a21106: update dependencies

## 0.7.2

### Patch Changes

- a7b0539: Use sharp instead of pngjs for PNG load/encode in the core package for improved performance. PNG.toBuffer() and PNG.save() are now async; createDiffSizePngImage() is now async.

## 0.7.1

### Patch Changes

- 21ebbc5: Log how long each screenshot capture took in milliseconds at debug level

## 0.7.0

### Minor Changes

- 558a782: feat: improve performance for page initialization

### Patch Changes

- b6d8ad7: Improve screenshot capture performance and stability

## 0.6.3

### Patch Changes

- b1eb4c8: Continue retrying screenshots when image sizes differ instead of failing immediately. Layout shifts and pages still loading can cause transient size mismatches that resolve on subsequent attempts.

  Also fixes the GMSD comparator to skip the comparison algorithm when image dimensions don't match, aligning it with the pixel comparator's behaviour.

## 0.6.2

### Patch Changes

- 66124db: Update dependencies to latest versions
- Updated dependencies [66124db]
  - @cappa/logger@0.0.10

## 0.6.1

### Patch Changes

- 09f5068: chore(deps): upgrade + minimatch security fix

## 0.6.0

### Minor Changes

- 337f150: Add global `screenshot.fullPage` and `screenshot.viewport` configuration.

  Screenshots now default to full-page capture (`fullPage: true`) at the global level. This applies to all plugins (including Storybook) when per-task options don't override it. Set `screenshot.fullPage: false` in `cappa.config.ts` to use viewport-only screenshots by default.

### Patch Changes

- ccc1c16: fix diff option typing and runtime handling for pixel and gmsd algorithms across config and Storybook per-screenshot overrides.
- b70bb4e: Add debug logging when screenshot capture waits for a configured `delay`, and add regression tests to verify delay handling in core screenshots and Storybook-provided screenshot options.
- 5159a52: fix: build
- Updated dependencies [5159a52]
  - @cappa/logger@0.0.9

## 0.5.1

### Patch Changes

- 1606296: Remove deprecated @blazediff/types dependency. Types for pixel comparison now come from @blazediff/core (CoreOptions), and GMSD comparison uses GmsdOptions from @blazediff/gmsd.

## 0.5.0

### Minor Changes

- 3f392e2: feat: add options to override diff configs on per-screenshot level
- 11aeef9: feat: add review.theme config option for dark mode in review UI

### Patch Changes

- 34d27f5: Store diff generation metadata in produced PNG files, including the diff algorithm and configured comparison options. When approving screenshots, copy diff metadata onto approved expected PNGs so baseline images retain the accepted diff context.

## 0.4.7

### Patch Changes

- 5fb1cb5: fix: move playwright-core into peer deps

## 0.4.6

### Patch Changes

- 52922a9: deps: upgrade dependencies

## 0.4.5

### Patch Changes

- c3b2cfc: fix: new diff types

## 0.4.4

### Patch Changes

- e59bfe7: deps: upgrade dependencies

## 0.4.3

### Patch Changes

- 365290f: fix: package files export
- Updated dependencies [365290f]
  - @cappa/logger@0.0.8

## 0.4.2

### Patch Changes

- 1fad7cc: fix: deleted screenshot handling in approve command
- Updated dependencies [1fad7cc]
  - @cappa/logger@0.0.7

## 0.4.1

### Patch Changes

- 298486b: fix: package export types
- Updated dependencies [298486b]
  - @cappa/logger@0.0.6

## 0.4.0

### Minor Changes

- 915be10: Add a `logConsoleEvents` base configuration option that controls whether Playwright console
  messages are logged during captures, and have the Storybook plugin respect the global setting.

### Patch Changes

- Updated dependencies [1e8f301]
  - @cappa/logger@0.0.5

## 0.3.1

### Patch Changes

- 772d0f6: Ensure approving screenshots only updates baselines when actual and expected images differ.

## 0.3.0

### Minor Changes

- e0f7f08: Add an `onFail` configuration callback for failed screenshots and forward environment details to configuration functions.

## 0.2.5

### Patch Changes

- faa5c05: fix: better logs

## 0.2.4

### Patch Changes

- 6afa8eb: fix: less redundant logs

## 0.2.3

### Patch Changes

- 4068bca: fix: correct screenshot handling logic in ScreenshotTool

## 0.2.2

### Patch Changes

- 6526418: fix: actual screenshot error

## 0.2.1

### Patch Changes

- 526857a: feat: add variant and play function support
- Updated dependencies [526857a]
  - @cappa/logger@0.0.4

## 0.2.0

### Minor Changes

- 5b1f66f: Add support for capturing screenshot variants and configure Storybook stories to request multiple viewport screenshots.
- 88b3648: Centralize screenshot directory management in the core package and update the CLI and server to consume the shared helpers.

### Patch Changes

- 87c8ab9: Document how screenshot retries work in the docs so users know how to
  configure and reason about the behaviour.
- a1d91c6: feat: add viewport options

## 0.1.3

### Patch Changes

- f6456fb: feat: add retry functionality
- Updated dependencies [f6456fb]
  - @cappa/logger@0.0.3

## 0.1.2

### Patch Changes

- a772b76: Add better logging + cleanup
- Updated dependencies [a772b76]
  - @cappa/logger@0.0.2

## 0.1.1

### Patch Changes

- d640855: Fix server public folder publish

## 0.1.0

### Minor Changes

- 78c1423: Add review functionality

## 0.0.27

### Patch Changes

- 8c17aac: Remove sandboxing

## 0.0.26

### Patch Changes

- f232833: Increase deviceScaleFactor

## 0.0.25

### Patch Changes

- e949088: Improve ui freezing styles

## 0.0.24

### Patch Changes

- 4e109c5: Fix browsers path discovery

## 0.0.23

### Patch Changes

- df7a7ec: Add more screenshot options

## 0.0.22

### Patch Changes

- 27a570a: Always use png screenshots

## 0.0.21

### Patch Changes

- e01e7c5: Add better report output

## 0.0.20

### Patch Changes

- eb34ecb: Add clean option to cli

## 0.0.19

### Patch Changes

- 63cf442: Use logging in storybook plugin

## 0.0.18

### Patch Changes

- 3a8b89e: Fix skipped stories and report

## 0.0.17

### Patch Changes

- 6d7176e: Fix error reporting

## 0.0.16

### Patch Changes

- 92d164e: Fix directory creation

## 0.0.15

### Patch Changes

- a41a91e: Add fullPage option

## 0.0.14

### Patch Changes

- b8af138: Screenshot Creation folders

## 0.0.13

### Patch Changes

- c538974: Replace playwright with playwright-core

## 0.0.12

### Patch Changes

- 4e529fd: New options

## 0.0.11

### Patch Changes

- 990246d: Fix

## 0.0.10

### Patch Changes

- c8f7bd8: Fix concurrency

## 0.0.9

### Patch Changes

- 37f2587: Fix pages

## 0.0.8

### Patch Changes

- 76854a2: fix context

## 0.0.7

### Patch Changes

- 3c53e57: Reuse playwright pages

## 0.0.6

### Patch Changes

- 2acecef: Add skip option

## 0.0.5

### Patch Changes

- a8a0d8f: Add delay option

## 0.0.4

### Patch Changes

- 148b9ca: Fix dist folder

## 0.0.3

### Patch Changes

- bff1e95: Fix types

## 0.0.2

### Patch Changes

- b3d2806: Init
