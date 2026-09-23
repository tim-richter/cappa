import { describe, expect, it, vi } from "vitest";
import { attachConsoleLogging, toConsoleLogLevel } from "./consoleEvents";

const createPage = () => {
  const handlers = new Map<string, (arg: any) => void>();
  return {
    page: {
      on: vi.fn((event: string, handler: (arg: any) => void) => {
        handlers.set(event, handler);
      }),
    } as any,
    emitConsole: (type: string, text: string) =>
      handlers.get("console")?.({ type: () => type, text: () => text }),
    emitPageError: (error: Error) => handlers.get("pageerror")?.(error),
    has: (event: string) => handlers.has(event),
  };
};

const createLogger = () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  debug: vi.fn(),
});

describe("toConsoleLogLevel", () => {
  it.each([
    ["error", "error"],
    ["assert", "error"],
    ["warning", "warn"],
    ["info", "info"],
    ["log", "log"],
    ["table", "log"],
    ["debug", "debug"],
    ["trace", "debug"],
  ])("maps %s to %s", (type, level) => {
    expect(toConsoleLogLevel(type)).toBe(level);
  });
});

describe("attachConsoleLogging", () => {
  it("logs every message at debug level when true", () => {
    const { page, emitConsole } = createPage();
    const logger = createLogger();
    attachConsoleLogging(page, true, logger);

    emitConsole("error", "boom");
    emitConsole("log", "hello");

    expect(logger.debug).toHaveBeenCalledWith("console", "boom");
    expect(logger.debug).toHaveBeenCalledWith("console", "hello");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("defaults to true when undefined", () => {
    const { page, emitConsole } = createPage();
    const logger = createLogger();
    attachConsoleLogging(page, undefined, logger);

    emitConsole("log", "hello");

    expect(logger.debug).toHaveBeenCalledWith("console", "hello");
  });

  it("does not subscribe to console when false", () => {
    const { page, has, emitPageError } = createPage();
    const logger = createLogger();
    attachConsoleLogging(page, false, logger);

    expect(has("console")).toBe(false);

    const error = new Error("uncaught");
    emitPageError(error);
    expect(logger.debug).toHaveBeenCalledWith("pageerror", error);
  });

  it("only forwards errors when set to 'error'", () => {
    const { page, emitConsole, emitPageError } = createPage();
    const logger = createLogger();
    attachConsoleLogging(page, "error", logger);

    emitConsole("error", "boom");
    emitConsole("warning", "careful");
    emitConsole("log", "hello");
    const error = new Error("uncaught");
    emitPageError(error);

    expect(logger.error).toHaveBeenCalledWith("[browser error]", "boom");
    expect(logger.error).toHaveBeenCalledWith("[browser pageerror]", error);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it("forwards warnings and errors when set to 'warn'", () => {
    const { page, emitConsole } = createPage();
    const logger = createLogger();
    attachConsoleLogging(page, "warn", logger);

    emitConsole("error", "boom");
    emitConsole("warning", "careful");
    emitConsole("info", "fyi");

    expect(logger.error).toHaveBeenCalledWith("[browser error]", "boom");
    expect(logger.warn).toHaveBeenCalledWith("[browser warn]", "careful");
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("forwards everything at matching levels when set to 'debug'", () => {
    const { page, emitConsole } = createPage();
    const logger = createLogger();
    attachConsoleLogging(page, "debug", logger);

    emitConsole("log", "hello");
    emitConsole("debug", "verbose");

    expect(logger.log).toHaveBeenCalledWith("[browser log]", "hello");
    expect(logger.debug).toHaveBeenCalledWith("[browser debug]", "verbose");
  });
});
