# Interactive Capture UI

Drive the capture process from a local UI, not just the CLI — architected so the
capture engine and the UI can be split across a network later without a rewrite.

## Problem

Two things block an interactive UI today:

1. **The orchestrator is fused to the CLI.** `runCapture`
   (`packages/cli/src/commands/capture.ts`) owns discover → chunk → execute →
   report, but is welded to commander options, `chalk` formatting, `getLogger()`
   side effects, and `process.exit(1)`. There is no way to start a capture,
   observe it, or cancel it from anything that is not a terminal.
2. **The server is a snapshot renderer.** `createServer` receives a
   pre-computed `screenshots: Screenshot[]` array (built by
   `packages/cli/src/commands/review.ts` before boot) and stores it in a Fastify
   decorator. It has no notion of a workspace, of runs, or of re-reading disk.

A third constraint shapes everything: **plugins are live JS closures**, produced
by evaluating `cappa.config.ts`. They cannot be serialized. So whichever process
runs Playwright must also be the process that loaded the config. Any design that
assumes the server can be handed a config over the wire is wrong.

## Goals

- Start, observe, and cancel a capture run from the review UI.
- Capture a subset: a single screenshot, a plugin, or a glob of task ids.
- Live per-task progress and log streaming; the screenshot lists refresh when a
  run finishes.
- CLI and UI drive the **same** orchestrator — no duplicated capture logic and no
  divergence in behaviour between the two entry points.
- Local-only for now, but the seam between "thing that drives Playwright" and
  "thing that renders a UI" must be a real network-shaped boundary, so hosting
  the engine remotely later is a new implementation, not a refactor.

## Non-goals (this change)

- Actually running the engine remotely, auth/multi-tenancy, or a hosted service.
- Multi-project workspaces.
- Replacing the existing `capture` CLI command's terminal output.
- Object storage for screenshots (the interface lands; only the fs impl ships).

## Architecture

```
                       ┌──────────────────────────────────────────┐
   apps/web            │  Capture panel · run list · live log     │
                       └───────────────┬──────────────────────────┘
                                       │ @cappa/client (typed fetch + EventSource)
                                       │ ── implements CaptureEngine ──┐
                       ┌───────────────▼──────────────────────────┐   │
   @cappa/server       │  REST + SSE  ·  Workspace  ·  RunManager │   │  RemoteEngine
                       └───────────────┬──────────────────────────┘   │  (future: points at
                                       │ injected CaptureEngine       │   a remote server;
                       ┌───────────────▼──────────────────────────┐   │   same interface)
   @cappa/core         │  LocalEngine → CaptureRunner → Playwright │◄──┘
                       └──────────────────────────────────────────┘

   @cappa/protocol     wire contract (zod schemas + types) — shared by server, client, web
   @cappa/config       cappa.config.ts loading (jiti) — shared by cli and any future daemon
```

### `CaptureEngine` — the seam

One interface, two implementations. This is the whole point of the design.

```ts
// packages/core/src/engine/types.ts
export interface CaptureEngine {
  listTargets(opts?: { refresh?: boolean }): Promise<Target[]>;
  startRun(request: StartRunRequest): Promise<RunSummary>;
  getRun(id: string): Promise<RunDetail | undefined>;
  listRuns(): Promise<RunSummary[]>;
  cancelRun(id: string): Promise<void>;
  /** Replays from `sinceSeq`, then streams live. Returns an unsubscribe fn. */
  subscribeRun(
    id: string,
    onEvent: (event: RunEvent) => void,
    opts?: { sinceSeq?: number },
  ): () => void;
  listScreenshots(query?: ScreenshotQuery): Promise<Screenshot[]>;
  approve(names: string[]): Promise<ApproveResult>;
  close(): Promise<void>;
}
```

- `LocalEngine` (`@cappa/core`) wraps `CaptureRunner` + `ScreenshotFileSystem`
  in-process. Used by the CLI and by the local server.
- `RemoteEngine` (`@cappa/client`) is the same interface over HTTP + SSE. The web
  UI uses it today against `localhost`; pointing it at a remote host later is a
  base-URL change. The CLI can eventually accept `--server <url>` and get remote
  capture for free.

Because `RemoteEngine` must be implementable, the interface is deliberately
**serializable-in, serializable-out**: no `Page`, no `Browser`, no plugin objects
cross it. That constraint is what makes the boundary real rather than aspirational.

