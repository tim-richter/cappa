---
"@cappa/core": minor
"@cappa/protocol": minor
"@cappa/cli": minor
"@cappa/server": minor
---

Show agent review verdicts in the review UI, add `cappa capture --json`, and stop filtered captures from marking everything else as deleted.

- `collectScreenshots` folds the last `cappa agent check` verdict into changed screenshots as `review` (label, headline, rationale, source, confidence, pending, reviewedAt). It is dropped as soon as either image is newer than the check. `@cappa/protocol` carries it as an optional field. The review UI shows a verdict badge in the list, the grid and the detail header, plus a summary of the headline and its reasons on the detail page.
- `cappa capture --json` prints one JSON document (`ok`, `tasks`, `screenshots`, `errors`, `results`, `next`) instead of progress output. Info output is muted, while warnings and errors stay on stderr. Broken tasks (`errors`) are kept separate from screenshots that differ (`results`).
- The review UI's severity and change-type styles now match the lowercase and kebab-case values that current `@blazediff/interpret-native` reports.
- `cappa capture --filter` no longer empties `actual/` and `diff/`. Before, every screenshot outside the filter lost its capture and showed up as `deleted`, and approving that deleted its baseline. Full runs still start clean.
- Each capture now removes its screenshot's diff from earlier runs before comparing. A screenshot that was re-captured on its own (from the review UI, or with a filtered run) and now matches no longer stays `changed` because of a leftover diff image.
