import { afterEach, describe, expect, test, vi } from "vitest";

const loggerFactory = vi.fn((options: any) => ({
  options,
  wrapConsole: vi.fn(),
  level: options.level,
  success: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("consola", () => ({
  createConsola: loggerFactory,
}));

const GLOBAL_LOGGER_KEY = "__CAPPA_LOGGER__";

const deleteGlobalLogger = () => {
  delete (globalThis as Record<string, unknown>)[GLOBAL_LOGGER_KEY];
};

afterEach(() => {
  deleteGlobalLogger();
  loggerFactory.mockClear();
  vi.resetModules();
});

describe("logger", () => {
  test("initLogger creates and caches a logger instance", async () => {
    const { initLogger } = await import("./index");

    const logger = initLogger(3);

    expect(loggerFactory).toHaveBeenCalledTimes(1);
    expect(loggerFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 3,
      }),
    );
    expect(logger?.wrapConsole).toHaveBeenCalledTimes(1);
    expect((globalThis as any)[GLOBAL_LOGGER_KEY]).toBe(logger);
  });

  test("getLogger reuses existing instance across module boundaries", async () => {
    const firstModule = await import("./index");
    const firstLogger = firstModule.initLogger(4);

    expect(loggerFactory).toHaveBeenCalledTimes(1);

    vi.resetModules();

    const secondModule = await import("./index");
    const secondLogger = secondModule.getLogger();

    expect(secondLogger).toBe(firstLogger);
    expect(loggerFactory).toHaveBeenCalledTimes(1);
  });

  test("getLogger throws when logger has not been initialised", async () => {
    const module = await import("./index");

    expect(() => module.getLogger()).toThrowError("Logger not initialized.");
  });
});
