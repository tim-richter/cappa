---
"@cappa/cli": minor
---

Agent review hardening:

- `cappa agent approve` refuses screenshots whose current verdict is `regression-likely`. If the change is intended, judge it `intentional-likely` first. Pass `--allow-regression` to approve a regression anyway.
- `cappa agent init` installs a `cappa-judge` subagent for Claude Code (`.claude/agents/cappa-judge.md`).
- The skill now treats heuristic labels as guesses. It uses `--judge all` to get crops whenever a change needs a look, and judges every request it makes, since requests stay pending until judged. It hands judging to an image-capable subagent when the model can't read images, never hand-rolls crops or pixel forensics, and knows that `agent check` exits 1 whenever anything differs.
