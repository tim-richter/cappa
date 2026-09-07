---
"@cappa/core": patch
"@cappa/cli": patch
---

Shut down cleanly when the browser is already gone.

A Ctrl-C in a terminal is delivered to the whole foreground process group,
Chromium included, so by the time cappa's signal handler closes the browser
every context can already be dead — and the resulting protocol error turned a
clean quit into an uncaught exception. `ScreenshotTool.close` and the CLI's
signal handlers now treat that as the ordinary case.
