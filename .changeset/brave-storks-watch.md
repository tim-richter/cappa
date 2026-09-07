---
"@cappa/plugin-storybook": minor
---

Carry each story's `importPath` onto its capture task and implement plugin watch
support with it.

Saving a story file now re-captures only the stories that file declares — the
story index already knows the mapping. Saving anything else resolves to `null`,
which re-runs the plugin rather than guessing. `watchPaths` overrides the story
globs added to the watched set.
