import { afterEach, describe, expect, it, vi } from "vitest";

const { loggerInstance } = vi.hoisted(() => ({
  loggerInstance: {
    level: 4,
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    box: vi.fn(),
  },
}));

vi.mock("@cappa/logger", () => ({
  getLogger: () => loggerInstance,
  initLogger: () => loggerInstance,
}));

import { registerShutdownHandlers } from "./server";

describe("registerShutdownHandlers", () => {
  let unregister: (() => void) | undefined;

  afterEach(() => {
    unregister?.();
    unregister = undefined;
    loggerInstance.info.mockReset();
  });

  const makeMocks = () => {
    const order: string[] = [];
    const server = {
      close: vi.fn(async () => {
        order.push("server");
      }),
    };
    const engine = {
      close: vi.fn(async () => {
        order.push("engine");
      }),
    };
    const exit = vi.fn();
    return { server, engine, exit, order };
  };

  it("closes the server before the engine on SIGINT", async () => {
    const { server, engine, exit, order } = makeMocks();
    unregister = registerShutdownHandlers(server, engine, exit);

    process.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    // Server first: no new run can start while the engine is being torn down.
    expect(order).toEqual(["server", "engine"]);
    expect(exit).toHaveBeenCalledWith(130);
  });

  it("shuts down on SIGTERM too", async () => {
    const { server, engine, exit } = makeMocks();
    unregister = registerShutdownHandlers(server, engine, exit);

    process.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(engine.close).toHaveBeenCalledOnce();
  });

  it("closes the browser even when the server fails to close", async () => {
    const { engine, exit } = makeMocks();
    const server = {
      close: vi.fn(async () => {
        throw new Error("server already closed");
      }),
    };
    unregister = registerShutdownHandlers(server, engine, exit);

    process.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    // Otherwise a failed shutdown leaves an orphaned Chromium behind.
    expect(engine.close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(130);
  });

  it("still exits when the engine fails to close", async () => {
    const { server, exit } = makeMocks();
    const engine = {
      close: vi.fn(async () => {
        throw new Error("browser is wedged");
      }),
    };
    unregister = registerShutdownHandlers(server, engine, exit);

    process.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(exit).toHaveBeenCalledWith(130);
  });

  it("exits immediately on a second signal", async () => {
    const { engine, exit } = makeMocks();
    let release: (() => void) | undefined;
    const server = {
      close: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    };
    unregister = registerShutdownHandlers(server, engine, exit);

    process.emit("SIGINT");
    // The first shutdown is still in flight.
    expect(exit).not.toHaveBeenCalled();

    process.emit("SIGINT");
    expect(exit).toHaveBeenCalledWith(130);
    expect(engine.close).not.toHaveBeenCalled();

    release?.();
  });

  it("stops handling signals after unregister", () => {
    const { server, engine, exit } = makeMocks();
    const stop = registerShutdownHandlers(server, engine, exit);
    stop();

    process.emit("SIGINT");
    process.emit("SIGTERM");

    expect(server.close).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
