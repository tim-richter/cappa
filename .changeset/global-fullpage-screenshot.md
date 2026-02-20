---
"@cappa/core": minor
"@cappa/cli": minor
---

Add global `screenshot.fullPage` and `screenshot.viewport` configuration.

Screenshots now default to full-page capture (`fullPage: true`) at the global level. This applies to all plugins (including Storybook) when per-task options don't override it. Set `screenshot.fullPage: false` in `cappa.config.ts` to use viewport-only screenshots by default.
