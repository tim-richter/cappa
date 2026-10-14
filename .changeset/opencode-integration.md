---
"@cappa/cli": minor
---

`cappa agent init` gains an `opencode` stack. It installs the skill into `.agents/skills/cappa`, slash commands (`/cappa-review`, `/cappa-judge`, `/cappa-approve`) and a sandboxed `cappa-judge` subagent. The subagent judges screenshots in its own context and may only run `cappa agent check|judge` and read-only git. The stack is detected from `.opencode/` or `opencode.json(c)`. The installed files now call cappa the way the project runs it (`pnpm exec cappa`, `yarn cappa`, `bunx cappa` or `npx cappa`, picked from the lockfile, overridable with `--runner`), and the bundled sources moved to `integrations/`.
