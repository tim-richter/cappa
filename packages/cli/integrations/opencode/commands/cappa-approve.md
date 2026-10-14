---
description: Approve Cappa screenshots by exact name, or every screenshot with a verdict label
---

Approve Cappa screenshots: $ARGUMENTS

Current verdicts:

!`{{cappa}} agent check --json || true`

1. If no names or labels were given, list the approvable screenshots from the state above with their
   verdicts and stop — ask which ones.
2. Match what was asked against `results[]`: names must match exactly. A label
   (`intentional-likely`, `noise-likely`) means every changed screenshot with that verdict.
3. Do not approve a `regression-likely` screenshot or a `deleted` one (approving a deletion removes
   its baseline) unless the request names it explicitly — if it does not, list it and ask.
4. Approve: `{{cappa}} agent approve <name> [<name> ...] --json`, or
   `{{cappa}} agent approve --label <label> --json`.
5. Report what was approved in one line, and what was held back and why.
