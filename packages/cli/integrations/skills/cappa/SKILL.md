---
name: cappa
description: Run and review Cappa visual regression tests — capture screenshots, judge what changed, fix regressions, approve intended changes. Trigger on "visual test", "visual regression", "screenshot diff", "review screenshots", "cappa", "/cappa".
metadata:
  opencode/slash: "true"
---

# cappa

Cappa captures screenshots (Storybook stories, pages) with Playwright and diffs them against
approved baselines. `cappa agent` turns the diff into something you can judge cheaply: a heuristic
labels each change, and only the ones it cannot settle are handed to you with small crops.

Run the CLI as `{{cappa}}` from the project root — it already runs in the package holding
`cappa.config.ts`, so don't `cd` first. The examples below write `cappa` for short.

Sibling files — read on demand:
- `JUDGING.md` — judging changes when `pendingJudgments > 0`.
- `MASKING.md` — silencing non-deterministic UI instead of re-approving it forever.

## Be terse
- Pass `--json` to every `cappa capture` and `cappa agent` call and parse it. Don't echo CLI output back.
- Don't `ls`/`find`/`cat` for paths the CLI already returns. The full detail of the last check
  (regions, absolute paths, rationale) is in `reportPath` (`<outputDir>/.cappa-agent/report.json`);
  read it only when you need it.
- Never open full-size screenshots first. Judgment requests come with `locator.png` and
  `regions.png`, typically 10–100x smaller.
- End with one summary line: `P/T passed · C changed · N new · D deleted` plus one line per
  non-passing screenshot.

## 1. Capture
```sh
cappa capture --json
```

- If the config has a `webServer`, capture starts and stops the app itself. If it reports an
  unreachable URL (`Cannot reach …: connection refused`), follow what the error says.
- Without a `webServer`, make sure the plugin URLs in `cappa.config.ts` are reachable first.
- `--json` prints one document to stdout: `{ ok, tasks, screenshots, errors, results, next }`.
  Progress is muted; warnings and errors go to stderr.
  - `errors[]` are tasks that broke (a story threw, a page timed out). Fix those first — there is
    nothing to judge for them.
  - `results[]` are screenshots that differ from their baseline (`changed`, `new`, `deleted`). They
    are what `cappa agent check` reviews.
  - Exit code 1 with an empty `errors[]` just means screenshots differ — expected, not a failure.
- To re-capture only some screenshots: `cappa capture --json --filter "<glob over task ids>"`.
  Task ids are in `results[].taskId`, e.g. `example-button--primary` for Storybook. A filtered
  capture replaces only the screenshots it captures; everything else keeps its last capture.
- Skip this step if the user only asked to review what is already captured.

## 2. Check
```sh
cappa agent check --json
```
Returns `{ reportPath, total, passed, changed, new, deleted, pendingJudgments, results }`.
`results` lists non-passing screenshots only, each
`{ name, category, verdict?: { label, headline, action, source }, pending?, judgment? }`.
It exits 1 whenever anything is not passing — that is the normal result, not a failure. A real
failure prints `{ "error": "..." }` instead.

- `category: "changed"` carries a `verdict`. `source: "heuristic"` came from the diff signals;
  `source: "agent"` is a verdict you (or another judge) wrote.
- A heuristic label is a guess from pixel signals, not a finding. In particular it calls any
  medium- or high-severity structural change `regression-likely` — including content that was
  added or removed on purpose. Before treating a heuristic `regression-likely` as broken, check it
  against the code; if a deliberate change explains it, judge it (`--judge all`, below) instead of
  "fixing" the feature.
- `pending: true` → the heuristic said `ambiguous`; `judgment` is the directory with the evidence.
  **Read `JUDGING.md`**, judge them, then re-run `cappa agent check --json`.
- `--judge all` requests a judgment for *every* changed screenshot, not only ambiguous ones, so
  each gets a `judgment` directory with `locator.png` and `regions.png`. Use it whenever you need
  to look anyway: you doubt a heuristic label, or the user wants a thorough review. Then judge per
  `JUDGING.md` like any other pending entry.
- Requests are sticky: once made, a request stays `pending` through every later check until it
  gets a verdict, the screenshot is approved, or a re-capture changes its images. After
  `--judge all`, judge every pending entry — including the ones whose heuristic label you agree
  with (one `cappa agent judge` call per shared label is enough) — or `pendingJudgments` never
  reaches 0.
- Judging means reading images. When the `cappa-judge` subagent is installed, it always does the
  judging, not you — see `JUDGING.md`. Never judge blind.

## 3. Report and act
One line per non-passing screenshot: `<name>: <label> — <headline>`. Then, per label:

- `regression-likely` → something looks broken. If the verdict is the heuristic's
  (`source: "heuristic"`), confirm it against the code first (see step 2). Point the user at it.
  If they want it fixed (or you were asked to fix regressions), find the cause in the working
  tree (`git diff`, recent commits touching the component), fix the code, re-capture just that
  task with `--filter`, and re-check. Never approve a regression.
- `intentional-likely` → a deliberate restyle or content change. Ask the user to confirm, then
  `cappa agent approve <name> [<name> ...] --json`.
- `noise-likely` → anti-aliasing or non-deterministic content. Ask once: mask, approve or ignore.
  Prefer masking when the source is inherently unstable (clock, relative time, random avatar,
  animation) — approving only postpones the next failure. See `MASKING.md`.
- `new` (no baseline yet) → the screenshot is new. There are no crops — looking means reading the
  full-size image in `<outputDir>/actual/<name>.png`, so do it only if asked (and through an
  image-capable subagent if you cannot read images). Approving makes it the baseline.
- `deleted` (baseline without a capture) → the story/page was removed or failed to capture. Check
  capture output before approving: approving a deleted screenshot **deletes its baseline**.

Approving by verdict: `cappa agent approve --label intentional-likely --json` approves every changed
screenshot whose current verdict has that label.

## Hard rules
- Never approve without explicit user confirmation, and never approve `regression-likely`.
  `cappa agent approve` refuses to; if the change is in fact intended, judge it
  `intentional-likely` first. Pass `--allow-regression` only when the user explicitly tells you to
  approve that regression.
- `cappa agent approve` matches names exactly. Don't use plain `cappa approve` — its `--filter`
  is a substring match and approves far more than you intend.
- Never edit files under `expected/`, `actual/`, `diff/` or `.cappa-agent/` by hand — verdicts
  go through `cappa agent judge`.
- Never hand-roll crops, image diffs or pixel forensics (ImageMagick, scripts). Cappa's crops are
  the evidence; if a screenshot has none, `cappa agent check --json --judge all` produces them.
- In CI (`CI=true`), only `cappa agent check` is allowed; baselines change on developer machines.
- Re-capturing invalidates verdicts for screenshots whose images changed — that is intended.
