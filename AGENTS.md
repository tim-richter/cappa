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
