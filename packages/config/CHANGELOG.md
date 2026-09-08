# @cappa/config

## 0.1.0

### Minor Changes

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

### Patch Changes

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
- 4485e88: Build and type-check with TypeScript 7. The catalog-pinned `typescript` devDependency moves from
  `6.0.3` to `7.0.2`, so declaration files are now emitted by the native compiler. No source or public
  API changes.
- Updated dependencies [aeaaf3d]
- Updated dependencies [98c862e]
- Updated dependencies [b92b9c4]
- Updated dependencies [aeaaf3d]
- Updated dependencies [aeaaf3d]
- Updated dependencies [4485e88]
- Updated dependencies [180c4a6]
- Updated dependencies [98c862e]
- Updated dependencies [98c862e]
- Updated dependencies [aeaaf3d]
  - @cappa/core@0.13.0
  - @cappa/logger@0.0.12
