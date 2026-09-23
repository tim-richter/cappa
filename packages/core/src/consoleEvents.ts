import type { ConsoleMessage, Page } from "playwright-core";

/**
 * Minimum severity of browser console output to forward, ordered from most
 * to least severe. Browser `console.warn` is reported by Playwright as
 * `warning`; it maps to `"warn"` here.
 */
export type ConsoleLogLevel = "error" | "warn" | "info" | "log" | "debug";

/**
 * `true` forwards every console message at the logger's debug level (the
 * historical behaviour), `false` forwards none, and a {@link ConsoleLogLevel}
 * forwards messages at or above that severity at their matching logger level.
 */
export type LogConsoleEvents = boolean | ConsoleLogLevel;

export const CONSOLE_LOG_LEVELS: readonly ConsoleLogLevel[] = [
  "error",
  "warn",
  "info",
  "log",
  "debug",
];

type ConsoleEventLogger = Record<
  ConsoleLogLevel,
  (message: any, ...args: any[]) => void
>;

/** Maps a Playwright `ConsoleMessage.type()` onto a {@link ConsoleLogLevel}. */
export const toConsoleLogLevel = (
  type: ReturnType<ConsoleMessage["type"]> | string,
): ConsoleLogLevel => {
  switch (type) {
    case "error":
    case "assert":
      return "error";
    case "warning":
      return "warn";
    case "info":
      return "info";
    case "debug":
    case "trace":
      return "debug";
    default:
      return "log";
  }
};

const severity = (level: ConsoleLogLevel) => CONSOLE_LOG_LEVELS.indexOf(level);

/**
 * Wires a page's `console` and `pageerror` events to `logger` according to
 * `setting`. Uncaught page errors are always forwarded — at error level when
 * a severity threshold is set, at debug level otherwise.
 */
export const attachConsoleLogging = (
  page: Pick<Page, "on">,
  setting: LogConsoleEvents | undefined,
  logger: ConsoleEventLogger,
): void => {
  const threshold = setting ?? true;

  if (threshold === true) {
    page.on("console", (message) => {
      logger.debug("console", message.text());
    });
  } else if (threshold !== false) {
    page.on("console", (message) => {
      const level = toConsoleLogLevel(message.type());
      if (severity(level) > severity(threshold)) return;
      logger[level](`[browser ${level}]`, message.text());
    });
  }

  page.on("pageerror", (error) => {
    if (typeof threshold === "string") {
      logger.error("[browser pageerror]", error);
    } else {
      logger.debug("pageerror", error);
    }
  });
};
