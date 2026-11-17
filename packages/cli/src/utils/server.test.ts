import net from "node:net";
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

import {
  listenWithFallback,
  PortInUseError,
  registerShutdownHandlers,
  toDisplayHost,
} from "./server";

/** A real socket behind the `listen`/`addresses` shape Fastify exposes. */
const netListenable = () => {
  const server = net.createServer();
  return {
    server,
    listen: ({ port, host }: { port: number; host: string }) =>
      new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      }),
    addresses: () => [server.address() as net.AddressInfo],
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

/** Occupy `count` consecutive ports and return the first. */
const occupyPorts = async (count: number) => {
  for (;;) {
    const first = netListenable();
    await first.listen({ port: 0, host: "127.0.0.1" });
    const base = first.addresses()[0]?.port ?? 0;
    const held = [first];
    try {
      for (let i = 1; i < count; i++) {
        const next = netListenable();
        await next.listen({ port: base + i, host: "127.0.0.1" });
        held.push(next);
      }
      return { base, release: () => Promise.all(held.map((h) => h.close())) };
    } catch {
      // A neighbour was already taken by something else: try another range.
      await Promise.all(held.map((h) => h.close()));
    }
  }
};

const addressInUse = () =>
  Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });

describe("listenWithFallback", () => {
  const cleanup: Array<() => Promise<unknown>> = [];
  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((fn) => fn()));
  });

  it("binds the requested port when it is free", async () => {
    const { base, release } = await occupyPorts(1);
    await release();

    const server = netListenable();
    cleanup.push(server.close);
    await expect(
      listenWithFallback(server, { host: "127.0.0.1", port: base }),
    ).resolves.toBe(base);
  });

  it("moves to the next free port when the requested one is taken", async () => {
    const { base, release } = await occupyPorts(2);
    cleanup.push(release);

    const server = netListenable();
    cleanup.push(server.close);
    const onPortInUse = vi.fn();
    const port = await listenWithFallback(server, {
      host: "127.0.0.1",
      port: base,
      onPortInUse,
    });

    expect(port).toBe(base + 2);
    expect(server.addresses()[0]?.port).toBe(base + 2);
    expect(onPortInUse.mock.calls).toEqual([[base], [base + 1]]);
  });

  it("fails on a taken port with strictPort instead of moving on", async () => {
    const { base, release } = await occupyPorts(1);
    cleanup.push(release);

    const server = netListenable();
    const error = await listenWithFallback(server, {
      host: "127.0.0.1",
      port: base,
      strictPort: true,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(PortInUseError);
    expect(error.message).toContain(`Port ${base} on 127.0.0.1 is in use.`);
    expect(error.message).toContain("--strict-port");
  });

  it("gives up after maxAttempts and names the range it tried", async () => {
    const listen = vi.fn().mockRejectedValue(addressInUse());

    const error = await listenWithFallback(
      { listen },
      { host: "127.0.0.1", port: 4000, maxAttempts: 3 },
    ).catch((e) => e);

    expect(listen.mock.calls.map(([o]) => o.port)).toEqual([4000, 4001, 4002]);
    expect(error).toBeInstanceOf(PortInUseError);
    expect(error.message).toContain(
      "Ports 4000–4002 on 127.0.0.1 are all in use.",
    );
  });

  it("never tries past port 65535", async () => {
    const listen = vi.fn().mockRejectedValue(addressInUse());

    await expect(
      listenWithFallback({ listen }, { host: "127.0.0.1", port: 65534 }),
    ).rejects.toBeInstanceOf(PortInUseError);
    expect(listen.mock.calls.map(([o]) => o.port)).toEqual([65534, 65535]);
  });

  it("rethrows errors other than EADDRINUSE without trying another port", async () => {
    // EACCES would fail the same way on every port; retrying only hides it.
    const denied = Object.assign(new Error("listen EACCES"), {
      code: "EACCES",
    });
    const listen = vi.fn().mockRejectedValue(denied);

    await expect(
      listenWithFallback({ listen }, { host: "127.0.0.1", port: 80 }),
    ).rejects.toBe(denied);
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it("reports the OS-assigned port for port 0", async () => {
    const server = netListenable();
    cleanup.push(server.close);

    const port = await listenWithFallback(server, {
      host: "127.0.0.1",
      port: 0,
    });

    expect(port).toBeGreaterThan(0);
    expect(port).toBe(server.addresses()[0]?.port);
  });
});

describe("toDisplayHost", () => {
  it("keeps a loopback bind readable", () => {
    expect(toDisplayHost("127.0.0.1")).toBe("localhost");
    expect(toDisplayHost("localhost")).toBe("localhost");
  });

  it("turns a wildcard bind into something a browser can open", () => {
    // The printed URL is the only place a generated token ever appears, so a
    // `http://0.0.0.0:…?token=…` that no browser will load locks the user out
    // of their own review UI.
    expect(toDisplayHost("0.0.0.0")).toBe("localhost");
    expect(toDisplayHost("::")).toBe("localhost");
    expect(toDisplayHost("[::]")).toBe("localhost");
  });

  it("leaves a specific host alone", () => {
    expect(toDisplayHost("build-host.internal")).toBe("build-host.internal");
    expect(toDisplayHost("192.168.1.10")).toBe("192.168.1.10");
  });
});

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
