---
"@cappa/cli": minor
"@cappa/server": minor
"@cappa/config": patch
---

Add `cappa serve`, a capture host without the review UI's framing.

`cappa review` assumes a person is about to open a browser: it names itself after
the UI, prints a URL, and generates an access token off loopback so that URL is
usable. `cappa serve` is the same server for a machine — `--port`, `--host`,
`--token`, `--read-only`, `--no-ui` — that logs one structured line and then goes
quiet. It is what a remote `cappa capture --server` will connect to.

The one deliberate divergence is the token. `review` generates one off loopback
because a human is reading the URL it prints; `serve` has no such reader, so
generating one there would produce a daemon nobody can authenticate against.
Off loopback `serve` requires a token and refuses to start without one, naming
`--token` and `CAPPA_TOKEN` in the error.

`--token` now falls back to `CAPPA_TOKEN` on both commands, so a CI job need not
put the token in its process list.

`@cappa/server`'s `createServer` gains a `ui` option, separating "serve the
review UI" from "run in production mode" — `--no-ui` skips the UI's static files
and its SPA fallback while leaving `/api/*` untouched.
