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

## Phase 1 — `cappa capture` drives a `CaptureEngine` ✅

No user-visible change. Output is byte-identical to the recorded baseline.

- [x] `@cappa/config`: export `configToEngineOptions(config)`, the option
      mapping duplicated today in `capture.ts:231` and `review.ts:96`. Both
      commands call it.
- [x] Rewrite `runCapture` to build a `LocalEngine`, `startRun`, `subscribeRun`
      with `renderRunEvent`, and take failure data from `getRun(id)` instead of
      `runner.getDetail()`.
- [x] Replace `collectScreenshots(config.outputDir)` with
      `engine.listScreenshots()` for the `onFail` payload and the changed report.
- [x] `engine.close()` in a `finally`; no live handles keep the process alive
      after a run.
- [x] Keep `registerSignalHandlers` behaviour: `SIGINT` closes and exits 130.
      Wired to `engine.close()` now that the engine owns the browser.
- [x] Tests: `capture.test.ts` drives `runCapture` against a fake engine.
- [x] Diff all six parity scenarios, both projects, against the Phase 0
      baseline. Byte-identical.

**Parity evidence.** All twelve scenarios (six × two projects) matched their
Phase 0 baselines byte-for-byte on the first run after the rewrite, and on four
further passes. Nothing in the recorded output moved.

**Deviations and findings**

- **`browserIdleTimeoutMs` is not part of `configToEngineOptions`.** It started
  there, but the two commands disagree about it for a reason rather than by
  accident: `review` wants the configured timeout, and a one-shot `capture`
  should keep no browser warm at all. Browser lifetime is a per-command policy,
  not a config-to-engine mapping, so both callers pass it explicitly. This also
  keeps the helper from depending on `config.review` for something capture does
  not care about.
- **`capture` passes `browserIdleTimeoutMs: 0`.** `WarmBrowser` already
  `unref()`s its idle timer, so a stray timeout could not have blocked exit —
  but `0` closes the browser at release rather than leaving an idle Chromium
  alive for the rest of the process. A passing run exits in ~1.3s wall with no
  lingering handles.
- **The run error has to be rebuilt.** `capture` has always let a plugin's
  exception escape, and the stack is the only signal for a plugin that blew up.
  The engine deliberately flattens errors so they can cross a network boundary,
  so `runCapture` reinstates name, message and stack from `SerializedError`
  before rethrowing. Same console output, one indirection.
- **`registerSignalHandlers` is now typed structurally** (`{ close(): Promise<void> }`)
  rather than against `ScreenshotTool`, so it takes whatever owns the browser —
  the engine now, a remote engine in Phase 3 — without special-casing.
- **`outputDir` is resolved to an absolute path** in the shared mapping, which
  is what `review` already did. `ScreenshotFileSystem` and `groupScreenshots`
  both `path.resolve` internally, so this changes nothing; it was verified by
  the parity run rather than assumed.
- **`index.test.ts`'s nine capture tests were white-box tests of the old
  wiring** — they asserted on the `ScreenshotTool` and `ScreenshotFileSystem`
  instances `capture.ts` used to construct directly. Rather than delete them or
  let them assert against an inert double, its `LocalEngine` mock became a
  functional stand-in that drives the *real* `CaptureRunner` over the mocked
  browser layer. The tests keep their meaning and now exercise the new code
  path. The real `LocalEngine` cannot be used there directly: it reaches for
  `ScreenshotTool` and `ScreenshotFileSystem` through relative imports that a
  package-level `vi.mock` does not intercept.

**Verification.** 641 tests across the repo (CLI 65 → 71, config 12 → 20),
`pnpm lint`, `pnpm tsc` and `pnpm build` green, plus the twelve parity scenarios.

## Phase 2 — `cappa serve` ✅

- [x] Extract a shared `startServer({ config, host, port, readOnly, token, ui })`
      helper from `commands/review.ts`; `review` becomes a thin caller.
- [x] New `cappa serve` command: `--port`, `--host`, `--token`, `--read-only`,
      `--no-ui`. Off loopback a token is **required**, never generated — errors
      out with a message naming `--token` / `CAPPA_TOKEN`.
- [x] `--token` falls back to `CAPPA_TOKEN` on both `serve` and `review`.
- [x] `--no-ui` skips the static-file registration; `/api/*` unchanged.
- [x] Reuse `registerShutdownHandlers` — a `SIGTERM`'d `serve` leaves zero
      orphaned Chromium processes.
