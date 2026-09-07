---
"@cappa/core": minor
---

Add an optional `watch` member to `PluginDef`, so a plugin can map a changed
file onto the tasks it affects.

`watch.paths` widens what a watch session watches; `watch.resolve(file, tasks)`
answers with task ids, or `null` for "cannot tell — re-run everything this
plugin owns". Optional everywhere: a plugin without it keeps working and simply
contributes its whole task set on any change.
