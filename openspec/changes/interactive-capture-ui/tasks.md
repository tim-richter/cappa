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

## Phase 3 — `@cappa/server` becomes stateful

- [ ] `createServer` signature: drop `screenshots`, add `engine: CaptureEngine`
      and `readOnly?: boolean`.
- [ ] `Workspace` service: screenshot index rebuilt from disk, invalidated on
      `run:complete`. `/api/screenshots` reads through it.
- [ ] Routes: `GET /api/plugins`, `GET /api/targets` (`?refresh=1`),
      `POST /api/runs`, `GET /api/runs`, `GET /api/runs/:id`,
      `POST /api/runs/:id/cancel`.
- [ ] `GET /api/runs/:id/events` — SSE. `id:` on each frame from `seq`; honour
      `Last-Event-ID` for replay; heartbeat comment every 15s; clean teardown on
      client disconnect.
- [ ] `GET /api/health` returns `{ ok, protocolVersion, capabilities }`;
      `GET /api/config` gains `readOnly`.
- [ ] Validate every body against the `@cappa/protocol` zod schemas. Reject
      `taskIds` not present in the discovered target set.
- [ ] `readOnly` guard rejects capture/approve/mutation routes with `403`.
- [ ] Token auth: required when bound to a non-loopback host; gates `/api/*`.
- [ ] Tests: run lifecycle over HTTP with a fake engine, SSE framing + replay,
      409 on concurrent run, read-only rejections, auth.

## Phase 4 — `@cappa/client`

- [ ] New package `packages/client` (`@cappa/client`). Deps: `@cappa/protocol`.
      Isomorphic — `fetch` + `EventSource`, no node built-ins.
- [ ] `createClient({ baseUrl, token? })` implementing `CaptureEngine` as
      `RemoteEngine`; response parsing via the protocol schemas.
- [ ] `subscribeRun` over `EventSource` with `sinceSeq`, reconnect, and
      unsubscribe.
- [ ] Protocol-version check on first call; throw a clear error on mismatch.
- [ ] Tests against a real `@cappa/server` instance backed by a fake engine.

## Phase 5 — `apps/web` capture surface

- [ ] `src/api/client.ts` — module-level `createClient` pointed at same-origin.
- [ ] react-query hooks: `useTargets`, `useRuns`, `useRun`, `useStartRun`,
      `useCancelRun`, `useRunEvents` (SSE → local reducer, not query cache).
- [ ] `CapturePanel` — plugin/target picker, glob filter input, Start / Cancel.
- [ ] `RunView` — progress bar, per-task rows (pending → running → terminal
      status), streaming log pane with autoscroll.
- [ ] Re-capture button on screenshot rows and the detail page
      (`taskIds: [id]` run of one).
- [ ] Invalidate screenshot queries on `run:complete`.
- [ ] Hide the capture surface when `GET /api/config` reports `readOnly`.
- [ ] Route `/capture` + sidebar entry; msw handlers for the new endpoints;
      Storybook stories for `CapturePanel` and `RunView`; component tests.

## Phase 6 — CLI wiring, docs, release

- [ ] `cappa review`: builds a `LocalEngine` from the loaded config and passes it
      to `createServer`. New flags `--read-only`, `--port`, `--host`, `--token`.
- [ ] Graceful shutdown: SIGINT/SIGTERM → cancel active run → `engine.close()`.
- [ ] `apps/docs`: new "Interactive UI" page (capture from the UI, re-capture,
      read-only mode, security posture) + update the review and config pages for
      `review.browserIdleTimeout`.
- [ ] Changesets: minor for `@cappa/core`, `@cappa/server`, `@cappa/cli`; initial
      release entries for `@cappa/protocol`, `@cappa/client`, `@cappa/config`.
- [ ] `.changeset/config.json`: keep `@cappa/server`/`web` linked; decide whether
      `@cappa/protocol` and `@cappa/client` join that link group (they should —
      the protocol version is part of the server's contract).
- [ ] Verify `pnpm attw` passes for the three new packages.

---

## Follow-ups (explicitly not in this change)

- `RemoteEngine`-backed CLI: `cappa capture --server <url>`.
- A standalone `cappa serve` daemon (needs `@cappa/config`, which Phase 2 lands).
- `watch` mode — re-capture on file change, cheap once the browser stays warm.
- Object-storage `ScreenshotStore` implementation.
- WebSocket transport if multi-reviewer presence/locking becomes a requirement.
