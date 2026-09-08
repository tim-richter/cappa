---
"@cappa/plugin-storybook": patch
"@cappa/plugin-pages": patch
"@cappa/protocol": patch
"@cappa/logger": patch
"@cappa/client": patch
"@cappa/config": patch
"@cappa/server": patch
"@cappa/core": patch
"@cappa/cli": patch
---

Build and type-check with TypeScript 7. The catalog-pinned `typescript` devDependency moves from
`6.0.3` to `7.0.2`, so declaration files are now emitted by the native compiler. No source or public
API changes.
