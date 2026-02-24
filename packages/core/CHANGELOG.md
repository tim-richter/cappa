# @cappa/core

## 0.6.0

### Minor Changes

- 337f150: Add global `screenshot.fullPage` and `screenshot.viewport` configuration.

  Screenshots now default to full-page capture (`fullPage: true`) at the global level. This applies to all plugins (including Storybook) when per-task options don't override it. Set `screenshot.fullPage: false` in `cappa.config.ts` to use viewport-only screenshots by default.

### Patch Changes

- ccc1c16: fix diff option typing and runtime handling for pixel and gmsd algorithms across config and Storybook per-screenshot overrides.
- b70bb4e: Add debug logging when screenshot capture waits for a configured `delay`, and add regression tests to verify delay handling in core screenshots and Storybook-provided screenshot options.
- 5159a52: fix: build
- Updated dependencies [5159a52]
  - @cappa/logger@0.0.9

## 0.5.1

### Patch Changes

- 1606296: Remove deprecated @blazediff/types dependency. Types for pixel comparison now come from @blazediff/core (CoreOptions), and GMSD comparison uses GmsdOptions from @blazediff/gmsd.

## 0.5.0

### Minor Changes

- 3f392e2: feat: add options to override diff configs on per-screenshot level
- 11aeef9: feat: add review.theme config option for dark mode in review UI

### Patch Changes

- 34d27f5: Store diff generation metadata in produced PNG files, including the diff algorithm and configured comparison options. When approving screenshots, copy diff metadata onto approved expected PNGs so baseline images retain the accepted diff context.

## 0.4.7

### Patch Changes

- 5fb1cb5: fix: move playwright-core into peer deps

## 0.4.6

### Patch Changes

- 52922a9: deps: upgrade dependencies

## 0.4.5

### Patch Changes

- c3b2cfc: fix: new diff types

## 0.4.4

### Patch Changes

- e59bfe7: deps: upgrade dependencies

## 0.4.3

### Patch Changes

- 365290f: fix: package files export
- Updated dependencies [365290f]
  - @cappa/logger@0.0.8

## 0.4.2

### Patch Changes

- 1fad7cc: fix: deleted screenshot handling in approve command
- Updated dependencies [1fad7cc]
  - @cappa/logger@0.0.7

## 0.4.1

### Patch Changes

- 298486b: fix: package export types
- Updated dependencies [298486b]
  - @cappa/logger@0.0.6

## 0.4.0

### Minor Changes

- 915be10: Add a `logConsoleEvents` base configuration option that controls whether Playwright console
  messages are logged during captures, and have the Storybook plugin respect the global setting.

### Patch Changes

- Updated dependencies [1e8f301]
  - @cappa/logger@0.0.5

## 0.3.1

### Patch Changes

- 772d0f6: Ensure approving screenshots only updates baselines when actual and expected images differ.

## 0.3.0

### Minor Changes

- e0f7f08: Add an `onFail` configuration callback for failed screenshots and forward environment details to configuration functions.

## 0.2.5

### Patch Changes

- faa5c05: fix: better logs

## 0.2.4

### Patch Changes

- 6afa8eb: fix: less redundant logs

## 0.2.3

### Patch Changes

- 4068bca: fix: correct screenshot handling logic in ScreenshotTool

## 0.2.2

### Patch Changes

- 6526418: fix: actual screenshot error

## 0.2.1

### Patch Changes

- 526857a: feat: add variant and play function support
- Updated dependencies [526857a]
  - @cappa/logger@0.0.4

## 0.2.0

### Minor Changes

- 5b1f66f: Add support for capturing screenshot variants and configure Storybook stories to request multiple viewport screenshots.
- 88b3648: Centralize screenshot directory management in the core package and update the CLI and server to consume the shared helpers.

### Patch Changes

- 87c8ab9: Document how screenshot retries work in the docs so users know how to
  configure and reason about the behaviour.
- a1d91c6: feat: add viewport options

## 0.1.3

### Patch Changes

- f6456fb: feat: add retry functionality
- Updated dependencies [f6456fb]
  - @cappa/logger@0.0.3

## 0.1.2

### Patch Changes

- a772b76: Add better logging + cleanup
- Updated dependencies [a772b76]
  - @cappa/logger@0.0.2

## 0.1.1

### Patch Changes

- d640855: Fix server public folder publish

## 0.1.0

### Minor Changes

- 78c1423: Add review functionality

## 0.0.27

### Patch Changes

- 8c17aac: Remove sandboxing

## 0.0.26

### Patch Changes

- f232833: Increase deviceScaleFactor

## 0.0.25

### Patch Changes

- e949088: Improve ui freezing styles

## 0.0.24

### Patch Changes

- 4e109c5: Fix browsers path discovery

## 0.0.23

### Patch Changes

- df7a7ec: Add more screenshot options

## 0.0.22

### Patch Changes

- 27a570a: Always use png screenshots

## 0.0.21

### Patch Changes

- e01e7c5: Add better report output

## 0.0.20

### Patch Changes

- eb34ecb: Add clean option to cli

## 0.0.19

### Patch Changes

- 63cf442: Use logging in storybook plugin

## 0.0.18

### Patch Changes

- 3a8b89e: Fix skipped stories and report

## 0.0.17

### Patch Changes

- 6d7176e: Fix error reporting

## 0.0.16

### Patch Changes

- 92d164e: Fix directory creation

## 0.0.15

### Patch Changes

- a41a91e: Add fullPage option

## 0.0.14

### Patch Changes

- b8af138: Screenshot Creation folders

## 0.0.13

### Patch Changes

- c538974: Replace playwright with playwright-core

## 0.0.12

### Patch Changes

- 4e529fd: New options

## 0.0.11

### Patch Changes

- 990246d: Fix

## 0.0.10

### Patch Changes

- c8f7bd8: Fix concurrency

## 0.0.9

### Patch Changes

- 37f2587: Fix pages

## 0.0.8

### Patch Changes

- 76854a2: fix context

## 0.0.7

### Patch Changes

- 3c53e57: Reuse playwright pages

## 0.0.6

### Patch Changes

- 2acecef: Add skip option

## 0.0.5

### Patch Changes

- a8a0d8f: Add delay option

## 0.0.4

### Patch Changes

- 148b9ca: Fix dist folder

## 0.0.3

### Patch Changes

- bff1e95: Fix types

## 0.0.2

### Patch Changes

- b3d2806: Init
