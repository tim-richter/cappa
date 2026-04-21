# Cappa — AI Assistant Guide

Cappa is a Playwright-based screenshot capture and visual regression testing tool with a plugin system. It is a pnpm monorepo managed with Turborepo.

## Package Manager & Tooling

- **Always use `pnpm`** — never npm or yarn
- **Turborepo** orchestrates build/test pipelines (`turbo.json`)
- **Biome** handles linting and formatting (replaces ESLint + Prettier): `pnpm lint` / `pnpm lint:fix`
- **tsdown** is the primary build tool for library packages (ESM + CJS output); `tsup` is used for `@cappa/plugin-storybook`
- **Vitest** is used for all tests across all packages
- **TypeScript** `5.9.x` with strict settings throughout
- Shared dependency versions are pinned in `pnpm-workspace.yaml` under the `catalog:` key — always prefer catalog versions over custom version specs

## Monorepo Structure

```
cappa/
├── apps/
│   ├── docs/          # Astro-based documentation site (@cappa/docs)
│   ├── server/        # Fastify server that serves the review UI (@cappa/server)
│   └── web/           # React + Vite review UI (private, not published)
├── packages/
│   ├── core/          # @cappa/core — ScreenshotTool, filesystem, diff algorithms, types
│   ├── cli/           # @cappa/cli — CLI entry point (commander), config loading, commands
│   ├── logger/        # @cappa/logger — shared logging via consola
│   ├── ui/            # @workspace/ui — shared React component library (Radix + Tailwind)
│   ├── config-ts/     # @cappa/config-ts — shared TypeScript configs
│   └── plugins/
│       └── plugin-storybook/  # @cappa/plugin-storybook — Storybook integration plugin
├── examples/
│   ├── storybook/     # Storybook v9 example
│   └── storybook-10/  # Storybook v10 example
```

## Key Packages

### `@cappa/core`
The foundational library. Core exports:
- `ScreenshotTool` — initialises Playwright browser, manages page pool, captures screenshots, compares them against baselines
- `ScreenshotFileSystem` — manages `actual/`, `expected/`, and `diff/` directories inside `outputDir`
- `defineConfig` — type helper for `cappa.config.ts`
- `compareImages` / `imagesMatch` — pixel-diff comparison (via `@blazediff/core-native`)
- `compareImagesGMSD` / `imagesMatchGMSD` — GMSD perceptual comparison (via `@blazediff/gmsd`)
- All public types (`UserConfig`, `Plugin`, `PluginDef`, `Screenshot`, etc.)

Build output: `dist/index.mjs` (ESM) and `dist/index.cjs` (CJS). Peer dep: `playwright-core ^1.55`.

### `@cappa/cli`
The published CLI binary (`cappa`). Commands:
- `capture` — runs all plugin `discover` → `execute` phases, clears `actual/` and `diff/` before each run
- `capture --ci` — CI mode; also fires `onFail` callback after capture
- `review` — opens the review UI (starts `@cappa/server`)
- `approve [--filter <name>]` — promotes `actual/` screenshots to `expected/`
- `status` — shows diff summary
- `init` — scaffolds `cappa.config.ts` in the current directory

Config is loaded from `cappa.config.ts` in CWD via **jiti** (supports TypeScript without compilation).

### `@cappa/server`
Fastify server that:
- Serves the pre-built `web` UI as static files embedded in the package
- Exposes REST endpoints consumed by the web UI (screenshot listing, approval, etc.)

### `@cappa/plugin-storybook`
Two-phase Storybook plugin:
1. **discover** — queries the Storybook API to list all stories
2. **execute** — navigates to each story URL and calls `ScreenshotTool.captureScreenshot`

Also exports a Storybook addon entry (`./browser`) for in-browser usage.

### `@cappa/logger`
Thin wrapper around `consola`. Call `initLogger(level)` once (CLI does this in the `preAction` hook), then use `getLogger()` everywhere else.

## Plugin System

A plugin is a factory function matching:

