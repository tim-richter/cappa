# Tasks — Capture Watch Mode

Each phase independently mergeable and green (`pnpm lint`, `pnpm tsc`,
`pnpm test`).

---

## Phase 0 — Make the event stream forward-compatible

Prerequisite for adding any event type. Ships on its own; fixes a real
compatibility gap regardless of watch mode.

- [x] `packages/client/src/client.ts:288`: on a frame whose `type` is not in
      `runEventSchema`, skip it but still advance `lastSeq` from the frame's
      `id:`, so a reconnect does not replay from a stale sequence. Report it at
      most once per stream rather than per event.
- [x] Keep genuine parse failures (a known type with a bad body) on the existing
      `onError` path — an unknown type and a malformed known type are different
      problems.
- [x] Tests: an unknown event type does not stall `lastSeq`, does not surface
      per-event errors, and a subsequent resume asks for the right `sinceSeq`.
- [x] Changeset (`@cappa/client` patch).

## Phase 1 — Plugin watch capability

- [x] `packages/core/src/plugin.ts`: optional `watch: { paths, resolve }` on
      `PluginDef`. Types re-exported from `@cappa/core`.
- [x] `resolve(file, tasks) => string[] | null`; `null` documented as "cannot
      tell — run everything this plugin owns".
- [x] `@cappa/plugin-storybook`: carry `importPath` from the story index onto
      each discovered task; implement `watch` as a changed-file → story-id
      lookup. `paths` derived from the Storybook config's `stories` globs.
- [x] `@cappa/plugin-pages`: no `watch`. Document why (its tasks are URLs with
      no local source).
- [x] Tests: storybook `resolve` against a real index fixture, including
      co-located stories, re-exported stories, a file matching nothing, and a
      changed file that is not a story (returns `null`).
- [x] `apps/docs`: plugin-authoring page gains the `watch` member.
- [x] Changesets (`@cappa/core`, `@cappa/plugin-storybook` minor).

## Phase 2 — `startWatch` / `stopWatch` on `LocalEngine`

- [x] `chokidar` added to the workspace catalog; `@cappa/core` dependency.
- [x] `packages/core/src/engine/WatchSession.ts`: watcher, debounce (default
      300ms), change coalescing, task resolution across plugins.
- [x] `LocalEngine.startWatch(options)` / `stopWatch()`; a watch session drives
      `startRun({ taskIds, clearActual: false })` — no second execution path.
- [x] `WarmBrowser`: an eviction lease held by an active watch session, released
      on `stopWatch`. Test that a session outlives the idle timeout and the
      browser survives it.
- [x] A change arriving during an active run is queued and coalesced, not
      rejected with `RunInProgressError`.
- [x] Cap the resolved task set (default 200); above it, fall back to a full run
      under the session's `filter`.
- [x] `close()` stops any active watch session.
- [x] Tests: change → run, debounce coalescing, change-during-run queuing,
      `resolve` returning `null`, the task cap, no handles left after
      `stopWatch`, idle-eviction suspension.

## Phase 3 — `cappa capture --watch`

- [x] `--watch` on `capture`; mutually exclusive with `--ci` and with `--server`
      (clear error, not a silent no-op).
- [x] Run once, then watch. Terse per-iteration rendering; summary per
      iteration; no `process.exit(1)` on screenshot failure while watching.
- [x] Ctrl-C stops the watcher, closes the engine, exits 0. No orphaned
      Chromium — the check Phase 6 of `interactive-capture-ui` established.
- [x] Tests over a fake engine: rendering per iteration, flag conflicts, signal
      handling.
- [x] Changeset (`@cappa/cli` minor).

## Phase 4 — Watch in the review UI

- [x] Protocol: `watch:start` / `watch:change` / `watch:stop` events,
      `capabilities.watch`, `POST /api/watch` and `DELETE /api/watch`.
      `PROTOCOL_VERSION` stays 1 (additive only).
- [x] Server routes, gated by `readOnly` like every other mutation.
- [x] `@cappa/client`: `startWatch` / `stopWatch` on `RemoteEngine`.
- [x] `apps/web`: watch toggle on `CapturePanel`; reuse `RunView` unchanged;
      annotate watch-triggered runs in the run list with the triggering change.
- [x] Watch state survives a page reload (read it back from the server, do not
      keep it only in React state).
- [x] msw handlers, Storybook stories, tests.
- [x] Changesets (`@cappa/protocol`, `@cappa/client`, `@cappa/server`, `web`).

## Phase 5 — Docs and end-to-end

- [x] `apps/docs`: watch mode section — the CLI flag, the UI toggle, what
      precise vs. full re-run means and which plugin gives you which.
- [x] End-to-end against `examples/storybook` (working after
      `remote-capture-cli` Phase 0): edit a story, see only its screenshots
      re-captured; edit a shared component, see the fallback; switch branches and
      confirm the debounce coalesces rather than storming.
- [x] Leave a watch session idle past `review.browserIdleTimeout` and confirm the
      next save does not pay browser startup.
- [x] Full suite, `pnpm lint`, `pnpm tsc`, `pnpm attw` green.

---

## How it landed, where it differs from the plan

- **`paths` widens, it never narrows.** `watch.resolve` is called for every
  changed file, not only for files matching the plugin's globs. A plugin that
  only saw its own globs would never be asked about the component its stories
  render — the fallback case the proposal depends on.
- **Storybook resolves an unknown file to `null`, including an unknown *story*
  file.** A story the index has never seen is what a freshly created story looks
  like, and answering "nothing to do" for it means saving a new story does
  nothing at all.
- **Mixed resolution expands to ids.** When one plugin names tasks and another
  needs everything it owns, one request cannot say both (`plugins` and `taskIds`
  compose as "and"), so the full plugin's discovered ids are expanded into the
  id list. The only thing this misses is a task created since that discovery,
  which the next iteration picks up.
- **`stopWatch` answers the status it left behind** rather than nothing: the
  caller's next question is "what is it doing now", and a `204` would need a
  second round-trip to answer it.
- **The run-list annotation lives on the run itself.** `StartRunRequest` gained
  an optional `trigger`, so `RunSummary.request` already carries what triggered
  a run and the run view renders it — no parallel lookup, and it works for any
  client reading the run list.
- **Two shutdown fixes came out of the end-to-end run.** A terminal's Ctrl-C
  reaches Chromium as well as cappa, so by the time the signal handler closes
  the browser every context is already gone; `ScreenshotTool.close` and both CLI
  signal handlers now treat that as the ordinary case instead of exiting with an
  uncaught exception.

---

## Follow-ups (not in this change)

- Reload `cappa.config.ts` on change — needs re-evaluating plugin closures and
  rebuilding the engine; a session-restart, not a hot reload.
- Watch-driven auto-approve for an explicitly opted-in glob.
- Surface `importPath` (and any future task provenance) in the UI so a task row
  can link to the file that produced it.
