# Tasks — Interactive Capture UI

Each phase is independently mergeable and must be green (`pnpm lint`, `pnpm tsc`,
`pnpm test`) before the next starts. Phases 1–2 are behaviour-preserving refactors.

---

## Phase 1 — Extract the orchestrator into `@cappa/core` ✅

No user-visible change. `cappa capture` output must be byte-identical.

- [x] `packages/core/src/runner/types.ts` — `RunState`, `RunEvent` union,
      `TaskStatus`, `RunSummary`, `RunDetail`, `StartRunRequest`.
- [x] `packages/core/src/runner/CaptureRunner.ts` — lift discover → chunk →
      execute from `packages/cli/src/commands/capture.ts`. Takes an
      **already-initialised** `ScreenshotTool`, plugins, and options; emits events;
      supports `abort()` via `AbortSignal`. No `process`, no `chalk`, no
      `process.exit`.
- [x] Move `filterTasks`, `didScreenshotFail`, `getDeletedScreenshots` from the CLI
      into the runner module; re-export from `@cappa/core`.
- [x] Move `groupScreenshots` + `collectScreenshots` from `@cappa/cli` to
      `@cappa/core` (the server needs them; the CLI keeps importing them).
- [x] `CaptureRunner.test.ts` — port existing `capture.test.ts` cases; add
      cancellation, event ordering, and `seq` monotonicity tests.
- [x] Rewrite `packages/cli/src/commands/capture.ts` as an event consumer:
      subscribe → `renderRunEvent` → failure report → `onFail` → `process.exit(1)`.
      `registerSignalHandlers` stays in the CLI.
- [x] Verify parity against a real capture run.

**Deviations from the proposal**

- **No separate `task:failed` event.** `task:complete` carries a `status`
  (`passed` / `changed` / `new` / `failed` / `skipped`) and the raw plugin result,
  which is strictly more information in one event and a simpler UI reducer. Added
  `filter:applied` so the CLI can render the filter box without owning selection
  logic.
- **`clearActual` moved into the runner** as part of `StartRunRequest` (default
  `true`), so the server does not have to re-implement it. The filesystem is
  injectable (`CaptureRunnerOptions.fileSystem`) rather than constructed inline.
- **`registerSignalHandlers` is not wired to `runner.abort()`.** It still closes
  the browser and exits 130, exactly as before — changing it would alter CLI
  behaviour, which this phase must not do. Revisit when the server needs graceful
  shutdown (Phase 6).

**Parity evidence.** `examples/storybook` could not be used: its Storybook build
fails independently of this change (invalid ESM in `.storybook/main.ts`). Verified
instead with a self-contained fixture project driving a hand-written plugin over
local HTML pages, across six scenarios — all-new, all-passed, `--filter`, a
changed screenshot, a deleted baseline, and a filter matching nothing. Terminal
output and exit codes are byte-identical before and after the refactor
(normalising only durations and absolute paths).

## Phase 2 — `@cappa/protocol` and `@cappa/config` ✅

- [x] New package `packages/protocol` (`@cappa/protocol`). Deps: `zod` only.
      No `node:*`, no `playwright-core`. tsdown dual ESM/CJS, `attw` clean.
- [x] Define zod schemas + inferred types for every request/response body, the
      `RunEvent` union, the route constants, and `PROTOCOL_VERSION`.
- [x] Compile-time drift guard: assertions that every core type the server
      serializes is assignable to its protocol counterpart, so `pnpm tsc` fails
      if the two definitions diverge.
- [x] Move `packages/cli/src/features/config/` → `packages/config`
      (`@cappa/config`); `@cappa/cli` depends on it and drops `jiti`/`ts-node`.
      `loadConfig`/`getConfig` take an explicit `cwd`/`command` rather than
      always reading `process.cwd()` and `process.argv`.
- [x] `packages/core/src/engine/types.ts` — the `CaptureEngine` interface, plus
      `RunInProgressError` and `UnknownTargetsError`.
