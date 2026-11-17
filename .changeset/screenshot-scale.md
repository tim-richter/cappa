---
"@cappa/core": minor
"@cappa/config": minor
"@cappa/plugin-storybook": minor
"@cappa/plugin-pages": minor
---

Add `screenshot.scale` (`'css' | 'device'`, default `'css'`). Screenshots were always taken with Playwright's `scale: 'css'`, so a custom `deviceScaleFactor` changed how the page rendered but never the size of the PNG. With `scale: 'device'` the PNG is `deviceScaleFactor` times larger, for sharp captures of small components. Storybook story/variant parameters and plugin-pages per-page options can override it.
