---
"@cappa/cli": patch
---

`cappa status` now exits with code 1 when any screenshots are new, changed, or deleted, making it usable as a CI/script gate (e.g. `cappa status && deploy.sh`).