- [x] Tests: token required off loopback, `--no-ui` serves the API and 404s the
      index, shutdown closes the engine.
- [x] Changeset (`@cappa/cli` minor).

**Deviations and findings**

- **`--no-ui` needed a new server option, not `isProd: false`.** `createServer`
  gated the UI's static files on `opts.isProd ?? NODE_ENV === "production"`,
  which conflates "serve the baked UI" with "run in production mode" and can be
  flipped by an environment variable. Added an explicit `ui?: boolean` that
  defaults to whatever `isProd` resolves to, so `review` is unchanged and
  `serve --no-ui` turns off exactly one thing. Only the UI root and the SPA
  fallback are skipped; the screenshot asset route is unrelated and stays.
- **The token policy stayed in the commands.** `startServer` takes an
  already-resolved token rather than deciding. The two policies differ
  deliberately, and folding the decision into the shared helper would hide the
  one thing about these commands worth reading.
- **`ResolvedUserConfig` was lying about `review`.** It was
  `Required<Omit<UserConfig, "onFail">>`, and `Required` is shallow — so
  `config.review.port` typed as `number | undefined` even though `getConfig`
  always fills all three review fields. That was invisible while `review` passed
  the value straight to Fastify (which accepts `undefined`), and surfaced as
  soon as the shared helper wanted a real `number`. Fixed at the source rather
  than re-applying defaults the config had already applied.
- **`registerShutdownHandlers` moved to `utils/server.ts`** alongside
  `startServer`, and its tests moved with it (`commands/review.test.ts` →
  `utils/server.test.ts`) to keep the co-location convention.

**Verification.** Beyond the suite: ran `cappa serve --no-ui` against the parity
fixture and confirmed `/api/health` and `/api/plugins` answer while `/` 404s;
started a real capture run through `POST /api/runs`, then `SIGTERM`'d the
process with a six-process Chromium tree alive and confirmed it dropped to zero.
Off loopback with no token exits 1 with the expected message; with
`CAPPA_TOKEN=s3cret` the API returns 401 unauthenticated, 200 with the header,
401 with a wrong token. 660 tests, `pnpm lint`, `pnpm tsc` and `pnpm attw` green,
and the twelve capture-parity scenarios still match — this phase does not touch
capture.

Docs for `serve` are Phase 4's task and are not included here.

## Phase 3 — `cappa capture --server` ✅

- [x] `--server <url>` and `--token <token>` on `capture`; build a `RemoteEngine`
      via `createClient` instead of a `LocalEngine`. Everything downstream is
      unchanged.
- [x] Pre-flight `GET /api/health`: distinct errors for unreachable host, bad
      token (`401`), protocol mismatch, and `capabilities.capture: false`.
- [x] Narrowing zod parse for `diffMeta.interpretation` in
      `utils/describeChanges.ts`; omits the region list when it does not match,
      keeps diff stats. Local behaviour unchanged.
- [x] `onFail` under `--server`: absolute path fields `undefined`, one
      warning-level log explaining why. The callback still runs.
- [x] `SIGINT` under `--server` calls `cancelRun` and waits for the terminal
      event (bounded, 5s) before exiting 130; a second `SIGINT` exits at once
      with a warning that the remote run may continue.
- [x] Reject `--server` together with flags that do not apply.
- [x] Tests against a live `@cappa/server` with a scripted engine: identical
      rendered output to a local run over the same event sequence, exit code 1
      on failure, cancellation, each pre-flight error.
- [x] Changeset (`@cappa/cli` minor).

**Deviations and findings**

- **No capture flag is actually local-only.** The task anticipated some, but
  `--filter` crosses the wire, `--ci` runs `onFail` (with the documented path
  caveat), and `--max-regions` is CLI-side rendering that works fine against a
  remote host. An empty conflict list would have been dead code. The real
  silent no-op is the *config*: the host loads its own `cappa.config.ts`, so
  every local capture setting is ignored. `--server` now says so in one line.
  The one genuine flag conflict is the inverse — `--token` without `--server`
  does nothing at all — and that is rejected.
- **A concurrent run printed a raw stack trace.** `startRun` against a busy host
  throws the client's `RunInProgressError`, which escaped `runCapture` and gave
  the user a Node crash dump for what is the host's deliberate one-run-at-a-time
  design. Reproduced by racing two remote captures, then fixed: it gets a
  sentence naming the active run. Duck-typed on `status === 409` rather than
  `instanceof`, for the dual ESM/CJS reason the client already documents.
