---
"@cappa/cli": patch
---

fix: pass through `diff.interpret` when normalizing the pixel diff config

The CLI's config normalization rebuilt the pixel `diff` object from a fixed
field whitelist that omitted `interpret`, so `diff: { interpret: true }` in
`cappa.config.ts` was silently dropped before reaching the screenshot tool. As
a result the interpretation pass never ran and no `diff/<name>.json` sidecars
were written, so the CLI `status` output and the review UI never surfaced any
interpretation. The flag is now forwarded correctly.
