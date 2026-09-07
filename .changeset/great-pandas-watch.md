---
"@cappa/cli": minor
---

Add `cappa capture --watch`: capture once, then re-capture affected tasks on
every file change, holding one browser open across iterations.

Each iteration prints what changed, the tasks that did not pass, and a one-line
summary. A failing screenshot does not stop the session or set a non-zero exit
code — it is what you are there to fix. Ctrl-C stops the watcher, closes the
browser and exits `0`.

`--watch` refuses to combine with `--ci` or `--server`, with a message rather
than a silent no-op.
