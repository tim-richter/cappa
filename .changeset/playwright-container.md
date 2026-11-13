---
"@cappa/core": minor
"@cappa/cli": minor
---

Add `playwright({ container })`: cappa starts (or reuses) the official `mcr.microsoft.com/playwright` image for the exact installed `playwright-core` version and connects to it, so a containerised browser no longer needs a hand-matched image tag. The host's `playwright-core` is mounted read-only and run as the server, so versions always match and the container needs no npm access. The container CLI is configurable (`cli: 'podman'`, `nerdctl`, or `CAPPA_CONTAINER_CLI`), as are `image` (`{version}` templated), `runArgs`, `keepAlive` (default `true`) and `readyTimeout`. `exposeNetwork` defaults to `'<loopback>'` so the browser reaches dev servers on localhost; an explicit `connectOptions.wsEndpoint` still wins. New `cappa browser down` removes the containers.
