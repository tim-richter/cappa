---
"@cappa/core": patch
---

Use sharp instead of pngjs for PNG load/encode in the core package for improved performance. PNG.toBuffer() and PNG.save() are now async; createDiffSizePngImage() is now async.
