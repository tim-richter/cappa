# Logger Package

This package contains the logger for Cappa.

It is based on the [Consola](https://github.com/unjs/consola) library.

It behaves like a singleton and is initialized with a log level.

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