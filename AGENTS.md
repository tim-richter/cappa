# Cappa Project

- always use pnpm
- always use the latest version of packages and dependencies
- always update the docs in apps/docs when making changes/adding new features to public packages

## Testing instructions
- Fix any test or type errors until the whole suite is green.
- After moving files or changing imports, run `pnpm lint` from root to be sure ESLint and TypeScript rules still pass.
- Add or update tests for the code you change, even if nobody asked.

## PR instructions
- Title format: follow conventional commits spec
- Always run `pnpm lint` and `pnpm test` before committing.
- Always include a changesets file with the appropriate changes documented.

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Web (Review UI) | `pnpm -F web dev` | 3000 | Vite dev server for the React review UI |
| Server (API) | `pnpm -F @cappa/server dev` | — | Fastify server; normally started via `cappa review` CLI command, not standalone |
| Docs | `pnpm -F @cappa/docs dev` | 4321 | Astro documentation site |

Standard build/test/lint commands are documented in `CLAUDE.md` and root `package.json` scripts.

### Gotchas

- **Playwright browsers**: After `pnpm install`, you must also run `npx playwright install chromium --with-deps` from `apps/web/` (which has `playwright` as a direct dependency). The root workspace doesn't have a `playwright` binary.
- **Web browser tests (vitest)**: `apps/web/vitest.config.ts` hardcodes a Playwright Chrome path at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. In Cloud VMs, create a symlink from the actual Playwright Chromium binary to that path. The actual binary location is under `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`.
- **Web test flakiness**: The first `pnpm -F web test` run may fail with "Vite unexpectedly reloaded" due to Vite `optimizeDeps` caching. A second run succeeds. Run `pnpm -F web test` once before the real test run to warm the cache.
- **Linter is Biome**, not ESLint. The `pnpm lint` command runs `biome check .` from the root.
