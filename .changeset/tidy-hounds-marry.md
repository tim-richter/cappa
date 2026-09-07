---
"@cappa/server": patch
---

Fix `@cappa/server` being publishable with a broken review UI. `bin/build.sh`
built the web UI itself, concurrently with that package's own build, and had no
`set -e` — so when the UI build failed to resolve `@cappa/client` (not yet
built when the two raced), the failure was ignored and the broken bundle was
copied into `public/` and packaged. The script exited `0` throughout, and the
resulting UI dies in the browser with "Failed to resolve module specifier".

The UI is now built exactly once, by its own package, and `bin/build.sh` only
packages it: it fails loudly if that build has not run, and rejects a bundle
containing unresolved `@cappa/*` imports so the failure cannot ship however it
arises. The root `build` script orders the server last, which the dependency
graph cannot express — `@cappa/client` dev-depends on `@cappa/server` for its
integration tests, `@cappa/server` packages `web`, and `web` depends on
`@cappa/client`.