- **Cancellation had an ordering bug, found by the test.** `cancelRemoteRun`
  originally raced `cancelRun` against a timeout, then let the handler close the
  engine — but closing aborts the event stream, so the CLI tore the connection
  down while the host was still winding the run down and never learned whether
  it stopped. It now awaits `cancelRun` and then the run's *terminal event*,
  bounded at 5s. Invisible in a live test, where `process.exit` really exits;
  visible immediately once `process.exit` was mocked.
- **`registerSignalHandlers` gained a pre-close hook** and `process.on` instead
  of `process.once`, so a second signal reaches the handler and exits at once.
  Close and exit now land a tick later than the signal, which its existing tests
  had to be taught.

**The one place output is not identical, and it is not fixable here.**
`ScreenshotTool` writes some lines straight to its own logger rather than
through the run's event stream: `Screenshot saved`, `Screenshot passed/failed
visual comparison`, and the retry warnings. Those stay in the *host's* stdout.
Verified by diffing local against remote for both an all-new and a changed run:
the task progress, the plugin-completion line, the failure report, the changed
report and the exit code all match exactly; only that running commentary is
missing.

Closing the gap means routing `ScreenshotTool`'s logging through the runner so
it becomes `log` events. That needs a logger seam in `ScreenshotTool`, and — the
blocker — `RunLogLevel` is `debug | info | warn | error` while those calls are
`success`. Widening it changes the wire contract and needs a `PROTOCOL_VERSION`
bump, so it is a deliberate decision rather than something to slip into this
phase. Flagged for the maintainer.

**Verification.** Beyond the 672-test suite: ran `cappa serve` and
`cappa capture --server` as two processes and diffed the output against a local
run for all-new and changed scenarios; confirmed the four pre-flight errors, a
`409` on two racing captures, `CAPPA_TOKEN` end to end, and a `SIGINT` that left
the host reporting `state=cancelled` at 1/8 tasks. The twelve capture-parity
scenarios still match, so the local path is untouched.

## Phase 4 — Docs and end-to-end ✅

- [x] `apps/docs`: `cappa serve` on the CLI page, `--server` under `capture`,
      and a "Remote capture" guide covering the two-machine setup, tokens, the
      config-locality constraint and the two documented differences.
- [x] End-to-end on two ports as two machines: a full run, live output, a
      failing run's report and exit code, `409` on a concurrent run, Ctrl-C
      cancellation, and a `--read-only` host refused at pre-flight.
- [x] Full suite, `pnpm lint`, `pnpm tsc`, `pnpm attw` green.

**The end-to-end is committed**, at `scripts/remote-capture-e2e.mjs`, rather
than run once by hand. It starts two `cappa serve` processes (one token-gated,
one `--read-only`) plus the fixture's page server, drives the real CLI against
them, and asserts 21 things — including the ones no unit test reaches: that the
host actually wrote the screenshots, that a cancelled run reaches `state:
cancelled` on the host, and that `SIGTERM`ing both hosts leaves zero Chromium
processes behind.

**Deviations and findings**

- **The first e2e run failed four checks, all in cancellation.** Interrupting on
  a fixed 700ms delay raced the fixture — it captures four local HTML pages in
  under a second, so the run had already finished. Now it polls `/api/runs` and
  signals the moment a run is actually in flight, and asserts separately that
  there *was* one to interrupt, so a future timing change fails loudly instead
  of silently testing nothing.
- **The orphaned-browser check needed a settle window.** A browser tree takes a
  moment to disappear after its parent exits, so counting immediately reported
  processes that were already dying. It now retries for up to five seconds — a
  leak stays leaked, a dying process does not.
- **Docs gained a page rather than a section.** The remote-capture material —
  two-machine setup, tokens, config locality, the two differences, cancellation,
  read-only hosts — did not fit as a subsection of the CLI page without burying
  it. `remote-capture.mdx` is linked from `capture --server` and sits in the
  Guides sidebar next to Interactive UI.

**Verification.** 672 tests, `pnpm lint`, `pnpm tsc`, `pnpm attw` and the docs
build all green; the twelve capture-parity scenarios still match; the
21-check end-to-end passes on consecutive runs.

## Follow-ups (not in this change)

- Remote `cappa approve` and `cappa status` — both are already engine methods
  (`approve`, `listScreenshots`); only the commands are still filesystem-bound.
- Pulling remote artifacts locally (`cappa pull --server`) so `onFail` uploads
  and local diff viewing work against a remote host.
- Run queuing instead of `409`, once more than one client shares a host.
