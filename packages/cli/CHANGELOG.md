# @cappa/cli

## 0.5.0

### Minor Changes

- 13d5697: feat(cli): add more detailed error report

### Patch Changes

- 52922a9: deps: upgrade dependencies
- Updated dependencies [52922a9]
  - @cappa/core@0.4.6
  - @cappa/server@0.2.9

## 0.4.5

### Patch Changes

- c248f15: fix(cli): cjs import

## 0.4.4

### Patch Changes

- c3b2cfc: fix: new diff types
- Updated dependencies [c3b2cfc]
  - @cappa/core@0.4.5
  - @cappa/server@0.2.8

## 0.4.3

### Patch Changes

- Updated dependencies [e59bfe7]
  - @cappa/core@0.4.4
  - @cappa/server@0.2.7

## 0.4.2

### Patch Changes

- Updated dependencies [365290f]
  - @cappa/logger@0.0.8
  - @cappa/core@0.4.3
  - @cappa/server@0.2.6

## 0.4.1

### Patch Changes

- 1fad7cc: fix: deleted screenshot handling in approve command
- Updated dependencies [1fad7cc]
  - @cappa/logger@0.0.7
  - @cappa/core@0.4.2
  - @cappa/server@0.2.5

## 0.4.0

### Minor Changes

- 188da53: Ensure `cappa approve` removes expected screenshots that no longer have a matching capture so stale baselines are cleaned up automatically.

## 0.3.2

### Patch Changes

- 298486b: fix: package export types
- Updated dependencies [298486b]
  - @cappa/logger@0.0.6
  - @cappa/core@0.4.1
  - @cappa/server@0.2.4

## 0.3.1

### Patch Changes

- Updated dependencies [1304724]
  - @cappa/server@0.2.3

## 0.3.0

### Minor Changes

- 915be10: Add a `logConsoleEvents` base configuration option that controls whether Playwright console
  messages are logged during captures, and have the Storybook plugin respect the global setting.

### Patch Changes

- Updated dependencies [915be10]
- Updated dependencies [1e8f301]
  - @cappa/core@0.4.0
  - @cappa/logger@0.0.5
  - @cappa/server@0.2.2

## 0.2.4

### Patch Changes

- 0203154: Sort review screenshots by status so new, deleted, changed, and passed items appear in a predictable order within the review server.
- 772d0f6: Ensure approving screenshots only updates baselines when actual and expected images differ.
- Updated dependencies [772d0f6]
  - @cappa/core@0.3.1
  - @cappa/server@0.2.1

## 0.2.3

### Patch Changes

- Updated dependencies [1228323]
  - @cappa/server@0.2.0

## 0.2.2

### Patch Changes

- Updated dependencies [360fa80]
  - @cappa/server@0.1.11

## 0.2.1

### Patch Changes

- d6fd7cc: Ensure the capture command exits with a non-zero status when any screenshot task fails or produces a comparison failure.

## 0.2.0

### Minor Changes

- e0f7f08: Add an `onFail` configuration callback for failed screenshots and forward environment details to configuration functions.

### Patch Changes

- Updated dependencies [e0f7f08]
  - @cappa/core@0.3.0
  - @cappa/server@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies [faa5c05]
  - @cappa/core@0.2.5
  - @cappa/server@0.1.9

## 0.1.8

### Patch Changes

- 6afa8eb: fix: less redundant logs
- Updated dependencies [6afa8eb]
  - @cappa/core@0.2.4
  - @cappa/server@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [4068bca]
  - @cappa/core@0.2.3
  - @cappa/server@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [6526418]
  - @cappa/core@0.2.2
  - @cappa/server@0.1.6

## 0.1.5

### Patch Changes

- 526857a: feat: add variant and play function support
- Updated dependencies [526857a]
  - @cappa/server@0.1.5
  - @cappa/core@0.2.1
  - @cappa/logger@0.0.4

## 0.1.4

### Patch Changes

- 4428907: Add unit test coverage for CLI commands.
- 88b3648: Centralize screenshot directory management in the core package and update the CLI and server to consume the shared helpers.
- f3f64c6: Switch CLI globbing to the built-in Node.js implementation.
- Updated dependencies [5b1f66f]
- Updated dependencies [87c8ab9]
- Updated dependencies [a1d91c6]
- Updated dependencies [88b3648]
  - @cappa/core@0.2.0
  - @cappa/server@0.1.4

