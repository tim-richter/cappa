#!/usr/bin/env bash
#
# Package the built review UI alongside the server build.
#
# The UI is built by its own package, not here. The root `build` script runs
# every other package first and this one last, because the ordering cannot be
# expressed in the dependency graph: `@cappa/client` dev-depends on
# `@cappa/server` for its integration tests, `@cappa/server` packages `web`,
# and `web` depends on `@cappa/client` — a cycle.
#
# This script used to run `pnpm -C ../web build` itself, which was wrong twice
# over: two vite processes wrote apps/web/dist concurrently, and — because the
# script had no `set -e` — a web build that failed to resolve `@cappa/client`
# (not yet built) was ignored, and its broken output was copied into public/
# and published. Such a bundle is dead on arrival in the browser and nothing
# else catches it, so the check at the bottom makes that failure un-shippable
# however it arises.
set -euo pipefail

cd "$(dirname "$0")/.."

WEB_DIST="../web/dist"

if [ ! -f "$WEB_DIST/index.html" ]; then
  echo "error: $WEB_DIST/index.html not found — the review UI has not been built." >&2
  echo "       Build it first: pnpm -r build (or pnpm -F web build)." >&2
  exit 1
fi

rm -rf dist public

pnpm build:ts

cp -r "$WEB_DIST" public
rm -rf public/images # Remove example images

# A bare workspace import means vite could not resolve a @cappa/* package at
# build time and externalized it. The browser cannot resolve it either.
if grep -rlE '(from|import)[[:space:]]*"@cappa/' public/assets >/dev/null 2>&1; then
  echo "error: the packaged UI bundle contains unresolved @cappa/* imports." >&2
  echo "       The web build ran before its workspace dependencies were built." >&2
  grep -rhoE '(from|import)[[:space:]]*"@cappa/[a-z-]+"' public/assets | sort -u >&2
  exit 1
fi
