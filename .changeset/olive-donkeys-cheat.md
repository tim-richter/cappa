---
"@cappa/protocol": minor
"@cappa/config": minor
"@cappa/core": minor
"@cappa/cli": patch
---

Add the capture engine seam, the wire protocol, and a shared config loader.

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
