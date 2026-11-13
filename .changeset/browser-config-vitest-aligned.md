---
"@cappa/core": minor
"@cappa/config": minor
---

Add a `browser` config block shaped like Vitest browser mode's: `provider: playwright({ launchOptions, connectOptions, contextOptions, actionTimeout })`, `headless` and `instances`. Setting `connectOptions.wsEndpoint` connects to a remote Playwright server (e.g. `playwright run-server` in the official Docker image) instead of launching a local browser, forwarding `launchOptions` and `headless` in the `x-playwright-launch-options` header. Connection failures name the problem (no server, timeout, or a version mismatch with the matching Docker image), and a warm browser that disconnects is replaced on the next run instead of failing it. `playwright` is available from the new `@cappa/core/playwright` subpath and the package root. With no `browser` block, behaviour is unchanged.