## 0.1.3

### Patch Changes

- f6456fb: feat: add retry functionality
- Updated dependencies [f6456fb]
  - @cappa/server@0.1.3
  - @cappa/core@0.1.3
  - @cappa/logger@0.0.3

## 0.1.2

### Patch Changes

- a772b76: Add better logging + cleanup
- Updated dependencies [a772b76]
  - @cappa/server@0.1.2
  - @cappa/core@0.1.2
  - @cappa/logger@0.0.2

## 0.1.1

### Patch Changes

- d640855: Fix server public folder publish
- Updated dependencies [d640855]
  - @cappa/server@0.1.1
  - @cappa/core@0.1.1

## 0.1.0

### Minor Changes

- 78c1423: Add review functionality

### Patch Changes

- Updated dependencies [78c1423]
  - @cappa/server@0.1.0
  - @cappa/core@0.1.0

## 0.0.29

### Patch Changes

- Updated dependencies [8c17aac]
  - @cappa/core@0.0.27

## 0.0.28

### Patch Changes

- Updated dependencies [f232833]
  - @cappa/core@0.0.26

## 0.0.27

### Patch Changes

- e949088: Improve ui freezing styles
- Updated dependencies [e949088]
  - @cappa/core@0.0.25

## 0.0.26

### Patch Changes

- 4e109c5: Fix browsers path discovery
- Updated dependencies [4e109c5]
  - @cappa/core@0.0.24

## 0.0.25

### Patch Changes

- df7a7ec: Add more screenshot options
- Updated dependencies [df7a7ec]
  - @cappa/core@0.0.23

## 0.0.24

### Patch Changes

- 27a570a: Always use png screenshots
- Updated dependencies [27a570a]
  - @cappa/core@0.0.22

## 0.0.23

### Patch Changes

- e01e7c5: Add better report output
- Updated dependencies [e01e7c5]
  - @cappa/core@0.0.21

## 0.0.22

### Patch Changes

- eb34ecb: Add clean option to cli
- Updated dependencies [eb34ecb]
  - @cappa/core@0.0.20

## 0.0.21

### Patch Changes

- 63cf442: Use logging in storybook plugin
- Updated dependencies [63cf442]
  - @cappa/core@0.0.19

## 0.0.20

### Patch Changes

- 3a8b89e: Fix skipped stories and report
- Updated dependencies [3a8b89e]
  - @cappa/core@0.0.18

## 0.0.19

### Patch Changes

- 6d7176e: Fix error reporting
- Updated dependencies [6d7176e]
  - @cappa/core@0.0.17

## 0.0.18

### Patch Changes

- 92d164e: Fix directory creation
- Updated dependencies [92d164e]
  - @cappa/core@0.0.16

## 0.0.17

### Patch Changes

- a41a91e: Add fullPage option
- Updated dependencies [a41a91e]
  - @cappa/core@0.0.15

## 0.0.16

### Patch Changes

- b8af138: Screenshot Creation folders
- Updated dependencies [b8af138]
  - @cappa/core@0.0.14

## 0.0.15

### Patch Changes

- Updated dependencies [c538974]
  - @cappa/core@0.0.13

## 0.0.14

### Patch Changes

- 4e529fd: New options
- Updated dependencies [4e529fd]
  - @cappa/core@0.0.12

## 0.0.13

### Patch Changes

- db0af3a: Recreate outputdir

## 0.0.12

### Patch Changes

- 990246d: Fix
- Updated dependencies [990246d]
  - @cappa/core@0.0.11

## 0.0.11

### Patch Changes

- 861821a: Remove output dir

## 0.0.10

### Patch Changes

- c8f7bd8: Fix concurrency
- Updated dependencies [c8f7bd8]
  - @cappa/core@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [37f2587]
  - @cappa/core@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [76854a2]
  - @cappa/core@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies [3c53e57]
  - @cappa/core@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [2acecef]
  - @cappa/core@0.0.6

## 0.0.5

### Patch Changes

- Updated dependencies [a8a0d8f]
  - @cappa/core@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies [148b9ca]
  - @cappa/core@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [bff1e95]
  - @cappa/core@0.0.3

## 0.0.2

### Patch Changes

- b3d2806: Init
- Updated dependencies [b3d2806]
  - @cappa/core@0.0.2
