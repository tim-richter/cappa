---
"@cappa/core": minor
"@cappa/cli": minor
---

Add opt-in structured diff interpretation via `diff.interpret`. When enabled, changed screenshots get a `diff/<name>.json` sidecar (alongside the diff image) describing *what* changed — additions, deletions, color shifts and content changes grouped into regions, with a human-readable summary and severity. The sidecar is only written when interpretation is enabled (no extra files appear otherwise), is read back when the review UI and CLI rebuild state from disk, and is exposed on `ChangedScreenshot.diffMeta`.

When the sidecar is present, the `cappa status` command prints a per-screenshot breakdown of changed screenshots (diff percentage, severity, region count and summary), and the review UI surfaces a severity badge, an interpretation summary banner and interactive, color-coded region overlays on the diff view.

Interpretation is pixel-diff only and ignored when `diff.type: 'gmsd'`.
