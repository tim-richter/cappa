---
"@cappa/cli": minor
---

`cappa browser build [--cli <cli>]` rebuilds the `playwright({ container: { build } })` image (the layer cache still applies) for changes cappa cannot see, such as files the Dockerfile `COPY`s, then removes the containers still running the previous build. `cappa browser down --images` also removes every image cappa built; plain `browser down` still removes containers only.
