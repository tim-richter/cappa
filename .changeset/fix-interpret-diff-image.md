---
"@cappa/core": patch
---

Fix missing diff images when `diff.interpret` is enabled. The native comparison binding skips writing the diff output file when `interpret: true` is passed, causing ENOENT errors during capture. Interpretation is now fetched in a separate call so the diff image is always produced.
