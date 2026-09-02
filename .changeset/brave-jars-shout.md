---
"@cappa/cli": minor
---

Print the diff interpretation in `cappa capture` output. When a run fails, a "Changed Screenshots" box now lists every changed screenshot with its diff percentage and — when `diff.interpret` is enabled — its severity, summary and detected regions (change type, position and bounding box), so CI logs show where a change happened without opening the review UI. `cappa status` shows the same per-region breakdown. Regions are listed largest first and capped at five per screenshot; use the new `--max-regions <count>` flag on either command to list more (or `0` to omit the breakdown).
