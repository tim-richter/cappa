---
"@cappa/cli": patch
---

fix(cli): make `approve --filter` case-insensitive

`--filter Button` now matches `Button/Primary` as expected. Previously the filter was lowercased but compared against the raw-cased screenshot name, so capitalized story names never matched.
