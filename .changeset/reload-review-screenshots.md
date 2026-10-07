---
"@cappa/core": patch
"@cappa/server": patch
---

Re-captured screenshots no longer stay stuck in "changed" in the review UI. A capture that now matches its baseline removes the diff an earlier run left behind (partial runs — re-capture, watch — never clear `diff/`), screenshot asset URLs carry the file's mtime so the browser shows the new image instead of a cached one, and the review UI gains a Reload button that re-reads every screenshot from disk without restarting `cappa review`.
