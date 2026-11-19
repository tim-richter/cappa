---
"@cappa/core": minor
---

`playwright({ container: { build } })` builds the container image from a Dockerfile instead of pulling one. Cappa passes the installed `playwright-core` version as the `PLAYWRIGHT_VERSION` build arg, tags the result `cappa-browser:v<version>-<hash>` and rebuilds only when the version, the Dockerfile's contents, `context`, `target` or `args` change. `build` and `image` are mutually exclusive, and a missing Dockerfile is a config error.

`readyTimeout` now starts once the image exists, so a slow first pull (or build) no longer uses it up.

New exports: `buildPlaywrightImage`, `buildImageTag`, `removePlaywrightImages` and `installedPlaywrightVersion`; `removePlaywrightContainers` takes an optional `image` to remove only the containers running it.
