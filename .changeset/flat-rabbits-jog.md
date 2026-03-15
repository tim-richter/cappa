---
"@cappa/plugin-storybook": minor
---

**Breaking:** `includeStories` and `excludeStories` are now predicate functions instead of string arrays.

- **Before:** `includeStories: ["button--*"]`, `excludeStories: ["*--secondary"]` (glob patterns matched against id, title, name, or path).
- **After:** `includeStories: (story) => boolean`, `excludeStories: (story) => boolean`. The argument is a `StoryFilterContext` with `id`, `title`, `name`, and `filePath` (`"title/name"`).

Migrate by replacing glob arrays with functions, e.g. `includeStories: (s) => s.id.startsWith('button--')`. Use `minimatch` in your config if you want glob-style matching. The package no longer depends on `minimatch`.