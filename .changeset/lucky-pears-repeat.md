---
"@cappa/core": minor
"@cappa/protocol": minor
"@cappa/client": minor
"@cappa/server": minor
"@cappa/cli": patch
---

Fix re-capturing a single screenshot from the review UI

The **Re-capture** button sent the screenshot's *name* as a task id. That is only
a task id for `@cappa/plugin-pages`: `@cappa/plugin-storybook` writes
`example/button/primary.png` for the task `example-button--primary`, so every
click came back `400 CAPPA_UNKNOWN_TARGETS`. Variants never worked either, for
any plugin.

Nothing on disk recorded the link, so there was nothing to look it up in.
`CaptureRunner` now records which task produced which screenshot as it captures
— including variants, whose filenames only `ScreenshotTool` ever sees — into a
`.cappa-manifest.json` beside `actual/` and `expected/`. `Screenshot` gains an
optional `taskId` (and `plugin`) read back from it, and the button uses that,
hiding itself when a screenshot has no recorded task rather than guessing.

The manifest is best-effort throughout: a missing, unreadable or unwritable one
costs the button and nothing else. A screenshot captured before this release has
no entry until its next capture.
