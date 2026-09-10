---
"@cappa/plugin-storybook": minor
---

Support Storybook args and globals per story and per variant.

`globals` is new on both `parameters.cappa` and a variant's `options`, and merges plugin config →
story → variant. This is what makes light/dark captures work: a globals-driven theme switcher can
render one story twice, once per theme. Previously every variant reused the plugin-level globals, so
two themed variants silently captured the same render twice.

Story-level `args` now takes effect as well. The type has always accepted `parameters.cappa.args`,
but the story's own screenshot was captured at the URL built during discovery — before the story had
reported anything — so those args were silently dropped and only a variant's `options.args` were
applied. A story that sets `args` or `globals` is now reloaded once with the rebuilt URL before cappa
waits for animations and the play function. Only stories that set them pay for the reload.

If you already had `parameters.cappa.args` in a story file, it starts applying now and that story's
baseline will change.
