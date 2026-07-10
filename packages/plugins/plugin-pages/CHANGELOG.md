# @cappa/plugin-pages

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
