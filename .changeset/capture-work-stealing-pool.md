---
"@cappa/core": patch
"@cappa/cli": patch
---

perf(cli): replace static pre-chunking with work-stealing pool in capture

Replace fixed chunk assignment with a shared work queue so pages grab the
next task as soon as they finish the current one. Reuses and extends the
existing `mapWithConcurrency` utility from `@cappa/core` to support return
values and worker indices. Eliminates idle tail time when task durations vary.
