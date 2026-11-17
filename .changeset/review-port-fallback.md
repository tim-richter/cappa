---
"@cappa/cli": minor
---

`cappa review` and `cappa serve` move to the next free port when the requested one is taken (up to 20 ports on), warn, and print the URL they actually bound. `serve`'s structured `port=` line reports the bound port. Pass `--strict-port` to exit with an error instead.