- [x] `packages/core/src/engine/LocalEngine.ts` — in-process implementation:
      owns the warm browser, the run store, the target discovery cache, and
      delegates screenshot listing/approval to `ScreenshotFileSystem`.
- [x] Warm-browser lifecycle: idle timeout (default 5 min), context recycling
      between runs, explicit `close()`. Tests for eviction, reuse and recovery.
- [x] `ScreenshotStore` interface + `FsScreenshotStore`. Interface only — no
      second implementation.
- [x] Tests for `LocalEngine`: single-run-at-a-time (typed error the server will
      map to `409`), cancellation, event replay from `sinceSeq`.
- [x] `zod` pinned in the workspace catalog; `@cappa/server` switched to it.

**Deviations and findings**

- **`RunStore`, not `RunManager`.** Run registry plus the bounded event log in
  one place; `WarmBrowser` owns browser lifetime separately. Two small units
  beat one class doing both.
- **Context recycling had to be added to `ScreenshotTool`.** The proposal called
  for disposing contexts between runs, but `close()` was all-or-nothing. Added
  `recycleContexts()` / `closeContexts()`. This is not optional polish: a warm
  browser's pages carry cookies, storage and scroll position from the previous
  run, so without it a UI-triggered capture could differ from the identical CLI
  capture. `WarmBrowser` recycles on every acquire after the first.
- **The diff interpretation is opaque in the protocol.** Its shape belongs to
  `@blazediff/core-native`'s `InterpretResult` and changes with that dependency;
  pinning it in a versioned wire contract would turn every diff-engine upgrade
  into a breaking protocol change. It passes through untouched, and consumers
  that render the detail narrow it with the type from `@cappa/core`.
- **Two concurrency bugs found and fixed**, both invisible to the unit tests
  that existed when they were written:
  - `listTargets` during a run would acquire the browser and recycle the very
    contexts the run was capturing with. The public method now serves the cache
    while a run holds the browser; discovery bypasses that guard only from
    inside `startRun`, before the browser is acquired.
  - A client starting a run from inside a `run:complete` subscriber — the
    obvious "run finished, start the next one" behaviour — raced the engine's
    teardown and was rejected as though a run were still active. Cleanup is now
    registered as a runner listener ahead of the run store, so it completes in
    the same synchronous emit, before any subscriber observes the event. Found
    by the real-browser smoke test, not by the unit suite.

**Verification.** 208 core / 12 config / 8 protocol tests, plus the whole
existing suite (355 across the repo), `pnpm lint`, `pnpm tsc` and `pnpm attw`
green. The six-scenario CLI capture parity check still produces output identical
to the pre-Phase-1 baseline. An end-to-end `LocalEngine` smoke test against a
real Chromium exercised discovery, run completion and per-task statuses,
monotonic event sequencing, the concurrency guard, subset runs with
`clearActual: false`, browser reuse, unknown-task rejection, cancellation, idle
eviction and recovery, and the capture → approve → re-capture lifecycle.

## Phase 3 — `@cappa/server` becomes stateful ✅

- [x] `createServer` signature: drop `screenshots` and `diff`, add
      `engine: CaptureEngine`, `readOnly?: boolean` and `token?: string`.
- [x] `/api/screenshots` reads through the engine on every request.
- [x] Routes: `GET /api/plugins`, `GET /api/targets` (`?refresh=1`),
      `POST /api/runs`, `GET /api/runs`, `GET /api/runs/:id`,
      `POST /api/runs/:id/cancel`.
- [x] `GET /api/runs/:id/events` — SSE. `id:` on each frame from `seq`; honours
      `Last-Event-ID` (and `?sinceSeq=`) for replay; heartbeat comment every
      15s; clean teardown on client disconnect.
- [x] `GET /api/health` returns `{ ok, protocolVersion, capabilities }`;
      `GET /api/config` gains `readOnly`.
- [x] Validate every body against the `@cappa/protocol` zod schemas. `taskIds`
      not in the discovered target set are rejected by the engine and mapped to
      `400`.
