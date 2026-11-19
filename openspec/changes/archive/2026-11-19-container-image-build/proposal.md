# Container Image Build

Let `playwright({ container })` build its image from a Dockerfile, pinned to the
installed `playwright-core` version, instead of only pulling a ready-made one.

## Problem

Container mode exists so that every machine renders in the same environment.
That only holds if every machine uses **the same image**, and the official
`mcr.microsoft.com/playwright:v{version}-noble` is often not the image a team's
CI runs. A common case: CI builds from `node:24-bookworm-slim` and installs
browsers with `playwright install chromium --with-deps --only-shell`. Debian
and Ubuntu ship different FreeType, fontconfig, HarfBuzz and font packages, so
text anti-aliasing differs slightly. A baseline approved on one side then fails
on the other.

The fix is one image for CI and local. `container.image` already accepts a
custom image, but today the team must:

1. **Build and publish it out of band**, with a tag per Playwright version so
   `{version}` resolves.
2. **Keep its browsers in lockstep with the lockfile.** The server cappa mounts
   is the project's own `playwright-core`, which expects one exact browser
   revision. An image built for 1.61.0 fails against a 1.63.0 lockfile with
   "Executable doesn't exist", and nothing tells you which side is stale.
3. **Remember to rebuild it** after editing the Dockerfile. Otherwise the old
   image keeps running silently.

Cappa already knows the exact version and already drives the container CLI.
Building the image is the missing step.

## Goals

- `container.build` points at a Dockerfile. Cappa builds it with the CLI it
  already uses (`build` is shared by docker, podman and nerdctl) and runs the
  result exactly as it runs a pulled image today.
- Cappa passes the installed `playwright-core` version as the
  `PLAYWRIGHT_VERSION` build arg, so version drift between the image and the
  lockfile cannot happen.
- Rebuild only when the inputs change; reuse the built image otherwise. No
  build step on a normal run.
- Works unattended: `--ci`, `--json` and `cappa agent` never block on input.
- `cappa browser build` forces a rebuild, for changes cappa cannot see (files
  the Dockerfile `COPY`s, an updated apt mirror).

## Non-goals

- **Telling paths from image references inside `image`.** `team/browser` is
  both a valid image reference and a valid relative path. A guess that is
  sometimes wrong turns a typo into a confusing pull error. `build` is a
  separate, explicit key.
- **Interactive prompts.** Cappa runs headless in CI and under agents. A build
  is logged like a pull is today.
- Pushing to a registry, sharing a build cache across machines, compose files.
  Teams that need those should build in CI and use `image`.
- Hashing the build context. See *Rebuild detection*.
- Passing BuildKit-only flags (`--secret`, `--cache-from`, …). This is a
  follow-up, if anyone asks.

## Approach

### Config

```ts
playwright({
  container: {
    // shorthand: build: './cappa-browser.Dockerfile'
    build: {
      dockerfile: './cappa-browser.Dockerfile',
      context: '.',             // default: the Dockerfile's directory
      target: 'browser',        // optional, for a multi-stage Dockerfile
      args: { NODE_VERSION: '24.22.1' }, // optional build args
    },
  },
})
```

- `build` and `image` are **mutually exclusive**. Setting both is a config
  error from `resolveContainerOptions`, not a silent preference.
- Paths resolve against the cwd, the same as `outputDir`.
- `args.PLAYWRIGHT_VERSION` is reserved. Setting it is a config error, because
  the whole point is that cappa owns that value.
- Every other option (`cli`, `runArgs`, `keepAlive`, `readyTimeout`) keeps its
  current meaning.

A Dockerfile for the bookworm case above:

```dockerfile
FROM node:24.22.1-bookworm-slim
ARG PLAYWRIGHT_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx -y playwright-core@${PLAYWRIGHT_VERSION} install chromium --with-deps --only-shell \
 && chmod -R a+rX /ms-playwright \
 && useradd --create-home pwuser
```

The image contract stays what `ensurePlaywrightContainer` already assumes, and
the docs now spell it out: `node` on `PATH`, a `pwuser` user, and browsers for
`PLAYWRIGHT_VERSION` that `pwuser` can find.

### Build step

In `ensurePlaywrightContainer`, before the existing "image present? else pull"
branch:

1. Compute the tag
   `cappa-browser:v<version>-<hash>`. The hash is a sha256 over the Dockerfile's
   **contents**, the resolved context path, `target`, `args` and the version,
   truncated to 8 characters like `containerName()` does.
2. If `<cli> image inspect <tag>` succeeds, use it.
3. Otherwise run `<cli> build -f <dockerfile> -t <tag> --build-arg
   PLAYWRIGHT_VERSION=<version> [--build-arg K=V …] [--target T] --label
   dev.cappa.playwright=<version> <context>`. Log it the way the pull is logged
   ("Building cappa-browser:v1.63.0-ab12cd34 (first run only; this can take a
   few minutes)"). On failure, throw with the tail of the build output and the
   Dockerfile path.
4. From there on, the tag goes through the existing run path unchanged. The
   container name already hashes the image, so a new tag starts a new
   container.

The build does not count against `readyTimeout`. The deadline starts once the
image exists. Check whether the same is true of the pull today; if not, fix
both.

### Rebuild detection

Hashing the Dockerfile contents catches the common edit. Hashing the context
(every file a `COPY` might read, minus `.dockerignore`) would mean
reimplementing the CLI's context handling. Changes there are rare for a
browser image. They are documented and covered by:

```bash
cappa browser build   # rebuild the configured image (layer cache still applies)
```

The tag is content-addressed, so a forced rebuild reuses the same tag. A
container that is still running would keep the old image. `browser build`
therefore removes cappa's containers for that tag after a successful build, and
the next capture starts a fresh one.

### Cleanup

Built images are labelled `dev.cappa.playwright`, just like the containers.
Every Playwright bump or Dockerfile edit leaves the old image behind, and each
is roughly 1 GB, so `cappa browser down --images` also removes images carrying
the label. Plain `browser down` keeps its current meaning (containers only).

### CI

There is one Dockerfile and two consumers:

- CI that runs cappa with `container` builds from the same config. Nothing to
  add.
- CI with its own app image builds `FROM` a stage of the same file:
  `docker build --target browser --build-arg PLAYWRIGHT_VERSION=$(…lockfile…)`.
  The docs show reading the version from `node_modules/playwright-core/package.json`.

### Remote engines

`cappa serve` runs the engine on the server host, so the build happens there.
Its Dockerfile path is resolved against the server's cwd. This is consistent
with how the container is started today; it just needs a line in the docs.

## Risks

- **Rendering parity is the user's Dockerfile's job.** Cappa guarantees the
  version; it cannot make bookworm render like noble. The docs should say that
  CI and local must use this image, not merely a similar one.
- **CLI differences in `build`.** `-f`, `-t`, `--build-arg`, `--target` and
  `--label` are common to docker, podman and nerdctl. BuildKit's progress output
  differs; cappa only captures it, never parses it.
- **First-run cost moves from pull to build.** That is comparable, and
  unavoidable for a custom image.

## Follow-ups

- `build.flags: string[]`, an escape hatch for BuildKit flags, mirroring
  `runArgs`.
- Rebuild on context changes if the Dockerfile-only hash turns out to bite in
  practice.
