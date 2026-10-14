---
name: cappa
description: Run and review Cappa visual regression tests — capture screenshots, judge what changed, fix regressions, approve intended changes. Trigger on "visual test", "visual regression", "screenshot diff", "review screenshots", "cappa", "/cappa".
---

# cappa

Cappa captures screenshots (Storybook stories, pages) with Playwright and diffs them against
approved baselines. `cappa agent` turns the diff into something you can judge cheaply: a heuristic
labels each change, and only the ones it cannot settle are handed to you with small crops.

Sibling files — read on demand:
- `JUDGING.md` — judging changes when `pendingJudgments > 0`.
- `MASKING.md` — silencing non-deterministic UI instead of re-approving it forever.

## Be terse
- Pass `--json` to every `cappa agent` call and parse it. Don't echo CLI output back.
- Don't `ls`/`find`/`cat` for paths the CLI already returns. The full detail of the last check
  (regions, absolute paths, rationale) is in `reportPath` (`<outputDir>/.cappa-agent/report.json`);
  read it only when you need it.
- Never open full-size screenshots first. Judgment requests come with `locator.png` and
  `regions.png`, typically 10–100x smaller.
- End with one summary line: `P/T passed · C changed · N new · D deleted` plus one line per
  non-passing screenshot.

## 1. Capture
Run from the directory holding `cappa.config.ts`.

```sh
cappa capture -l 1
```

- Capture needs whatever the plugins point at to be reachable — read `cappa.config.ts`. For
  `@cappa/plugin-storybook`, the configured Storybook URL must be up (start it with the project's
  storybook script if it is not, and stop it when you are done). For `@cappa/plugin-pages`, the
  page URLs must be reachable.
- A non-zero exit after a completed capture means screenshots differ — that is the expected
  result, not an error. Only treat it as a failure when the output reports capture errors.
- To re-capture only some screenshots: `cappa capture -l 1 --filter "<glob over task ids>"`. Task ids
  are in `report.json` (`taskId`), e.g. `example-button--primary` for Storybook.
- Skip this step if the user only asked to review what is already captured.

## 2. Check
```sh
cappa agent check --json
```
Returns `{ reportPath, total, passed, changed, new, deleted, pendingJudgments, results }`.
`results` lists non-passing screenshots only, each
`{ name, category, verdict?: { label, headline, action, source }, pending?, judgment? }`.

- `category: "changed"` carries a `verdict`. `source: "heuristic"` came from the diff signals;
  `source: "agent"` is a verdict you (or another judge) wrote.
- `pending: true` → the heuristic said `ambiguous`; `judgment` is the directory with the evidence.
  **Read `JUDGING.md`**, judge them, then re-run `cappa agent check --json`.
- `--judge all` requests a judgment for *every* changed screenshot, not only ambiguous ones — use it
  when the user wants a thorough review or you doubt a heuristic label.

## 3. Report and act
One line per non-passing screenshot: `<name>: <label> — <headline>`. Then, per label:

- `regression-likely` → something looks broken. Point the user at it. If they want it fixed (or
  you were asked to fix regressions), find the cause in the working tree (`git diff`, recent
  commits touching the component), fix the code, re-capture just that task with `--filter`, and
  re-check. Never approve a regression.
- `intentional-likely` → a deliberate restyle or content change. Ask the user to confirm, then
  `cappa agent approve <name> [<name> ...] --json`.
- `noise-likely` → anti-aliasing or non-deterministic content. Ask once: mask, approve or ignore.
  Prefer masking when the source is inherently unstable (clock, relative time, random avatar,
  animation) — approving only postpones the next failure. See `MASKING.md`.
- `new` (no baseline yet) → the screenshot is new. Glance at it only if asked; approving makes it
  the baseline.
- `deleted` (baseline without a capture) → the story/page was removed or failed to capture. Check
  capture output before approving: approving a deleted screenshot **deletes its baseline**.

Approving by verdict: `cappa agent approve --label intentional-likely --json` approves every changed
screenshot whose current verdict has that label.

## Hard rules
- Never approve without explicit user confirmation, and never approve `regression-likely`.
- `cappa agent approve` matches names exactly. Don't use plain `cappa approve` — its `--filter`
  is a substring match and approves far more than you intend.
- Never edit files under `expected/`, `actual/`, `diff/` or `.cappa-agent/` by hand (except
  writing `verdict.json`).
- In CI (`CI=true`), only `cappa agent check` is allowed; baselines change on developer machines.
- Re-capturing invalidates verdicts for screenshots whose images changed — that is intended.