### `CaptureRunner` — extracted orchestrator

`packages/core/src/runner/`. Lifted verbatim from `runCapture`, minus the CLI
concerns. Owns the state machine and emits typed events:

```
idle → discovering → running → (completed | failed | cancelled)
```

Events (each carries a monotonic `seq` and `runId`):

```
run:start · discover:start · discover:complete · task:start · task:complete
task:failed · plugin:complete · log · run:complete · run:error · run:cancelled
```

`task:complete` carries the `ScreenshotCaptureResult` plus the derived category
(`new` / `changed` / `passed`), so the UI can update a row without re-listing.

Cancellation is an `AbortSignal` checked between tasks and threaded into
`page.goto`/`page.screenshot` timeouts. `registerSignalHandlers` stays in the CLI;
the runner exposes `abort()` and never touches `process`.

The CLI's `runCapture` becomes an event consumer: subscribe → render with chalk →
`process.exit(1)` on failure. Failure-report formatting, `describeChanges`, and
the `onFail` callback stay in the CLI, since they are presentation and user-config
concerns. Net effect: identical terminal behaviour, zero orchestration logic left
in `@cappa/cli`.

### Warm browser between runs

Today `ScreenshotTool.init()` / `.close()` bracket a single run. Interactively
that means paying ~1s of Chromium startup on every button press. `LocalEngine`
keeps the `ScreenshotTool` warm across runs behind an idle timeout (default 5 min,
`review.browserIdleTimeout`), and disposes it on server shutdown. `CaptureRunner`
therefore takes an already-initialised `ScreenshotTool` rather than constructing
one — the CLI keeps its init/close-per-run shape by simply not reusing the engine.

This also makes a future `watch` mode (re-capture on file change) nearly free.

### `@cappa/protocol` — the wire contract

New package, **zero runtime dependencies except `zod`**. No `node:*`, no
`playwright-core`. Holds:

- zod schemas + inferred types for every request/response body,
- the `RunEvent` discriminated union,
- the route table as string constants,
- a `PROTOCOL_VERSION` constant, surfaced on `GET /api/health` so a mismatched
  client fails loudly instead of mysteriously.

It exists as its own package rather than living in `@cappa/core` because
`@cappa/core` pulls `playwright-core` and native diff bindings — things a remote
UI client has no business installing. Publishing the contract separately is the
cheapest way to keep the client thin and to allow a non-TypeScript client later.

**Considered and rejected: tRPC.** It would collapse protocol + client into one
step, but it binds the wire format to TypeScript inference, makes a non-TS
consumer painful, and gives poor ergonomics for a long-lived event stream. Plain
REST + SSE with zod schemas is more code we control and less magic.

### Transport: SSE, not WebSocket

Commands go over `POST`; events come back over one `text/event-stream`. SSE wins
here because it is one-way (which is all the event feed needs), survives proxies
and corporate TLS terminators, auto-reconnects in the browser, and needs no extra
Fastify plugin.

Each event carries a monotonic `seq`, and the server keeps a bounded in-memory
event log per run (last 5k events). On reconnect the browser sends `Last-Event-ID`
automatically; the server replays from that seq. That makes a dropped connection
invisible to the user and costs ~30 lines.

WebSocket only becomes worth it if we later want bidirectional presence
(multiple reviewers, cursors, live approval locks). The protocol package is the
transport-agnostic part, so that swap does not touch the UI.

### `@cappa/server` — Workspace + RunManager

`createServer` changes shape:

```ts
createServer({
  engine: CaptureEngine,        // injected — local today, remote later
  outputDir: string,
  theme, diff, logger,
  readOnly?: boolean,           // disables all mutating + capture routes
})
```

The `screenshots: Screenshot[]` constructor arg goes away. A `Workspace` service
owns the screenshot index, rebuilds it from disk via `groupScreenshots` (which
moves from `@cappa/cli` to `@cappa/core`, where it belongs), and invalidates on
`run:complete`. `GET /api/screenshots` reads through the workspace instead of a
frozen array — which incidentally fixes the existing behaviour where the review UI
shows stale data if anything writes to `outputDir` while it is open.

Routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | `{ ok, protocolVersion, capabilities }` |
| `GET` | `/api/config` | theme + resolved diff + `readOnly` |
| `GET` | `/api/plugins` | discovered plugins, name + description |
| `GET` | `/api/targets` | discovered tasks (cached; `?refresh=1` re-discovers) |
| `POST` | `/api/runs` | start a run → `{ runId }` |
| `GET` | `/api/runs` | run history (in-memory, this process) |
| `GET` | `/api/runs/:id` | run detail incl. per-task status |
| `POST` | `/api/runs/:id/cancel` | abort |
| `GET` | `/api/runs/:id/events` | **SSE** stream, `Last-Event-ID` aware |
| `GET/PATCH/POST` | `/api/screenshots…` | unchanged, now workspace-backed |

`StartRunRequest`:

```ts
{ plugins?: string[]; filter?: string; taskIds?: string[]; clearActual?: boolean }
```

`taskIds` is what powers the per-screenshot "re-capture this one" button;
`filter` reuses the existing `path.matchesGlob` semantics from `filterTasks`.

Concurrency policy: **one run at a time per workspace.** A second `POST /api/runs`
while a run is active returns `409` with the active run id. Queuing is a later
problem and not one worth inventing now; the browser pool is the real constraint.

### `@cappa/config`

`packages/cli/src/features/config/` moves to its own package. The CLI keeps
behaviour; the value is that a future standalone `cappa serve` daemon (which must
load `cappa.config.ts` itself, per the closure constraint above) has somewhere to
get it from without depending on `@cappa/cli`. Small, mechanical, and it stops
`jiti` leaking into `@cappa/server`.

### Storage seam (interface only)

`ScreenshotFileSystem` is local-fs by construction. Introduce a `ScreenshotStore`
interface (`has`/`read`/`write`/`list`/`remove` over buffers + relative keys) with
`FsScreenshotStore` as the only implementation. No behaviour change; it just means
a remote engine writing to S3 later is an implementation, not a fork. Explicitly
**not** implementing a second store in this change.

### `apps/web`

New "Capture" surface, built on `@cappa/client` wrapped in react-query hooks
(`useTargets`, `useStartRun`, `useRunEvents`, `useCancelRun`):

- **Capture panel** — plugin/target picker with glob filter, Start / Cancel.
- **Live run view** — progress bar, per-task rows flipping
  pending → running → passed/changed/new/failed, streaming log pane.
- **Re-capture button** on each screenshot row and on the detail page — a
  `taskIds: [id]` run of one.
- Screenshot queries invalidate on `run:complete`.
- Read-only mode hides the whole surface (driven by `GET /api/config`).

The web app never imports `@cappa/core` for capture — only `@cappa/protocol`
types via `@cappa/client`. That is the enforcement mechanism for the boundary:
if the UI cannot reach into node, the split stays honest.

### CLI

- `cappa review` keeps its name and gains capture (it is already "open the UI").
  New `--read-only` flag for serving CI artifacts, and `--port`/`--host`.
- `cappa capture` unchanged externally; internally a `CaptureRunner` consumer.

### Security

The server drives a real browser and writes to the filesystem — meaningfully more
dangerous than the current read-mostly review server, and worth being explicit
about before it ships:

- Bind `127.0.0.1` by default.
- Binding a non-loopback `--host` requires a token (`--token`, or auto-generated
  and printed in the startup URL); the token gates every `/api/*` route.
- Validate `taskIds` against discovered targets — never navigate to a
  client-supplied URL. The UI selects from what `discover` produced; it does not
  supply URLs.
- `--read-only` refuses capture, approval, and mutation routes outright.

## Rollout

Six phases, each independently mergeable and green. Phases 1–2 are pure
refactors with no user-visible change, which keeps the risky part (behaviour
parity of the extracted orchestrator) isolated from the feature work.

See `tasks.md`.

## Risks

- **Behaviour drift when extracting the orchestrator.** Mitigation: extract
  verbatim first with no feature added; the existing `capture.test.ts` cases move
  with the code and the CLI keeps a thin snapshot test of its rendering.
- **Warm-browser leakage.** A long-lived Chromium accumulating contexts/pages is a
  real memory risk. Mitigation: idle timeout, dispose contexts between runs while
  keeping the browser process, and an explicit `close()` on server shutdown.
- **Scope creep into a hosted product.** Mitigation: the remote engine is
  explicitly out of scope here; only the interface and the protocol package ship.
