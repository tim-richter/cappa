# Engine-Backed CLI and Remote Capture

Make `cappa capture` drive a `CaptureEngine` rather than a `CaptureRunner`, then
let that engine be a remote one: `cappa capture --server <url>` against a
`cappa serve` host.

## Problem

`interactive-capture-ui` built the seam and proved it works — `LocalEngine` and
`RemoteEngine` are interchangeable, and the web UI already drives captures
through the latter. Two things are left over.

**The CLI never got moved onto the seam.** `runCapture`
(`packages/cli/src/commands/capture.ts:230`) constructs a `ScreenshotTool` and a
`CaptureRunner` by hand, while `cappa review` constructs a `LocalEngine` that
constructs the same two things internally. So there are two ways to start a run
in this repo, and the CLI's is the one that skips the engine's concurrency
guard, target cache, warm browser and typed errors. Phase 1 unified the
*orchestrator*; the *engine* is still only used by the server.

**Nothing can host or reach a remote engine.** `RemoteEngine` exists and is
tested against a real server, but the only thing that speaks it is the browser,
and the only thing that serves it is `cappa review` — a command whose name and
output assume a human about to open a URL. There is no way to run the browser on
one machine and the CI job on another, which was the whole point of making the
boundary network-shaped.

The gap between them is small, and closing it is what turns the Phase 2–4 work
from architecture into a feature.

## Goals

- One code path from `cappa capture` to a run, whether the engine is local or
  remote.
- `cappa capture --server <url> [--token <token>]` produces the same terminal
  output, exit code and failure report as a local capture.
- `cappa serve` hosts an engine for that, without the review-UI framing.
- No change to `cappa capture` with no flags — output stays byte-identical to
  the pre-Phase-1 baseline.

## Non-goals

- Multi-tenancy, user accounts, or anything beyond the single shared token the
  server already has.
- Queuing concurrent runs — the server still answers `409`.
- Uploading a local `cappa.config.ts` to a remote host. Plugins are live
  closures; the host loads its own config. This constraint is unchanged and
  non-negotiable.
- Remote `cappa approve` / `cappa status` (see follow-ups).

## Approach

### `runCapture` becomes an engine consumer

```ts
const engine = options.server
  ? createClient({ baseUrl: options.server, token })   // RemoteEngine
  : new LocalEngine({ ...configToEngineOptions(config) });

const run = await engine.startRun({ filter: options.filter, clearActual: true });
const unsubscribe = engine.subscribeRun(run.id, renderRunEvent);
```

`renderRunEvent`, `generateFailureReportMessage`, `describeChanges` and the
`onFail` plumbing stay exactly where they are — they consume events and a
`RunDetail`, both of which cross the wire already. The terminal rendering does
not learn that the engine moved.

Two mechanical consequences:

- **`configToEngineOptions`** — the option mapping is currently duplicated
  between `capture.ts:231` and `review.ts:96`. It becomes one exported helper in
  `@cappa/config`, which is where the config already lives.
- **Failure data comes from `getRun(id)`, not `runner.getDetail()`.** Same
  fields (`failures`, `deletedScreenshots`), already in the protocol.

### Two places where remote is genuinely different

Both are worth deciding here rather than discovering in review.

**1. `describeChanges` and the opaque interpretation.** The changed-screenshot
report reads `diffMeta.interpretation` and renders regions. Phase 2 deliberately
left that field `unknown` in the protocol, because its shape belongs to
`@blazediff/core-native` and pinning it would make every diff-engine bump a
breaking protocol change. That decision was right and stands — but it means a
remote engine hands the CLI an `unknown` where `describeChanges` wants an
`InterpretResult`.

The fix is a narrowing parse in the CLI: a zod schema for the interpretation
shape *the reporter actually reads*, applied to whatever came back, with the
region list omitted when it does not match. Diff stats (pixels, percentage)
are typed in the protocol and always render. A remote capture therefore reports
"what failed" identically and "where it changed" on a best-effort basis, and
says so rather than throwing. Local capture is unaffected — it narrows a value
that already matches.

**2. `onFail` and absolute paths.** `executeOnFailCallback` resolves
`absoluteActualPath` / `absoluteExpectedPath` / `absoluteDiffPath` against the
local `outputDir`. With a remote engine those files are on another machine and
those paths would be fiction. So: with `--server`, the absolute fields are
`undefined` and the callback gets the relative paths plus the run detail, and
`--ci --server` logs once, at warning level, that absolute paths are
unavailable. Silently handing a callback paths that do not exist is the one
outcome worth ruling out — it would produce uploads of nothing.

Also replace `collectScreenshots(config.outputDir)` with
`engine.listScreenshots()`. It is the same data through the seam, works for both
engines, and removes the CLI's last direct filesystem read during capture.

### `cappa serve`

`cappa review` minus the assumption that a person is about to open a browser:

| | `review` | `serve` |
| --- | --- | --- |
| Static UI | served | `--no-ui` to skip |
| Default host | `127.0.0.1` | `127.0.0.1` |
| Token off loopback | generated, printed in a URL | **required**, never generated |
| Output | "Review UI available at …" | one structured line, then quiet |
| Lifetime | until Ctrl-C | until Ctrl-C or `SIGTERM` |

The implementation is a shared `startServer` helper both commands call;
`serve` is ~40 lines of flag handling, not a new subsystem. The token difference
is the one deliberate divergence: `review` generates a token because a human is
reading the URL it prints, and `serve` has no such reader — generating one there
would produce a daemon nobody can authenticate against.

`--token` on either command also reads `CAPPA_TOKEN` from the environment, so a
CI job does not put the token in its process list.

### Health check before the run

`--server` calls `GET /api/health` first. It is one request, it surfaces a
protocol mismatch, a wrong URL and a bad token as three distinct messages before
any capture starts, and it lets the CLI refuse early when the host reports
`capabilities.capture: false` (a `--read-only` server). The client already
performs the version handshake on first call; this makes the failure legible
instead of arriving mid-run.

## Rollout

Three phases. Phase 1 is a behaviour-preserving refactor and is the risky one,
so it ships alone — same shape as `interactive-capture-ui` Phase 1, for the same
reason.

See `tasks.md`.

## Risks

- **Capture output drift.** The CLI's output is its contract and has been
  byte-stable across six phases. Mitigation: the six-scenario parity harness
  from Phase 1 runs again, and this time against a working
  `examples/storybook` — see the Phase 0 task, which fixes the ESM bug that
  forced Phase 1 to use a hand-rolled fixture instead.
- **`LocalEngine` semantics leaking into one-shot capture.** The engine keeps a
  browser warm behind an idle timer; a CLI process must exit promptly.
  Mitigation: `capture` always `close()`s the engine in a `finally`, and a test
  asserts the process has no live handles afterwards.
- **A remote run outliving the CLI.** Ctrl-C locally does not stop a run on the
  host. Mitigation: `SIGINT` under `--server` calls `cancelRun` and waits
  briefly for the terminal event before exiting 130; a second `SIGINT` exits
  immediately and warns that the remote run may still be going.
