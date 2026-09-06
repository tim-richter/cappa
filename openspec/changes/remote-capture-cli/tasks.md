# Tasks — Engine-Backed CLI and Remote Capture

Each phase independently mergeable and green (`pnpm lint`, `pnpm tsc`,
`pnpm test`). Phase 1 must not change `cappa capture` output.

---

## Phase 0 — Unblock the parity harness

`interactive-capture-ui` Phase 1 could not verify parity against
`examples/storybook`: its Storybook build fails on `require.resolve` in an ESM
config, so a hand-written fixture project stood in. `examples/storybook-10`
already has the correct form. Porting it costs three lines and gives this change
a real project to diff against.

- [ ] `examples/storybook/.storybook/main.ts`: replace `require.resolve` with
      `import.meta.resolve` + `fileURLToPath`, matching
      `examples/storybook-10/.storybook/main.ts`.
- [ ] Confirm `pnpm -F @cappa/example-storybook build-storybook` succeeds and
      `cappa capture` runs against it.
- [ ] Record the six-scenario baseline (all-new, all-passed, `--filter`,
      changed, deleted baseline, filter matching nothing) against this example
      and against the existing fixture, so both are available for diffing.

## Phase 1 — `cappa capture` drives a `CaptureEngine`

No user-visible change. Output must be byte-identical to the recorded baseline.

- [ ] `@cappa/config`: export `configToEngineOptions(config)`, the option
      mapping duplicated today in `capture.ts:231` and `review.ts:96`. Both
      commands call it.
- [ ] Rewrite `runCapture` to build a `LocalEngine`, `startRun`, `subscribeRun`
      with `renderRunEvent`, and take failure data from `getRun(id)` instead of
      `runner.getDetail()`.
- [ ] Replace `collectScreenshots(config.outputDir)` with
      `engine.listScreenshots()` for the `onFail` payload and the changed report.
- [ ] `engine.close()` in a `finally`; assert no live handles keep the process
      alive after a run (the warm browser's idle timer is the thing to watch).
- [ ] Keep `registerSignalHandlers` behaviour: `SIGINT` closes and exits 130.
      Wire it to `engine.close()` now that the engine owns the browser.
- [ ] Tests: `capture.test.ts` moves onto a fake engine; assert the rendered
      output for each event type is unchanged.
- [ ] Diff all six parity scenarios against the Phase 0 baseline. Byte-identical
      apart from durations and absolute paths.

## Phase 2 — `cappa serve`

- [ ] Extract a shared `startServer({ config, host, port, readOnly, token, ui })`
      helper from `commands/review.ts`; `review` becomes a thin caller.
- [ ] New `cappa serve` command: `--port`, `--host`, `--token`, `--read-only`,
      `--no-ui`. Off loopback a token is **required**, never generated — error
      out with a message naming `--token` / `CAPPA_TOKEN`.
- [ ] `--token` falls back to `CAPPA_TOKEN` on both `serve` and `review`, so a
      token need not appear in the process list.
- [ ] `--no-ui` skips the static-file registration; `/api/*` unchanged.
- [ ] Reuse `registerShutdownHandlers` — a `SIGTERM`'d `serve` must leave zero
      orphaned Chromium processes, as Phase 6 verified for `review`.
- [ ] Tests: token required off loopback, `--no-ui` serves the API and 404s the
      index, shutdown closes the engine.
- [ ] Changeset (`@cappa/cli` minor).

## Phase 3 — `cappa capture --server`

- [ ] `--server <url>` and `--token <token>` on `capture`; build a `RemoteEngine`
      via `createClient` instead of a `LocalEngine`. Everything downstream is
      unchanged.
- [ ] Pre-flight `GET /api/health`: distinct errors for unreachable host, bad
      token (`401`), protocol mismatch, and `capabilities.capture: false`.
- [ ] Narrowing zod parse for `diffMeta.interpretation` in
      `utils/describeChanges.ts`; omit the region list when it does not match,
      keep diff stats. Local behaviour unchanged.
- [ ] `onFail` under `--server`: absolute path fields `undefined`, one
      warning-level log explaining why. Refuse nothing — the callback still runs.
- [ ] `SIGINT` under `--server` calls `cancelRun` and waits for the terminal
      event (bounded, ~5s) before exiting 130; a second `SIGINT` exits at once
      with a warning that the remote run may continue.
- [ ] Reject `--server` together with flags that only mean something locally,
      with a message rather than silent no-op.
- [ ] Tests against a live `@cappa/server` with a scripted engine: identical
      rendered output to a local run over the same event sequence, exit code 1
      on failure, cancellation, each pre-flight error.
- [ ] Changeset (`@cappa/cli` minor).

## Phase 4 — Docs and end-to-end

- [ ] `apps/docs`: `cappa serve` in the CLI page; a "Remote capture" section
      covering the two-machine setup, tokens, the config-locality constraint
      (the host loads its own `cappa.config.ts`), and the two documented
      differences — `onFail` absolute paths and best-effort diff regions.
- [ ] End-to-end on two ports as two machines: `cappa serve --token` on one,
      `cappa capture --server --token` on the other. Verify a full run, live
      output, a failing run's report and exit code, `409` on a concurrent run,
      Ctrl-C cancellation, and a `--read-only` host refused at pre-flight.
- [ ] Full suite, `pnpm lint`, `pnpm tsc`, `pnpm attw` green.

---

## Follow-ups (not in this change)

- Remote `cappa approve` and `cappa status` — both are already engine methods
  (`approve`, `listScreenshots`); only the commands are still filesystem-bound.
- Pulling remote artifacts locally (`cappa pull --server`) so `onFail` uploads
  and local diff viewing work against a remote host.
- Run queuing instead of `409`, once more than one client shares a host.
