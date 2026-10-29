---
"@cappa/cli": minor
---

`cappa agent init --judge-model <model>` pins the `cappa-judge` subagent to a model that can read images (`provider/model` for OpenCode, an alias or model id for Claude Code). Before, the judge always ran on the calling model, so a text-only main agent got a judge that could not see the crops. Other changes to the judge and the skill:

- A judge that cannot read images says so and records nothing, instead of guessing verdicts.
- When `cappa-judge` is installed, the skill always hands judging to it, so a pinned judge is never bypassed. Large reviews are split across several judges running in parallel.
- The Claude Code judge's Bash is now restricted by a `PreToolUse` hook (`cappa agent guard`) to `cappa agent check|judge` and read-only git, matching the OpenCode judge's permissions.
- Both judges share one body that follows the skill's `JUDGING.md`. The OpenCode judge follows the `.claude` copy of the skill when OpenCode reads that one.
- The skill no longer suggests writing `verdict.json` by hand; verdicts go through `cappa agent judge`.
