---
"@cappa/cli": patch
"@cappa/plugin-storybook": patch
"@cappa/plugin-pages": patch
---

fix(cli): exit 1 for new and deleted screenshots so CI catches unreviewed baselines

New screenshots (no baseline to compare) now return `success: false` instead of `true`, so `capture` exits 1 and the failure report lists them alongside changed screenshots. After all plugins finish, `capture` also checks for deleted screenshots (baselines with no corresponding actual) and exits 1 if any are found. This aligns the exit code with the `onFail` callback, which already included both categories.
