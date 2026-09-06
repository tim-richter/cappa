---
"@cappa/core": minor
"@cappa/config": minor
"@cappa/cli": minor
---

Add `review.browserIdleTimeout` and shut `cappa review` down cleanly.

`review.browserIdleTimeout` (default `300000`) controls how long the browser stays alive
between captures started from the interactive UI. Keeping it warm makes an interactive
capture feel immediate instead of paying browser startup on every click; evicting it once
idle stops a forgotten review session holding a browser process indefinitely. Set it to `0`
to shut the browser down after every run. It has no effect on `cappa capture`, which starts
and stops a browser per invocation either way.

`cappa review` now handles SIGINT and SIGTERM: it closes the HTTP server first so no new run
can start mid-teardown, then closes the engine, which aborts any active run and shuts the
browser down — previously a killed review server could leave an orphaned Chromium behind.
The two closes are independent, so a server that fails to close still cannot prevent the
browser from being cleaned up, and a second Ctrl-C exits immediately rather than making you
reach for `kill -9`.

When `cappa review` generates an access token, the URL carrying it is now also logged at
warning level. It was only printed via `success`, which is suppressed below `-l 3`, so a
quieter log level produced a token the user could never see — locking them out of their own
review UI.