```ts
type Plugin<Config = any> = (config?: Config) => PluginDef;

type PluginDef<TResult, TContext, TData> = {
  name: string;
  description: string;
  discover: (screenshotTool: ScreenshotTool) => Promise<PluginTask<TData>[]>;
  execute: (task, page, screenshotTool, context) => Promise<TResult>;
  initPage?: (page, screenshotTool) => Promise<TContext>; // called once per page before tasks
};
```

The CLI runs plugins sequentially. Within each plugin, tasks are split into chunks and executed in parallel using the page pool (`concurrency` setting, default 1).

## Configuration

Users create `cappa.config.ts` in their project root:

```ts
import { defineConfig } from '@cappa/core';
import { cappaPluginStorybook } from '@cappa/plugin-storybook';

export default defineConfig({
  outputDir: './screenshots',    // default: './screenshots'
  retries: 2,                    // default: 2
  concurrency: 1,                // default: 1 (number of parallel browser contexts)
  logConsoleEvents: true,        // default: true
  diff: {
    type: 'pixel',               // 'pixel' (default) or 'gmsd'
    threshold: 0.1,
    maxDiffPixels: 0,
    maxDiffPercentage: 0,
  },
  screenshot: {
    fullPage: true,
    viewport: { width: 1920, height: 1080 },
  },
  review: { theme: 'light' },    // 'light' | 'dark'
  plugins: [cappaPluginStorybook({ url: 'http://localhost:6006' })],
  onFail: async (failingScreenshots) => { /* upload, notify, etc. */ },
});
```

`defineConfig` also accepts a function `(env: ConfigEnv) => UserConfig` for dynamic configuration.

## Screenshot Storage Layout

```
<outputDir>/
├── actual/     # freshly captured screenshots (cleared before each run)
├── expected/   # approved baseline screenshots
└── diff/       # diff images for changed screenshots (cleared before each run)
```

Screenshot categories: `new`, `deleted`, `changed`, `passed`.

## Development Workflows

### Install dependencies
```bash
pnpm install
```

### Build all packages
```bash
pnpm build        # builds all packages via Turborepo
```

### Run tests
```bash
pnpm test         # all packages
pnpm -F @cappa/core test          # single package
pnpm -F @cappa/cli test:run       # run once (no watch)
```

### Lint & format
```bash
pnpm lint         # check (Biome)
pnpm lint:fix     # auto-fix
```

### Type-check
```bash
pnpm tsc          # all packages
```

### Are Types Wrong check
```bash
pnpm attw         # validates dual CJS/ESM exports
```

### Start dev server (review UI)
```bash
pnpm dev
```

### Release
```bash
pnpm release      # builds all + changeset publish
```

## Conventions

### Code Style (enforced by Biome)
- 2-space indentation, 80-char line width
- `noExplicitAny` is **off** (explicit `any` is allowed where necessary)
- Imports are managed by Biome's organizer

### TypeScript
- Strict mode across all packages
- Use `type` imports for type-only imports (`import type { Foo } from '...'`)
- Public API types are defined in `packages/core/src/types.ts` and re-exported from `packages/core/src/index.ts`

### Tests
- Test files are co-located with source: `foo.ts` → `foo.test.ts`
- Add or update tests for every code change, even if not explicitly requested
- Fix all type errors and test failures before committing

### Changesets
- Every change to a published package needs a changeset file
- Run `pnpm changeset` to create one interactively
- Packages excluded from changesets: `web`, `@workspace/ui`, `@cappa/example-*`, `@cappa/config-ts`, `@cappa/docs`
- `@cappa/server` and `web` are version-linked in changeset config

### Documentation
- Update `apps/docs` when making changes or adding features to any public package

### PR Conventions
- Title must follow **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, etc.)
- Run `pnpm lint` and `pnpm test` before committing
- Include a changeset file with appropriate changes documented

### Workspace Dependencies
- Use `workspace:*` for internal package references
- Use the pnpm catalog for shared external dependency versions

## Package Publishing

Published packages: `@cappa/core`, `@cappa/cli`, `@cappa/logger`, `@cappa/server`, `@cappa/plugin-storybook`

All packages use dual ESM/CJS output and are validated with `attw --profile node16`.

Build artifacts go to `dist/`. The `bin/cappa.cjs` file in `@cappa/cli` is the pre-built CLI entry point.
