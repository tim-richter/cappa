# Capture Watch Mode

Re-capture on file change, from both the CLI and the review UI. Nearly free now
that `LocalEngine` keeps a browser warm between runs.

## Problem

The inner loop for someone actually fixing a visual regression is: change a
component, run `cappa capture -f 'Button/*'`, look at the diff, repeat. Every
iteration pays Chromium startup, plugin discovery and a full command invocation
to re-capture a handful of screenshots.

`interactive-capture-ui` removed the two expensive parts of that — the browser
stays warm behind an idle timeout, and discovery results are cached — but only
for a run someone starts by hand. Nothing watches.

The listed follow-up says watch mode is "cheap once the browser stays warm",
which is true of the *running* part and not of the interesting part: **knowing
which tasks a changed file affects.** A watcher that re-runs everything on every
save is a worse experience than the manual loop it replaces, because a full run
takes longer than the edit-to-check cycle it is meant to shorten.

## Goals

- `cappa capture --watch` re-captures affected tasks on file change, holding one
  browser open across iterations.
- The same thing from the review UI: a watch toggle, with results streaming into
  the run view already built for this.
- Precise task selection where a plugin can provide it; an honest, debounced
  full re-run where it cannot.
- Watch is a mode of the existing engine, not a second orchestrator.

## Non-goals

- Watching under `--server` — a remote host cannot see local files. `--watch`
  and `--server` are mutually exclusive and error out together.
- Watching in CI. `--watch` and `--ci` are mutually exclusive.
- Auto-approval on change. Watch captures; a human still approves.
- Hot-reloading `cappa.config.ts` itself (see follow-ups).

## Approach

### The task-mapping problem, and how plugins solve it

Cappa has no idea that `src/Button.stories.tsx` produces the tasks
`Button/Primary` and `Button/Secondary`. The plugin does. So `PluginDef` gains
one optional member:

```ts
watch?: {
  /** Globs, relative to cwd, whose changes this plugin cares about. */
  paths: string[];
  /**
   * Map a changed file to the task ids it affects.
   * `null` means "cannot tell" → re-discover and run everything this plugin owns.
   */
  resolve(file: string, tasks: PluginTask[]): string[] | null;
};
```

Optional, so both shipped plugins and every third-party plugin keep working
untouched. A plugin without `watch` contributes its whole task set whenever
anything in the fallback watch set changes.

- **`@cappa/plugin-storybook`** can be precise. Storybook's story index already
  carries `importPath` per entry, which the discover phase reads. Keep it on the
  task, and `resolve` becomes a lookup from changed file to story ids. This is
  the case that makes watch mode worth building.
- **`@cappa/plugin-pages`** cannot. Its tasks are URLs; a page's source is
  behind a dev server the plugin knows nothing about. It ships no `watch`, and a
  change in the fallback set re-runs its pages. Honest, and correct.

### Watch lives in `LocalEngine`

```ts
engine.startWatch({ paths?, filter?, debounceMs? }): Promise<WatchSummary>
engine.stopWatch(): Promise<void>
```

A watch session owns a file watcher and a queue. On a settled batch of changes
it resolves the affected task ids across plugins and calls the existing
`startRun({ taskIds, clearActual: false })`. Every run is a normal run: same
events, same run store, same `409` guard, visible in `GET /api/runs` and in the
UI's run list. Watch is a *scheduler* for runs, not a parallel execution path —
that is what keeps it from becoming a second orchestrator with its own drift.

Two interactions with existing behaviour need deciding:

- **`clearActual: false`, always.** Clearing `actual/` on every save would delete
  the diffs the user is looking at for tasks they did not touch.
- **The idle timeout must not evict mid-watch.** `WarmBrowser`'s timer would
  close the browser between saves during a coffee break, and the next save would
  pay full startup. An active watch session holds a lease that suspends
  eviction, released by `stopWatch`. Without this, the feature's whole premise
  is defeated by its own idle handling.

A change arriving while a run is active is coalesced into one queued run rather
than rejected with `409` — the engine's single-run rule is preserved, and the
user gets the run they expect instead of a conflict error they did not cause.

### Wire and UI

New protocol events (`watch:start`, `watch:change`, `watch:stop`) and a
`capabilities.watch` flag. Both additive; `PROTOCOL_VERSION` stays at 1.

**Except that additive is not currently safe**, which is the one thing this
change must fix before it adds anything. `@cappa/client` parses each SSE frame
with `runEventSchema.safeParse` (`packages/client/src/client.ts:288`); an
unrecognised event type fails the discriminated union, is reported through
`onError`, and — the real problem — does not advance `lastSeq`. So an older
client against a newer server both spams errors and, on reconnect, replays from
a stale sequence number. Unknown events must be skipped while still advancing
`lastSeq`, so that adding an event type is genuinely backward compatible. That
is a small fix, it belongs to whichever change first adds an event, and this is
that change.

In the UI, watch is a toggle on the capture panel. The run view is reused
verbatim; the run list shows watch-triggered runs annotated with what changed.

### CLI

`cappa capture --watch [--filter <glob>]`: run once, then watch. Terse
per-iteration output (`↻ 3 tasks · Button/Primary changed`), a summary line, and
no `process.exit(1)` on failure — a failing screenshot in watch mode is the
thing you are working on, not a reason to quit. Ctrl-C stops the watcher, closes
the engine and exits 0.

### Considered and rejected

- **Watch as a separate `cappa watch` command.** It is `capture` with a
  scheduler; a separate command duplicates every capture flag.
- **Node's `fs.watch` directly.** Recursive watching is not portable and
  editors' atomic-save patterns produce spurious and missing events. Use
  `chokidar` — one dependency, catalog-pinned, and the thing every tool in this
  space already depends on.
- **Deriving affected tasks from the dev server's HMR graph.** Precise and far
  more coupling than a plugin-provided mapping is worth.

## Risks

- **Watch storms.** A branch switch or a formatter run touches hundreds of
  files. Mitigation: debounce (default 300ms), coalesce into one queued run,
  cap the resolved task set and fall back to a filtered full run above it.
- **A leaked watcher or browser.** A watch session holds a file watcher, a
  browser lease and a debounce timer. Mitigation: `stopWatch` on engine
  `close()`, on server shutdown, and on the client disconnecting; a test
  asserting no handles survive.
- **Precision that is quietly wrong.** A `resolve` that returns too few task ids
  produces a watch mode that misses regressions — worse than one that re-runs
  everything. Mitigation: `resolve` returning `null` is the documented default
  for uncertainty, and the storybook mapping is tested against a real story
  index including co-located and re-exported stories.
