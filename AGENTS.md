# Cappa Project

## Testing instructions
- Fix any test or type errors until the whole suite is green.
- After moving files or changing imports, run `pnpm lint --filter <project_name>` to be sure ESLint and TypeScript rules still pass.
- Add or update tests for the code you change, even if nobody asked.

## PR instructions
- Title format: follow conventional commits spec
- Always run `pnpm lint` and `pnpm test` before committing.
- Always include a changesets file with the appropriate changes documented.