# Tasks — Engine-Backed CLI and Remote Capture

Each phase independently mergeable and green (`pnpm lint`, `pnpm tsc`,
`pnpm test`). Phase 1 must not change `cappa capture` output.

---

## Phase 0 — Unblock the parity harness ✅

- [x] Fix `examples/storybook` so its Storybook builds.
- [x] Confirm `pnpm -F @cappa/example-storybook build-storybook` succeeds and
      `cappa capture` runs against it.
- [x] Record the six-scenario baseline (all-new, all-passed, `--filter`,
      changed, deleted baseline, filter matching nothing) against this example
      and against a fixture project, so both are available for diffing.

**The ESM diagnosis was wrong.** `require.resolve` in `.storybook/main.ts` is
*correct* for this example: Storybook 9 bundles `main.ts` to CJS, where
`import.meta` is unavailable — porting the `storybook-10` form makes the build
fail with "`import.meta` is not available with the cjs output format". The
actual cause was dependency drift: Renovate had bumped `storybook` to 10.4.6 and
`@storybook/react-vite` to 10.5.0 while the addons stayed on 9.x. Storybook 10
loads `main.ts` as ESM, where `require` is undefined — hence the error attributed
to the config. The v10 core with v9 addons also produced a broken preview
(`MissingRenderToCanvasError`), so the build "succeeding" would not have been
enough on its own.

The fix is therefore in `package.json`, not `main.ts`, which is unchanged:
realign the example on a coherent Storybook 9 stack (`storybook`,
`@storybook/react-vite` and all three addons on `^9.1.20`), which is what
`CLAUDE.md` documents this example to be and what keeps it distinct from
`examples/storybook-10`. Also added the missing `react` / `react-dom`
dependencies — the example had only `@types/react` and was resolving the runtime
by hoisting — and an explicit `vite ^7` (Storybook 9 peers `vite ^5–^7`, so it
cannot take the v8 that `examples/storybook-10` uses).

**A second blocker: the example was not pixel-deterministic.** Headless
Chromium does not rasterise text bit-identically between process runs. Three
glyph-edge pixels in the two `Example/Page` stories flip between two values in
essentially every run (29 of 30 sampled), and against the example's original
`maxDiffPixels: 0` that reported a failed comparison — which would have made
every storybook baseline unreliable. `examples/storybook/cappa.config.ts` now
allows a small pixel budget, verified over 15 consecutive clean runs plus three
consecutive full harness passes. The pixels still flip; the tolerance is what
absorbs them, so this is structurally stable rather than luck.

Worth noting for later, both out of scope here:

- **CSS cannot fix this.** `-webkit-font-smoothing` is a no-op outside macOS.
  Disabling LCD text needs a Chromium launch flag, and `ScreenshotTool.init`
  calls `browserClass.launch({ headless })` with no `args` passthrough, so a
  user cannot set one. That is a real gap if screenshot determinism matters.
- **`@cappa/plugin-storybook` waits in the wrong order.** `plugin.ts` awaits
  `waitForVisualIdle(page)` *before* `waitForPlayFunctionCompletion(page, ...)`
  and never settles the page afterwards, so a story whose play function mutates
  the DOM races the screenshot. Not the cause of the flake above — it hits
  `Example/Page - Logged Out`, which has no play function — but it is a real
  ordering bug.

**The harness is committed** at `scripts/capture-parity/` (see its README)
rather than left as a throwaway, since Phase 1 has to diff against it:

- `run.mjs` drives six scenarios against a project and records or checks the
  normalised output and exit code of each. Normalisation masks only ANSI
  escapes, the repo root, the port and durations; whitespace stays
  byte-faithful, because consola's box padding is part of what is being
  defended.
- Two projects. `projects/fixture` is self-contained — a hand-written plugin
  over four local HTML pages, importing nothing, so a diff there points at the
  CLI. Its `execute` result shape mirrors both shipped plugins exactly,
  including `success: false` for a screenshot with no baseline. `storybook` is
  `examples/storybook` driven by the real plugin.
- Baselines for both projects are in `baselines/`.

Verified: `pnpm lint`, `pnpm tsc` and `pnpm test` green (one pre-existing flake
in `apps/web`'s `ScreenshotViewer.test.tsx`, unrelated — it passes on re-run and
no web code was touched). No changeset: `@cappa/example-storybook` is in the
changeset ignore list and `scripts/` is not a package.

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
