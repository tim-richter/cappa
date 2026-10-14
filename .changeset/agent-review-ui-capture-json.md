---
"@cappa/core": minor
"@cappa/protocol": minor
"@cappa/cli": minor
"@cappa/server": minor
---

Show agent review verdicts in the review UI, and add `cappa capture --json`.

- `collectScreenshots` folds the last `cappa agent check` verdict into changed screenshots as `review` (label, headline, rationale, source, confidence, pending, reviewedAt). It is dropped as soon as either image is newer than the check. `@cappa/protocol` carries it as an optional field. The review UI shows a verdict badge in the list, the grid and the detail header, plus a summary of the headline and its reasons on the detail page.
- `cappa capture --json` prints one JSON document (`ok`, `tasks`, `screenshots`, `errors`, `results`, `next`) instead of progress output. Info output is muted, while warnings and errors stay on stderr. Broken tasks (`errors`) are kept separate from screenshots that differ (`results`).
- The review UI's severity and change-type styles now match the lowercase and kebab-case values that current `@blazediff/interpret-native` reports.
