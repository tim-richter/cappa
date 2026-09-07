# Capture-output parity harness

`cappa capture`'s terminal output is its contract. This harness pins that
contract: it runs the real CLI through six scenarios against two real projects
and records the normalised output and exit code of each, so a refactor that is
meant to be behaviour-preserving can be *shown* to be.

It exists for the engine-backed-CLI work (`openspec/changes/remote-capture-cli`),
where `runCapture` moves onto `CaptureEngine` without any user-visible change.

## Usage

```bash
pnpm build                                        # the harness runs the built CLI
pnpm -F @cappa/example-storybook build-storybook  # for the storybook project

node scripts/capture-parity/run.mjs --record      # write baselines
node scripts/capture-parity/run.mjs               # check against them
node scripts/capture-parity/run.mjs -p fixture -s changed,filter
```

A check run exits non-zero on any difference and writes the observed output
next to the baseline as `<scenario>.txt.actual` for diffing.

## Scenarios

| Scenario | Setup | Exercises |
| --- | --- | --- |
| `all-new` | empty `expected/` | new-screenshot reporting, exit 1 |
| `all-passed` | capture + approve first | the clean path, exit 0 |
| `filter` | baseline, then `--filter <match>` | the filter box, task selection |
| `changed` | a baseline overwritten with a same-size sibling | retries, the failure report, `describeChanges` |
| `deleted-baseline` | an extra `expected/` file with no task | deleted-baseline reporting |
| `filter-no-match` | `--filter <no match>` | 0/N selection, exit 0 |

Each scenario re-seeds its own starting state, so they are independent and can
be run individually.

## Projects

**`fixture`** — a self-contained project under `projects/fixture`, driving a
hand-written plugin over four local HTML pages. It imports nothing and lives
outside the pnpm workspace, so it exercises the raw plugin contract with no
shipped plugin in the way: a parity diff here points at the CLI. Its `execute`
result shape deliberately mirrors `@cappa/plugin-pages` and
`@cappa/plugin-storybook` exactly, including `success: false` for a screenshot
with no baseline.

**`storybook`** — `examples/storybook`, a real Storybook project driven by the
real `@cappa/plugin-storybook`. Requires `storybook-static/` to have been built
first; the harness says so rather than guessing.

The two are complementary: the fixture is fast and fully controlled, the
storybook project is what users actually run.

### Screenshot determinism in the storybook project

Headless Chromium does not rasterise text bit-identically between process runs:
three glyph-edge pixels in the two `Example/Page` stories flip between two
values, and the flip shows up in essentially every run (29 of 30 sampled), not
occasionally. With the example's original `maxDiffPixels: 0` that surfaced as a
failed comparison on most runs, which made the storybook baselines unusable.

`examples/storybook/cappa.config.ts` therefore allows a small pixel budget.
The pixels still flip — the tolerance is what absorbs them, so this is
structurally stable rather than luck. Note that CSS cannot fix this:
`-webkit-font-smoothing` is a no-op outside macOS, and disabling LCD text needs
a Chromium launch flag, which cappa does not currently expose.

If the storybook scenarios start flaking with a small pixel diff again, that
budget is the first thing to check.

## Determinism

Normalisation (`lib/normalize.mjs`) masks only what legitimately varies between
two runs of the same scenario: ANSI escapes, the repo root, the server port and
durations. Whitespace is left byte-faithful, because consola's box padding is
part of the output being defended. Colour and TTY-width detection are disabled
via `NO_COLOR` / `FORCE_COLOR`, and `CI` is cleared so `capture` does not take
the `onFail` path.

The static server (`lib/static-server.mjs`) is dependency-free and sends
`cache-control: no-store`, so every run sees the bytes currently on disk.

The `storybook` project must be served on port 8080 and the `fixture` on 8081 —
those are the ports their own `cappa.config.ts` files point at. The harness
fails loudly if a port is already taken.

## Related

`scripts/remote-capture-e2e.mjs` is the sibling check for remote capture: it
runs `cappa serve` and `cappa capture --server` as two processes on two ports
and asserts the full round trip — a passing run, a failing run's report and exit
code, each pre-flight error, a `409` on a concurrent run, Ctrl-C cancellation
reaching the host, and a `SIGTERM`'d host leaving no orphaned browsers.

```bash
pnpm build && node scripts/remote-capture-e2e.mjs
```
