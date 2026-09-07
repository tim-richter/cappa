---
"@cappa/config": minor
"@cappa/cli": patch
---

Drive `cappa capture` through a `CaptureEngine`.

`capture` built a `ScreenshotTool` and a `CaptureRunner` by hand while `review` built a
`LocalEngine` that builds the same two internally — two ways to start a run, and the CLI's
was the one that skipped the engine's concurrency guard, target cache and typed errors.
`capture` now starts a run on the engine, renders its event stream, and takes failures from
`getRun`, so both commands reach a run the same way. Screenshot results for the `onFail`
payload and the changed-screenshot report are read through `engine.listScreenshots()`
rather than the filesystem directly.

`@cappa/config` gains `configToEngineOptions(config)`, the config-to-engine mapping the two
commands were each keeping their own copy of. How long a browser stays warm is left to the
caller, since it is a per-command policy: `review` uses the configured timeout, and a
one-shot `capture` keeps no browser warm at all.

No user-visible change — terminal output and exit codes are unchanged.
