---
"@cappa/core": minor
"@cappa/config": minor
"@cappa/plugin-storybook": minor
"@cappa/plugin-pages": minor
---

New `screenshot.crop` option crops screenshots to the content actually painted on the page instead of capturing the whole viewport. A small component on a 1920px viewport is mostly empty canvas, which dilutes every diff percentage: one changed word is ~0.01% of the viewport but several percent of the component. The viewport stays the layout size, so responsive styles are unaffected; it becomes the most a screenshot can cover.

- `crop: true` measures `body` with 8px of padding; `{ root, padding }` changes either.
- Content is what is painted: text, images, SVGs, form controls, and elements with a visible background, border, outline or box-shadow. Full-width wrappers with nothing of their own to draw do not stretch the crop. Portals rendered into `body` (popovers, dialogs) are included, and hidden subtrees and overflow-clipped descendants are not.
- `@cappa/plugin-storybook` takes `crop` at plugin level, as a story parameter and per variant. `@cappa/plugin-pages` takes it in `defaults` and per page.
- `ScreenshotSettings.crop` and `measureContentClip` are exported from `@cappa/core` for custom plugins.

Turning `crop` on changes the size of every screenshot, so existing baselines show as changed once.
