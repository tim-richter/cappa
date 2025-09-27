import { type ConsolaInstance, createConsola } from "consola";

export type Logger = ConsolaInstance;

let logger: Logger | null = null;

export const initLogger = (level: number) => {
  if (!logger) {
    logger = createConsola({
      level,
      formatOptions: {
        colors: true,
        date: false,
      },
    });

    logger.wrapConsole();
  }

  return logger;
};

export function getLogger(): Logger {
  if (!logger) throw new Error("Logger not initialized.");
  return logger;
}
