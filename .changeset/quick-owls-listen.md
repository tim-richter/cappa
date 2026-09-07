---
"@cappa/core": minor
"@cappa/protocol": minor
---

Carry `ScreenshotTool`'s own output on the run event stream.

`ScreenshotTool` wrote the lines a user actually watches — `Screenshot saved`,
`Screenshot passed visual comparison`, the retry warnings — straight to the
global logger. In-process that is fine. With the browser on another machine it
meant those lines stayed in the *host's* terminal while a
`cappa capture --server` client showed a run with no commentary.

`CaptureRunner` now installs a log sink on the tool for the duration of a run,
so its output travels as `log` events like everything else, and removes it again
afterwards — including when the run throws, since a tool still pointing at a
finished run's stream would swallow whatever it logged next.

`RunLogLevel` gains `success`, which is the level those lines use. This is a
wire change, and it lands before `PROTOCOL_VERSION` 1 has ever been published,
so it is part of what v1 will be rather than a bump.

A remote capture's terminal output is now identical to a local one. The
exception is a plugin that logs on its own account through `getLogger()`: that
still goes to the host's terminal. A plugin whose output should reach a remote
client can log through `screenshotTool.logger`, which is routed into the run
while one is in flight.
