---
"@cappa/core": minor
"@cappa/plugin-storybook": minor
"@cappa/plugin-pages": minor
---

`logConsoleEvents` now also accepts a severity (`'error' | 'warn' | 'info' | 'log' | 'debug'`). Only browser console messages at or above that severity are logged, at their matching log level, so `logConsoleEvents: 'error'` surfaces browser errors without raising `--log-level`. `true` and `false` behave as before. Adds the `attachConsoleLogging` helper to `@cappa/core` for plugins.
