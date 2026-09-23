---
"@cappa/core": patch
---

Fix inverted diff interpretation: additions were reported as deletions and vice versa. The capture comparison passed the fresh screenshot as the baseline and the approved reference as the comparison, but blazediff's `interpret` treats its first argument as the baseline. The comparison now runs `(expected, actual)`. Existing `diff/<name>.json` sidecars are regenerated on the next capture.
