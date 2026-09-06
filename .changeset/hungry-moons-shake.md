---
"@cappa/core": minor
"@cappa/cli": patch
---

Extract the capture orchestrator out of the CLI into a new `CaptureRunner` in `@cappa/core`.

`CaptureRunner` owns the discover → filter → execute pipeline that previously lived inside the
`capture` command. It emits a typed, sequence-numbered `RunEvent` stream, supports cancellation via
`abort()`, and can capture a subset of the discovered tasks (`plugins`, `filter`, `taskIds`). It
takes an already-initialised `ScreenshotTool`, so a long-lived process can keep one browser warm
across runs.

`@cappa/core` now also exports `groupScreenshots` and `collectScreenshots` (moved from `@cappa/cli`,
which was not a published entry point for them), along with the runner types: `RunEvent`,
`RunSummary`, `RunDetail`, `StartRunRequest`, `TaskStatus`, `Target`, plus `didScreenshotFail`,
`toTaskStatus`, `filterTasks`, `selectTasks` and `getDeletedScreenshots`.

`cappa capture` is now a consumer of that event stream and renders it to the terminal. Its output,
exit codes and `onFail` behaviour are unchanged.