- [x] `readOnly` guard rejects capture/approve/mutation routes with `403`.
- [x] Token auth gating `/api/*`, via header or query parameter.
- [x] `cappa review` builds and injects a `LocalEngine`; gains `--port`,
      `--host`, `--read-only`, `--token`, and generates a token when bound off
      loopback.
- [x] Tests: run lifecycle over HTTP with a fake engine, SSE framing + replay,
      409 on concurrent run, read-only rejections, auth.

**Deviations and findings**

- **No `Workspace` class.** The proposal had one owning a cached screenshot
  index invalidated on `run:complete`. `LocalEngine.listScreenshots` already
  reads from disk on every call, so a caching layer above it would have been
  indirection guarding a cache that must never be stale — anything can write to
  `outputDir` while the server is up. What was left of the Workspace is the
  view transform (asset URLs, `next`/`prev`, `approved`) which lives in
  `util.ts`.
- **`approved` is derived, not stored.** It used to be per-session state on the
  in-memory array. With a read-through index there is nowhere to keep it, and
  nowhere it belongs: a screenshot matching its baseline has nothing left to
  approve, so `approved` is now `category === "passed"`. The existing review UI
  keeps working unchanged.
- **`screenshotPathsForFilesystem` deleted.** It stripped the asset prefix back
  off before approving. The engine approves by name, so it had no callers left.
- **Dual-package hazard found by the end-to-end smoke test.** `@cappa/core`
  ships ESM and CJS builds; the CLI binary is CJS and `@cappa/server` is ESM, so
  each loads its own copy of `RunInProgressError` / `UnknownTargetsError`. The
  server's `instanceof` checks were always false against errors thrown by the
  engine the CLI constructed, silently turning `409` and `400` into `500`. The
  unit tests could not catch this — they resolve a single module instance — and
  `attw` checks resolution, not identity. Fixed with `isRunInProgressError` /
  `isUnknownTargetsError`, which key off a stable `code`; a regression test
  asserts the guards accept an error that shares no prototype.

**Verification.** 212 core / 54 server / 57 CLI tests, 408 across the repo, with
lint, `tsc` and `attw` green. CLI capture output still identical to the
pre-Phase-1 baseline. An end-to-end smoke test drove the real `cappa review`
binary over HTTP: health and capabilities, plugin and target listing, starting a
run, `409` on a concurrent run, the live SSE event stream, run detail with
per-task statuses, `?sinceSeq=` replay, `400` for an undiscovered task id,
batch approval, and the resulting category change from `new` to `passed`.

## Phase 4 — `@cappa/client` ✅

- [x] New package `packages/client` (`@cappa/client`). Deps: `@cappa/protocol`
      and `zod`. Isomorphic — `fetch` only, no node built-ins.
- [x] `createClient({ baseUrl, token? })` returning `RemoteEngine`; every
      response parsed with the protocol schemas.
- [x] `subscribeRun` with `sinceSeq`, automatic resume, and unsubscribe.
- [x] Protocol-version check on first call, cached; `ProtocolMismatchError` on
      mismatch.
- [x] HTTP status codes mapped onto typed errors (`RunInProgressError`,
      `UnknownTargetsError`, `CappaHttpError`).
- [x] Tests against a real `@cappa/server` instance backed by a scripted engine.

**Deviations and findings**

- **`fetch`, not `EventSource`.** The proposal named `EventSource`, but it
  cannot send request headers — the access token would have to travel in the
  query string, where it lands in server logs and browser history — and it
  reconnects on a schedule the caller can neither observe nor cancel. Reading
  the stream with `fetch` costs a ~100-line SSE parser and buys header auth, an
  `AbortSignal`, and explicit resume. The parser is covered by its own tests,
  including frames split mid-UTF-8-sequence.
