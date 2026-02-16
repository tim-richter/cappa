---
"@cappa/cli": minor
---

Remove the dedicated `ci` command and add a `--ci` option to `cappa capture`.

When CI mode is enabled (either with `cappa capture --ci` or `CI=true`), Cappa now executes the configured `onFail` callback for failing screenshots.
