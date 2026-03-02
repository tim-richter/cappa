---
"@cappa/core": patch
---

Continue retrying screenshots when image sizes differ instead of failing immediately. Layout shifts and pages still loading can cause transient size mismatches that resolve on subsequent attempts.

Also fixes the GMSD comparator to skip the comparison algorithm when image dimensions don't match, aligning it with the pixel comparator's behaviour.
