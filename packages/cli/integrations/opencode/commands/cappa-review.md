---
description: Cappa visual review — label changed screenshots, judge the ambiguous ones, report and offer next steps
---

Run a Cappa visual regression review. Load the `cappa` skill and follow its rules — above all:
never approve without the user's confirmation, and never approve a `regression-likely` change.

Request: $ARGUMENTS

Current state of the last capture (`{{cappa}} agent check --json`):

!`{{cappa}} agent check --json || true`

## Flow
1. **Capture first** when the request asks for it, or when the state above has `total: 0`: run
   `{{cappa}} capture --json` (start whatever `cappa.config.ts` points at first, per the skill).
   Fix anything in its `errors[]` before reviewing. Then re-run `{{cappa}} agent check --json`.
2. **Judge** — if `pendingJudgments > 0`, hand the pending screenshots to the `cappa-judge`
   subagent (Task tool) instead of reading the images yourself; it keeps the crops out of this
   conversation and records a verdict per screenshot. Then re-run `{{cappa}} agent check --json`.
   For a thorough second opinion on every change — or when you doubt a heuristic label, e.g. a
   `regression-likely` that matches a deliberate code change — run
   `{{cappa}} agent check --judge all --json` first so every changed screenshot gets a request,
   and have the subagent judge all of them (requests stay pending until judged).
3. **Report** — one line per non-passing screenshot, grouped by label:
   `<name>: <label> — <headline>`, then `new` and `deleted` screenshots. End with
   `P/T passed · C changed · N new · D deleted`.
4. **Offer next steps**, and wait for the user:
   - `regression-likely` → if the verdict is the heuristic's, check it against the code first.
     Then offer to find and fix the cause, re-capture just those tasks with
     `{{cappa}} capture --json --filter "<taskId>"`, and review again.
   - `intentional-likely` → ask to approve them: `/cappa-approve <names>`.
   - `noise-likely` → offer to mask the element (the skill's `MASKING.md`) or approve.
   - The verdicts are also visible in the review UI (`{{cappa}} review`).
