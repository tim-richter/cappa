---
description: Judge pending Cappa screenshot changes in a sandboxed subagent
agent: cappa-judge
subtask: true
---

Judge the pending Cappa screenshot changes.

Only these screenshots, if any are named: $ARGUMENTS
(If none are named, judge every result with `pending: true`.)

Current state:

!`{{cappa}} agent check --json || true`
