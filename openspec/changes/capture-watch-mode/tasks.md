# Tasks — Capture Watch Mode

Each phase independently mergeable and green (`pnpm lint`, `pnpm tsc`,
`pnpm test`).

---

## Phase 0 — Make the event stream forward-compatible

Prerequisite for adding any event type. Ships on its own; fixes a real
compatibility gap regardless of watch mode.

- [ ] `packages/client/src/client.ts:288`: on a frame whose `type` is not in
      `runEventSchema`, skip it but still advance `lastSeq` from the frame's
      `id:`, so a reconnect does not replay from a stale sequence. Report it at
      most once per stream rather than per event.
- [ ] Keep genuine parse failures (a known type with a bad body) on the existing
      `onError` path — an unknown type and a malformed known type are different
      problems.
- [ ] Tests: an unknown event type does not stall `lastSeq`, does not surface
      per-event errors, and a subsequent resume asks for the right `sinceSeq`.
- [ ] Changeset (`@cappa/client` patch).

## Phase 1 — Plugin watch capability

- [ ] `packages/core/src/plugin.ts`: optional `watch: { paths, resolve }` on
      `PluginDef`. Types re-exported from `@cappa/core`.
- [ ] `resolve(file, tasks) => string[] | null`; `null` documented as "cannot
      tell — run everything this plugin owns".
- [ ] `@cappa/plugin-storybook`: carry `importPath` from the story index onto
      each discovered task; implement `watch` as a changed-file → story-id
      lookup. `paths` derived from the Storybook config's `stories` globs.
- [ ] `@cappa/plugin-pages`: no `watch`. Document why (its tasks are URLs with
      no local source).
- [ ] Tests: storybook `resolve` against a real index fixture, including
      co-located stories, re-exported stories, a file matching nothing, and a
      changed file that is not a story (returns `null`).
- [ ] `apps/docs`: plugin-authoring page gains the `watch` member.
- [ ] Changesets (`@cappa/core`, `@cappa/plugin-storybook` minor).

## Phase 2 — `startWatch` / `stopWatch` on `LocalEngine`

- [ ] `chokidar` added to the workspace catalog; `@cappa/core` dependency.
- [ ] `packages/core/src/engine/WatchSession.ts`: watcher, debounce (default
      300ms), change coalescing, task resolution across plugins.
- [ ] `LocalEngine.startWatch(options)` / `stopWatch()`; a watch session drives
      `startRun({ taskIds, clearActual: false })` — no second execution path.
- [ ] `WarmBrowser`: an eviction lease held by an active watch session, released
      on `stopWatch`. Test that a session outlives the idle timeout and the
      browser survives it.
- [ ] A change arriving during an active run is queued and coalesced, not
      rejected with `RunInProgressError`.
- [ ] Cap the resolved task set (default 200); above it, fall back to a full run
      under the session's `filter`.
- [ ] `close()` stops any active watch session.
- [ ] Tests: change → run, debounce coalescing, change-during-run queuing,
      `resolve` returning `null`, the task cap, no handles left after
      `stopWatch`, idle-eviction suspension.

## Phase 3 — `cappa capture --watch`

- [ ] `--watch` on `capture`; mutually exclusive with `--ci` and with `--server`
      (clear error, not a silent no-op).
- [ ] Run once, then watch. Terse per-iteration rendering; summary per
      iteration; no `process.exit(1)` on screenshot failure while watching.
- [ ] Ctrl-C stops the watcher, closes the engine, exits 0. No orphaned
      Chromium — the check Phase 6 of `interactive-capture-ui` established.
- [ ] Tests over a fake engine: rendering per iteration, flag conflicts, signal
      handling.
- [ ] Changeset (`@cappa/cli` minor).

## Phase 4 — Watch in the review UI

- [ ] Protocol: `watch:start` / `watch:change` / `watch:stop` events,
      `capabilities.watch`, `POST /api/watch` and `DELETE /api/watch`.
      `PROTOCOL_VERSION` stays 1 (additive only).
- [ ] Server routes, gated by `readOnly` like every other mutation.
- [ ] `@cappa/client`: `startWatch` / `stopWatch` on `RemoteEngine`.
- [ ] `apps/web`: watch toggle on `CapturePanel`; reuse `RunView` unchanged;
      annotate watch-triggered runs in the run list with the triggering change.
- [ ] Watch state survives a page reload (read it back from the server, do not
      keep it only in React state).
- [ ] msw handlers, Storybook stories, tests.
- [ ] Changesets (`@cappa/protocol`, `@cappa/client`, `@cappa/server`, `web`).

## Phase 5 — Docs and end-to-end

- [ ] `apps/docs`: watch mode section — the CLI flag, the UI toggle, what
      precise vs. full re-run means and which plugin gives you which.
- [ ] End-to-end against `examples/storybook` (working after
      `remote-capture-cli` Phase 0): edit a story, see only its screenshots
      re-captured; edit a shared component, see the fallback; switch branches and
      confirm the debounce coalesces rather than storming.
- [ ] Leave a watch session idle past `review.browserIdleTimeout` and confirm the
      next save does not pay browser startup.
- [ ] Full suite, `pnpm lint`, `pnpm tsc`, `pnpm attw` green.

---

## Follow-ups (not in this change)

- Reload `cappa.config.ts` on change — needs re-evaluating plugin closures and
  rebuilding the engine; a session-restart, not a hot reload.
- Watch-driven auto-approve for an explicitly opted-in glob.
- Surface `importPath` (and any future task provenance) in the UI so a task row
  can link to the file that produced it.
