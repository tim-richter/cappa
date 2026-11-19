# Tasks — Container Image Build

Each phase independently mergeable and green (`pnpm lint`, `pnpm tsc`,
`pnpm test`).

---

## Phase 1 — Config

- [x] `packages/core/src/playwright.ts`: `ContainerOptions.build?: string |
      { dockerfile: string; context?: string; target?: string; args?:
      Record<string, string> }`, with JSDoc stating the image contract (`node`
      on `PATH`, `pwuser`, browsers for `PLAYWRIGHT_VERSION`).
- [x] `resolveContainerOptions`: normalise the shorthand. Resolve `dockerfile`
      and `context` against cwd, with `context` defaulting to the Dockerfile's
      directory. `ResolvedContainerOptions` carries `build: ResolvedBuild |
      null`.
- [x] Config errors: `build` together with `image`; empty `dockerfile`;
      non-string `target` or `args` values; `args.PLAYWRIGHT_VERSION` set.
      Error for a missing Dockerfile at resolve time, not at build time.
- [x] Tests in `playwright.test.ts` for every branch above.

## Phase 2 — Build in `ensurePlaywrightContainer`

- [x] `packages/core/src/container.ts`: `buildImageTag(version, build,
      dockerfileContents)` → `cappa-browser:v<version>-<hash>`. Export it for
      tests and for the CLI.
- [x] Before the pull branch: `image inspect <tag>`, otherwise `<cli> build -f …
      -t <tag> --build-arg PLAYWRIGHT_VERSION=<version> [--build-arg …]
      [--target …] --label dev.cappa.playwright=<version> <context>`.
- [x] Log the build like the pull. On failure, throw with the Dockerfile path
      and the tail of stderr (`errorText`).
- [x] The build is excluded from `readyTimeout`, which starts after the image
      exists. Check the pull path for the same problem and fix both.
- [x] Tests over the `exec` injection: built once then reused, a Dockerfile edit
      gives a new tag, args/target/version change the tag, argv shape,
      build failure message, the build doesn't consume `readyTimeout`.
- [x] `container.integration.test.ts`: one real build from a minimal
      Dockerfile (the bookworm `--only-shell` recipe), skipped where the
      existing integration test is skipped.
- [x] Changeset (`@cappa/core` minor).

## Phase 3 — CLI

- [x] `cappa browser build [--cli <cli>]`: load config, error clearly if no
      `container.build` is configured, run the build (layer cache applies),
      then remove cappa's containers running that tag.
- [x] `cappa browser down --images`: also remove images labelled
      `dev.cappa.playwright` (`<cli> images --filter label=… -q`, then
      `<cli> rmi`). Plain `down` unchanged.
- [x] Tests in `browser.test.ts` for both.
- [x] Changeset (`@cappa/cli` minor).

## Phase 4 — Docs

- [x] `apps/docs/src/content/docs/configuration.mdx`: `build` row in the
      `container` table. Replace the "Custom fonts" bullet with a "Custom images"
      subsection covering the image contract, the bookworm recipe, what does and
      doesn't trigger a rebuild, and "CI and local must use this image".
- [x] CI recipe: `--target` plus reading `PLAYWRIGHT_VERSION` from
      `node_modules/playwright-core/package.json`.
- [x] `cli.mdx`: `cappa browser build`, `cappa browser down --images`.
- [x] Remote engines: the build happens on the `cappa serve` host.
- [x] `CLAUDE.md`: mention `container.build` next to `container`.