- **The client does not import `@cappa/core` at all**, not even for the
  `CaptureEngine` type — that would put core in its published `.d.ts` and defeat
  the point. `RemoteEngine` is typed in protocol terms, and a compile-time
  assertion in the test file (with core as a dev dependency) checks it is a
  drop-in.
- **That assertion found a real, unavoidable divergence.** `RemoteEngine`
  satisfies `CaptureEngine` exactly for every capture-driving method, but
  `listScreenshots` cannot: the protocol carries `diffMeta.interpretation`
  opaquely as `unknown` (Phase 2's decision), and `unknown` is not assignable to
  core's `InterpretResult`. Rather than weaken core's type or fake the
  assertion, the guard is split in two — an exact assertion for the run-driving
  surface, and a narrower one for `listScreenshots` documenting the one
  deliberate difference.
- **`next`/`prev` had to be added to the protocol.** The server computes them,
  but zod strips unknown keys, so the client was silently dropping them — the
  review UI's keyboard navigation would have quietly stopped working in Phase 5.
  Caught by an integration test asserting they survive the round trip.
- **Error codes moved into the protocol.** `ERROR_CODES` now lives in
  `@cappa/protocol` and rides on error response bodies, so the client maps a
  conflict without importing the engine. A protocol test asserts it still equals
  core's `ENGINE_ERROR_CODES`.

**Verification.** 55 client tests (26 unit, 13 SSE parser, 16 integration
against a live Fastify server over a real socket), 464 across the repo, with
lint, `tsc` and `attw` green. An end-to-end smoke test drove the built client
against the real `cappa review` binary with a real browser: version handshake,
plugin and target listing, a full run watched live over SSE with monotonic
sequence numbers and per-task statuses, a subset re-capture with
`clearActual: false`, `RunInProgressError` and `UnknownTargetsError` mapped back
from real HTTP responses, cancellation, and batch approval.

## Phase 5 — `apps/web` capture surface ✅

- [x] `src/api/client.ts` — module-level `createClient` pointed at same-origin,
      lifting the access token out of the page URL when there is one.
- [x] react-query hooks: `useServerConfig`, `usePlugins`, `useTargets`,
      `useRuns`, `useStartRun`, `useCancelRun`, `useRecapture`, and
      `useRunEvents` (SSE → local reducer, not the query cache).
- [x] `CapturePanel` — plugin picker, task filter, per-task selection, Start.
- [x] `RunView` — progress bar, per-task rows (pending → running → terminal
      status), status counts, cancel, log pane with autoscroll.
- [x] Re-capture button on the screenshot detail page (`taskIds: [id]`,
      `clearActual: false`).
- [x] Invalidate screenshot queries on the terminal event.
- [x] Hide the capture surface — page, sidebar entry and re-capture buttons —
      when `GET /api/config` reports `readOnly`.
- [x] Route `/capture` + sidebar entry; msw handlers for the new endpoints;
      Storybook stories for `CapturePanel`, `RunView` and the page; tests.

**Deviations and findings**

- **The event reducer is a separate pure module** (`src/api/runState.ts`) rather
  than living inside the hook. It is the piece most likely to be wrong, and this
  way it is tested directly — including that it is idempotent under replay and
  never lets progress run backwards, which is what makes a reconnecting stream
  safe.
- **The existing screenshot pages still use raw `fetch`.** Migrating them to
  `@cappa/client` is worthwhile but is not what this phase is for; the capture
  surface goes through the client, and the two coexist. Listed as a follow-up.
- **Failures are shown inline, not only as a toast.** Writing the test for a
  rejected run exposed that `Toaster` lives in `Layout`, so a page rendered on
  its own drops the toast entirely — and more importantly, a toast is missable.
  The page now renders the reason inline as well.
- **`next`/`prev` now come through the protocol** (added in Phase 4), which is
  what keeps the detail page's arrow-key navigation working through the client.

**Verification.** 137 web tests (up from 83): 21 for the reducer, 14 for
`CapturePanel`, 12 for `RunView`, 7 for the page driving the real client against
msw, plus the existing suite unchanged. Lint, `tsc` and the full repo suite
green.

Then the built UI was driven in a real browser against the real `cappa review`
server: the sidebar entry, discovery listing, a full run watched to completion
with correct per-task statuses and durations, live log output, a single-target
subset run capturing only what was selected, the screenshot list refreshing
itself afterwards, and the detail page's re-capture button running and
re-enabling — with no console or page errors.

**Note on running the web suite here.** `apps/web` tests need a Playwright
browser build this container does not ship (it has 1194, Playwright wants 1228).
That is pre-existing and unrelated to this change — it fails identically on a
clean checkout. Both the test suite and the browser smoke test were run against
a `PLAYWRIGHT_BROWSERS_PATH` pointed at an aliased browser directory; nothing in
the repo was changed to accommodate it.

## Phase 6 — CLI wiring, docs, release ✅

- [x] `cappa review`: builds a `LocalEngine` from the loaded config and passes it
      to `createServer`. New flags `--read-only`, `--port`, `--host`, `--token`.
      (Landed in Phase 3.)
- [x] Graceful shutdown: SIGINT/SIGTERM → close the server, then the engine,
      which aborts the active run and shuts the browser down.
- [x] `review.browserIdleTimeout` config option, threaded from `cappa.config.ts`
      through `@cappa/config` into `LocalEngine`.
- [x] `apps/docs`: new "Interactive UI" page (capturing, re-capture, one run at
      a time, the warm browser, read-only mode, exposing the UI beyond your
      machine, flags), plus the `cappa review` section in the CLI page and
      `review.browserIdleTimeout` in the configuration page. Sidebar updated.
- [x] Changesets for every phase; `@cappa/protocol`, `@cappa/client` and
      `@cappa/config` release at `0.1.0`.
- [x] `.changeset/config.json`: `@cappa/protocol` and `@cappa/client` joined the
      `@cappa/server`/`web` link group — the protocol version is part of the
      server's contract, so a client and a server from the same release always
      agree.
- [x] `pnpm attw` clean for all seven published packages.

**Findings**

- **The generated access token could be invisible.** `cappa review --host` prints
  the token as part of the URL via `logger.success`, which is info-level and
  therefore suppressed below `-l 3` — so a quieter log level produced a token the
  user could never see, locking them out of their own server. The URL is now
  repeated at warning level when the token was generated. Found by running the
  real binary at `-l 2`; no unit test would have caught it.
- **A failed server close could orphan the browser.** The first implementation
  used `try { server.close(); engine.close() } finally { exit }`, so a server
  that failed to close skipped the engine entirely and left Chromium running —
  exactly what the shutdown handler exists to prevent. The two closes are now
  independent, and the test asserts the engine still closes.

**Verification.** 607 tests across the repo, lint, `tsc`, `attw` and the docs
build all green. `changeset status` resolves cleanly.

CLI capture output is still identical to the pre-Phase-1 baseline apart from the
new `review.browserIdleTimeout` key appearing in the debug config dump — verified
by diffing the six parity scenarios with the config block excluded.

End-to-end against the real binary: read-only mode reports reduced capabilities
and refuses a run with `403`; a non-loopback bind generates a token, prints it
visibly at `-l 2`, rejects an unauthenticated request with `401` and accepts the
token as a header; and `SIGTERM` to a server holding a warm browser logs the
shutdown, exits, and leaves **zero** orphaned Chromium processes (six were
running beforehand).

---

## Follow-ups (explicitly not in this change)

- Migrate the existing screenshot pages in `apps/web` from raw `fetch` to
  `@cappa/client`, so the whole UI goes through one typed path.
- `RemoteEngine`-backed CLI: `cappa capture --server <url>`.
- A standalone `cappa serve` daemon (needs `@cappa/config`, which Phase 2 lands).
- `watch` mode — re-capture on file change, cheap once the browser stays warm.
- Object-storage `ScreenshotStore` implementation.
- WebSocket transport if multi-reviewer presence/locking becomes a requirement.
