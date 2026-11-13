# @cappa/plugin-pages

## 0.4.2

### Patch Changes

- Updated dependencies [0eca3b9]
- Updated dependencies [aecf25c]
  - @cappa/core@0.19.0

## 0.4.1

### Patch Changes

- Updated dependencies [1297141]
  - @cappa/core@0.18.0

## 0.4.0

### Minor Changes

- b913c60: New `screenshot.crop` option crops screenshots to the content actually painted on the page instead of capturing the whole viewport. A small component on a 1920px viewport is mostly empty canvas, which dilutes every diff percentage: one changed word is ~0.01% of the viewport but several percent of the component. The viewport stays the layout size, so responsive styles are unaffected; it becomes the most a screenshot can cover.
  
  - `crop: true` measures `body` with 8px of padding; `{ root, padding }` changes either.
  - Content is what is painted: text, images, SVGs, form controls, and elements with a visible background, border, outline or box-shadow. Full-width wrappers with nothing of their own to draw do not stretch the crop. Portals rendered into `body` (popovers, dialogs) are included, and hidden subtrees and overflow-clipped descendants are not.
  - `@cappa/plugin-storybook` takes `crop` at plugin level, as a story parameter and per variant. `@cappa/plugin-pages` takes it in `defaults` and per page.
  - `ScreenshotSettings.crop` and `measureContentClip` are exported from `@cappa/core` for custom plugins.
  
  Turning `crop` on changes the size of every screenshot, so existing baselines show as changed once.

### Patch Changes

- Updated dependencies [b913c60]
- Updated dependencies [b913c60]
- Updated dependencies [b913c60]
  - @cappa/core@0.17.0

## 0.3.2

### Patch Changes

- Updated dependencies [7323d2c]
  - @cappa/core@0.16.0

## 0.3.1

### Patch Changes

- Updated dependencies [540c914]
- Updated dependencies [540c914]
  - @cappa/core@0.15.0

## 0.3.0

### Minor Changes

- 0162c16: `logConsoleEvents` now also accepts a severity (`'error' | 'warn' | 'info' | 'log' | 'debug'`). Only browser console messages at or above that severity are logged, at their matching log level, so `logConsoleEvents: 'error'` surfaces browser errors without raising `--log-level`. `true` and `false` behave as before. Adds the `attachConsoleLogging` helper to `@cappa/core` for plugins.

### Patch Changes

- Updated dependencies [0162c16]
  - @cappa/core@0.14.0

## 0.2.13

### Patch Changes

- Updated dependencies [b0c2cd5]
  - @cappa/core@0.13.2

## 0.2.12

### Patch Changes

- Updated dependencies [21556e3]
  - @cappa/core@0.13.1

## 0.2.11

### Patch Changes

- 4485e88: Build and type-check with TypeScript 7. The catalog-pinned `typescript` devDependency moves from
  `6.0.3` to `7.0.2`, so declaration files are now emitted by the native compiler. No source or public
  API changes.
- Updated dependencies [aeaaf3d]
- Updated dependencies [98c862e]
- Updated dependencies [b92b9c4]
- Updated dependencies [aeaaf3d]
- Updated dependencies [aeaaf3d]
- Updated dependencies [4485e88]
- Updated dependencies [180c4a6]
- Updated dependencies [98c862e]
- Updated dependencies [98c862e]
- Updated dependencies [aeaaf3d]
  - @cappa/core@0.13.0
  - @cappa/logger@0.0.12

## 0.2.10

### Patch Changes

- Updated dependencies [84c0de4]
  - @cappa/core@0.12.4

## 0.2.9

### Patch Changes

- 98940bf: update deps
- Updated dependencies [98940bf]
  - @cappa/core@0.12.3

## 0.2.8

### Patch Changes

- Updated dependencies [ef49619]
  - @cappa/core@0.12.2

## 0.2.7

### Patch Changes

- Updated dependencies [5548381]
- Updated dependencies [9b49288]
  - @cappa/core@0.12.1

## 0.2.6

### Patch Changes

- 466eb57: fix(cli): exit 1 for new and deleted screenshots so CI catches unreviewed baselines

  New screenshots (no baseline to compare) now return `success: false` instead of `true`, so `capture` exits 1 and the failure report lists them alongside changed screenshots. After all plugins finish, `capture` also checks for deleted screenshots (baselines with no corresponding actual) and exits 1 if any are found. This aligns the exit code with the `onFail` callback, which already included both categories.

## 0.2.5

### Patch Changes

- Updated dependencies [f90c13e]
  - @cappa/core@0.12.0

## 0.2.4

### Patch Changes

- Updated dependencies [e4c8abc]
- Updated dependencies [480735f]
  - @cappa/core@0.11.0

## 0.2.3

### Patch Changes

- Updated dependencies [fdbc39e]
  - @cappa/core@0.10.0

## 0.2.2

### Patch Changes

- Updated dependencies [a14c04b]
  - @cappa/core@0.9.0

## 0.2.1

### Patch Changes

- 3c247a1: chore: upgrade deps
- Updated dependencies [3c247a1]
  - @cappa/core@0.8.1
  - @cappa/logger@0.0.11

## 0.2.0

### Minor Changes

- eef23fa: Add `connectionTimeout` config option (default: 20s) to prevent indefinite hangs when targets like Storybook are unreachable

### Patch Changes

- Updated dependencies [eef23fa]
  - @cappa/core@0.8.0

## 0.1.3

### Patch Changes

- Updated dependencies [feff10a]
- Updated dependencies [6a21106]
  - @cappa/core@0.7.3

## 0.1.2

### Patch Changes

- Updated dependencies [a7b0539]
  - @cappa/core@0.7.2

## 0.1.1

### Patch Changes

- e4a910f: Add @cappa/plugin-pages for URL screenshot automation
- Updated dependencies [21ebbc5]
  - @cappa/core@0.7.1
