---
"@cappa/core": minor
"@cappa/cli": minor
---

Add agent visual review. `cappa agent check` labels every changed screenshot (`regression-likely`, `intentional-likely`, `noise-likely` or `ambiguous`) from its diff interpretation — computed on demand when `diff.interpret` is off — and writes judgment requests with small region crops (`locator.png`, `regions.png`) for the ambiguous ones. `cappa agent judge` records an agent's verdict (tied to a fingerprint of the judged images), `cappa agent approve` approves by exact name or verdict label and is refused in CI, and `cappa agent init` installs a Claude Code / Agent Skills skill. `@cappa/core` exports the building blocks (`runAgentCheck`, `deriveVerdict`, `renderJudgmentTiles`, …).

Also fixes the change report ignoring severity colours and change-type labels for the lowercase/kebab-case values current `@blazediff/interpret-native` reports.
