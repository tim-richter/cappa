---
"@cappa/cli": patch
---

`cappa agent init` run inside a workspace package (e.g. `pnpm -F web exec cappa agent init`) now installs the skill at the workspace root, where agents look for it, and writes a runner that switches into the package (`pnpm -C packages/web exec cappa`) instead of falling back to `npx cappa`.
