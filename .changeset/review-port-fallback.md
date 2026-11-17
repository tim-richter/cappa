---
"@cappa/cli": minor
---

`cappa review` and `cappa serve` move to the next free port when the requested one is taken (up to 20 ports on), warn, and print the URL they actually bound. `serve`'s structured `port=` line reports the bound port. Pass `--strict-port` to exit with an error instead.

A loopback bind now also listens on the other loopback address (`::1` for `127.0.0.1` and vice versa), and a port taken on either counts as in use, so the printed `localhost` URL can no longer reach a different server holding the other address. `--host localhost` binds `127.0.0.1` plus `::1`, bracketed IPv6 hosts (`--host [::1]`) bind correctly, and URLs for other `127.x` or IPv6 hosts print the literal address instead of `localhost`.
