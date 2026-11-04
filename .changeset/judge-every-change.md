---
"@cappa/core": minor
"@cappa/cli": minor
"@cappa/server": patch
---

Agent review no longer labels changes from diff signals. Cappa's diff threshold already absorbs sub-pixel rendering, and the heuristic mislabelled exactly the changes that matter — a larger font read as a harmless shift plus recolour and was never looked at. Now every changed screenshot gets a judgment request and stays pending until a judge records a verdict.

- `cappa agent check` drops `--judge`; results carry a neutral `change` line (`2 regions @ top-left (1.20%)`) for grouping instead of a heuristic `verdict`, and `verdict.source` is gone.
- `request.json` no longer includes the heuristic label, severity, interpretation summary or region change types, so nothing primes the judge.
- `cappa agent approve --label` only matches judged screenshots.
- The skill's judging guide asks the judge to compare sizes and spacing, and to treat the code diff as evidence only for what it should change.
- `@cappa/core` removes `deriveVerdict`, `buildHeadline`, `SUB_PERCEPTUAL_PIXELS`, `JUDGED_LABELS`, `isJudgedLabel`, `JudgeMode` and `JUDGE_MODES`, and adds `describeChange`. `VERDICT_LABELS` no longer includes `ambiguous`. The agent report format is now version 2; reports from earlier versions are ignored.
- The review UI shows only judges' verdicts.
