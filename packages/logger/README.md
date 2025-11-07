# Logger Package

This package contains the logger for Cappa.

It is based on the [Consola](https://github.com/unjs/consola) library.

It behaves like a singleton and is initialized with a log level.

## Why the logger is cached globally

Both the Cappa CLI and the Storybook plugin are dual-published as CommonJS and
ES modules. Node will therefore evaluate `@cappa/logger` twice—once per module
graph—unless we explicitly cache the instance on `globalThis`. This package does
that automatically so calls to `getLogger()` in either environment share the
same underlying Consola instance.

## Example

```ts
import { initLogger } from "@cappa/logger";

initLogger(0);
```

The log level can be set to:

- 0: fatal and error
- 1: warn
- 2: log
- 3: info
- 4: debug
- 5: trace

The default log level is 3.

```ts
import { getLogger } from "@cappa/logger";

const logger = getLogger();

logger.info("Hello, world!");
```