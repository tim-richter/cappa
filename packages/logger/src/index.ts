import { type ConsolaInstance, createConsola } from "consola";

export type Logger = ConsolaInstance;

// The Storybook plugin ships both CommonJS and ES module builds. When it is
// consumed alongside the CLI we end up loading `@cappa/logger` twice (once via
// CJS and once via ESM). The global cache ensures both module graphs reference
// the same logger instance so `getLogger` stays in sync regardless of how the
// package was required.
const GLOBAL_LOGGER_KEY = "__CAPPA_LOGGER__" as const;

type GlobalWithLogger = typeof globalThis & {
  [GLOBAL_LOGGER_KEY]?: Logger | null;
};

const globalWithLogger = globalThis as GlobalWithLogger;

let logger: Logger | null = globalWithLogger[GLOBAL_LOGGER_KEY] ?? null;

const setLogger = (instance: Logger) => {
  logger = instance;
  globalWithLogger[GLOBAL_LOGGER_KEY] = instance;
};

export const initLogger = (level: number) => {
  if (!logger) {
    const instance = createConsola({
      level,
      formatOptions: {
        colors: true,
        date: false,
      },
    });

    instance.wrapConsole();
    setLogger(instance);
  }

  return logger;
};

export function getLogger(): Logger {
  if (!logger) {
    const globalLogger = globalWithLogger[GLOBAL_LOGGER_KEY];
    if (globalLogger) {
      logger = globalLogger;
    }
  }

  if (!logger) throw new Error("Logger not initialized.");
  return logger;
}
