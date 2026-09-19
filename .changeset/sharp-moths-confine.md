---
"@cappa/core": patch
"@cappa/plugin-storybook": patch
---

Confine screenshot writes to the screenshot directories.

`variants[].filename` was passed through verbatim into `path.resolve(actual, filename)`, so an absolute path or `../` traversal could write a PNG outside `outputDir`. For `@cappa/plugin-storybook` that name comes from story parameters in the browser, meaning a story could clobber any file the process can write.

`getVariantFilename` now sanitizes an explicit variant filename (separators are kept, traversal, `.`, empty segments and Windows drive prefixes are dropped, falling back to the derived name when nothing usable is left), and `ScreenshotFileSystem` rejects any filename that resolves outside of `actual/`, `expected/` or `diff/` as a hard backstop. `sanitizeScreenshotFilename` is exported for plugin authors.
