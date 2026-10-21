import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWebServerConfig } from "./resolve";
import {
  type ResolvedWebServerConfig,
  WebServerError,
  type WebServerLog,
  WebServerPool,
} from "./WebServerPool";

const posixOnly = describe.skipIf(process.platform === "win32");

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });

const isListening = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A tiny HTTP server, listening after `delayMs`. */
const serverScript = (port: number, { delayMs = 0, ignoreTerm = false } = {}) =>
  `
const http = require("node:http");
${ignoreTerm ? 'process.on("SIGTERM", () => {});' : ""}
console.log("booting on ${port}");
setTimeout(() => {
  http.createServer((req, res) => res.end("ok")).listen(${port}, "127.0.0.1", () => {
    console.log("listening");
  });
}, ${delayMs});
`;

let dir: string;
let pools: WebServerPool[];

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "cappa-web-server-"));
  pools = [];
});

afterEach(async () => {
  await Promise.all(pools.map((pool) => pool.stop()));
  await rm(dir, { recursive: true, force: true });
});

const script = async (name: string, content: string) => {
  const file = path.join(dir, name);
  await writeFile(file, content);
  return file;
};

const entry = (
  overrides: Partial<ResolvedWebServerConfig> & {
    command: string;
    url: string;
  },
): ResolvedWebServerConfig => ({
  reuseExistingServer: false,
  timeout: 10_000,
  cwd: dir,
  env: {},
  ...overrides,
});

const createPool = (
  servers: ResolvedWebServerConfig[],
  options: { killGraceMs?: number } = {},
) => {
  const pool = new WebServerPool({ servers, killGraceMs: options.killGraceMs });
  pools.push(pool);
  return pool;
};

const collectLog = () => {
  const lines: { level: string; message: string }[] = [];
  const log: WebServerLog = (level, message) => {
    lines.push({ level, message });
  };
  return { lines, log };
};

describe("WebServerPool", () => {
  it("does nothing without servers", async () => {
    const pool = createPool([]);
    await pool.ensure();
    expect(pool.configured).toBe(false);
    await pool.stop();
  });

  it("starts the command and waits until the url answers", async () => {
    const port = await freePort();
    const file = await script(
      "server.js",
      serverScript(port, { delayMs: 300 }),
    );
    const pool = createPool([
      entry({ command: `node ${file}`, url: `http://127.0.0.1:${port}` }),
    ]);
    const { lines, log } = collectLog();

    await pool.ensure(log);

    expect(await isListening(port)).toBe(true);
    expect(pool.running).toBe(1);
    expect(lines.map((line) => line.message)).toEqual([
      expect.stringContaining(`Starting \`node ${file}\``),
      expect.stringContaining(`http://127.0.0.1:${port} ready in`),
    ]);

    await pool.stop();
    expect(await isListening(port)).toBe(false);
    expect(pool.running).toBe(0);
  });

  it("says on a second run that it is using the server it started", async () => {
    const port = await freePort();
    const file = await script("server.js", serverScript(port));
    const pool = createPool([
      entry({ command: `node ${file}`, url: `http://127.0.0.1:${port}` }),
    ]);

    await pool.ensure();
    const { lines, log } = collectLog();
    await pool.ensure(log);

    expect(lines).toEqual([
      {
        level: "info",
        message: expect.stringContaining("started earlier by cappa"),
      },
    ]);
  });

  it("starts several servers in parallel", async () => {
    const [a, b] = await Promise.all([freePort(), freePort()]);
    const fileA = await script("a.js", serverScript(a, { delayMs: 500 }));
    const fileB = await script("b.js", serverScript(b, { delayMs: 500 }));
    const pool = createPool([
      entry({ command: `node ${fileA}`, url: `http://127.0.0.1:${a}` }),
      entry({ command: `node ${fileB}`, url: `http://127.0.0.1:${b}` }),
    ]);

    const start = Date.now();
    await pool.ensure();

    expect(await isListening(a)).toBe(true);
    expect(await isListening(b)).toBe(true);
    // Sequential would be ≥ 1s of start-up delay alone.
    expect(Date.now() - start).toBeLessThan(2500);
  });

  it("shares one start between concurrent callers", async () => {
    const port = await freePort();
    const file = await script(
      "server.js",
      serverScript(port, { delayMs: 200 }),
    );
    const spawn = vi.fn(
      (await import("./process")).spawnServerProcess,
    ) as typeof import("./process").spawnServerProcess;
    const pool = new WebServerPool({
      servers: [
        entry({ command: `node ${file}`, url: `http://127.0.0.1:${port}` }),
      ],
      spawn,
    });
    pools.push(pool);

    await Promise.all([pool.ensure(), pool.ensure()]);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("fails with the output tail when the command exits early", async () => {
    const port = await freePort();
    const pool = createPool([
      entry({
        command: `node -e "console.log('missing script: storybook'); process.exit(3)"`,
        url: `http://127.0.0.1:${port}`,
      }),
    ]);

    const error = await pool.ensure().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebServerError);
    expect((error as Error).message).toContain("exited with code 3");
    expect((error as Error).message).toContain("missing script: storybook");
  });

  it("fails with the output tail and kills the command on timeout", async () => {
    const port = await freePort();
    const file = await script(
      "slow.js",
      serverScript(port, { delayMs: 60_000 }),
    );
    const pool = createPool([
      entry({
        command: `node ${file}`,
        url: `http://127.0.0.1:${port}`,
        timeout: 500,
      }),
    ]);

    const error = await pool.ensure().catch((caught: unknown) => caught);

    expect((error as Error).message).toContain("Timed out after 0.5s");
    expect((error as Error).message).toContain("webServer.timeout");
    expect((error as Error).message).toContain(`booting on ${port}`);
    expect(pool.running).toBe(0);
  });

  it("reuses a server that is already answering, and never stops it", async () => {
    const port = await freePort();
    const existing = http.createServer((_req, res) => res.end("ok"));
    await new Promise<void>((resolve) =>
      existing.listen(port, "127.0.0.1", resolve),
    );

    try {
      const spawn = vi.fn();
      const pool = new WebServerPool({
        servers: [
          entry({
            command: "would-fail",
            url: `http://127.0.0.1:${port}`,
            reuseExistingServer: true,
          }),
        ],
        spawn,
      });
      const { lines, log } = collectLog();

      await pool.ensure(log);
      await pool.stop();

      expect(spawn).not.toHaveBeenCalled();
      expect(lines[0]?.message).toContain(
        `Reusing server at http://127.0.0.1:${port}`,
      );
      expect(await isListening(port)).toBe(true);
    } finally {
      await new Promise((resolve) => existing.close(resolve));
    }
  });

  it("refuses an answering url when reuse is off", async () => {
    const port = await freePort();
    const existing = http.createServer((_req, res) => res.end("ok"));
    await new Promise<void>((resolve) =>
      existing.listen(port, "127.0.0.1", resolve),
    );

    try {
      const pool = createPool([
        entry({ command: "would-fail", url: `http://127.0.0.1:${port}` }),
      ]);

      await expect(pool.ensure()).rejects.toThrow(/already in use/);
    } finally {
      await new Promise((resolve) => existing.close(resolve));
    }
  });

  it("does not count an error status as ready", async () => {
    const port = await freePort();
    const file = await script(
      "500.js",
      `require("node:http").createServer((req, res) => { res.statusCode = 500; res.end(); }).listen(${port}, "127.0.0.1");`,
    );
    const pool = createPool([
      entry({
        command: `node ${file}`,
        url: `http://127.0.0.1:${port}`,
        timeout: 800,
      }),
    ]);

    await expect(pool.ensure()).rejects.toThrow(/Timed out/);
  });

  it("records a crash, explains it, and starts the server again next time", async () => {
    const port = await freePort();
    const file = await script(
      "crash.js",
      `
const http = require("node:http");
const fs = require("node:fs");
const marker = ${JSON.stringify(path.join(dir, "crashed"))};
const server = http.createServer((req, res) => res.end("ok")).listen(${port}, "127.0.0.1");
if (!fs.existsSync(marker)) {
  fs.writeFileSync(marker, "");
  setTimeout(() => { console.error("out of memory"); process.exit(9); }, 300);
}
`,
    );
    const pool = createPool([
      entry({ command: `node ${file}`, url: `http://127.0.0.1:${port}` }),
    ]);

    await pool.ensure();
    await vi.waitFor(() => expect(pool.running).toBe(0), { timeout: 5000 });

    const explanation = pool.explainUnreachable(`http://localhost:${port}`);
    expect(explanation).toContain("exited with code 9 during the run");
    expect(explanation).toContain("out of memory");

    const { lines, log } = collectLog();
    await pool.ensure(log);
    expect(lines[0]).toEqual({
      level: "warn",
      message: expect.stringContaining("starting it again"),
    });
    expect(await isListening(port)).toBe(true);
  });

  it("can be started again after a stop", async () => {
    const port = await freePort();
    const file = await script("server.js", serverScript(port));
    const pool = createPool([
      entry({ command: `node ${file}`, url: `http://127.0.0.1:${port}` }),
    ]);

    await pool.ensure();
    await pool.stop();
    await pool.ensure();

    expect(await isListening(port)).toBe(true);
  });

  it("passes env and runs in cwd", async () => {
    const port = await freePort();
    const sub = path.join(dir, "app");
    await import("node:fs/promises").then((fs) => fs.mkdir(sub));
    await writeFile(path.join(sub, "server.js"), serverScript(port));
    const pool = createPool([
      entry({
        // Relative script path: only resolves when cwd is applied.
        command: `node -e "if (process.env.CAPPA_TEST !== 'yes') process.exit(1); require('./server.js')"`,
        url: `http://127.0.0.1:${port}`,
        cwd: sub,
        env: { CAPPA_TEST: "yes" },
      }),
    ]);

    await pool.ensure();
    expect(await isListening(port)).toBe(true);
  });

  it("stopping during start-up kills the command and fails the start", async () => {
    const port = await freePort();
    const file = await script(
      "slow.js",
      serverScript(port, { delayMs: 60_000 }),
    );
    const pool = createPool([
      entry({ command: `node ${file}`, url: `http://127.0.0.1:${port}` }),
    ]);

    const starting = pool.ensure().catch((caught: unknown) => caught);
    await vi.waitFor(() => expect(pool.running).toBe(1));
    await pool.stop();

    expect(((await starting) as Error).message).toMatch(/stopped|exited/);
    expect(pool.running).toBe(0);
  });
});

posixOnly("WebServerPool process tree", () => {
  it("kills every process behind a wrapper command", async () => {
    const port = await freePort();
    const server = await script("server.js", serverScript(port));
    const pidFile = path.join(dir, "grandchild.pid");
    const wrapper = await script(
      "wrapper.js",
      // pnpm → sh → storybook in miniature: a parent that is not the server.
      `
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const child = spawn(process.execPath, [${JSON.stringify(server)}], { stdio: "inherit" });
fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
setInterval(() => {}, 1000);
`,
    );
    const pool = createPool([
      entry({
        // Through `sh -c` as well, for one more layer.
        command: `sh -c "node ${wrapper}"`,
        url: `http://127.0.0.1:${port}`,
      }),
    ]);

    await pool.ensure();
    const { readFile } = await import("node:fs/promises");
    const grandchild = Number(await readFile(pidFile, "utf8"));
    expect(isAlive(grandchild)).toBe(true);

    await pool.stop();

    expect(isAlive(grandchild)).toBe(false);
    expect(await isListening(port)).toBe(false);
  });

  it("escalates to SIGKILL when SIGTERM is ignored", async () => {
    const port = await freePort();
    const file = await script(
      "stubborn.js",
      serverScript(port, { ignoreTerm: true }),
    );
    const pool = createPool(
      [entry({ command: `node ${file}`, url: `http://127.0.0.1:${port}` })],
      { killGraceMs: 300 },
    );

    await pool.ensure();
    const start = Date.now();
    await pool.stop();

    expect(Date.now() - start).toBeGreaterThanOrEqual(250);
    expect(await isListening(port)).toBe(false);
  });
});

describe("WebServerPool.explainUnreachable", () => {
  const configured = (url: string) =>
    new WebServerPool({
      servers: [entry({ command: "pnpm storybook", url })],
    });

  it("suggests a webServer when none is configured", () => {
    expect(
      new WebServerPool({ servers: [] }).explainUnreachable(
        "http://localhost:6006",
      ),
    ).toContain("add a `webServer` entry");
  });

  it("names a url no entry serves", () => {
    const message = configured("http://localhost:6006").explainUnreachable(
      "http://localhost:3000",
    );
    expect(message).toContain("No `webServer` entry serves");
    expect(message).toContain("http://localhost:6006");
  });

  it("treats loopback spellings as the same server", () => {
    const message = configured("http://localhost:6006").explainUnreachable(
      "http://127.0.0.1:6006",
    );
    expect(message).not.toContain("No `webServer` entry serves");
  });
});

describe("resolveWebServerConfig", () => {
  it("returns an empty list without a webServer", () => {
    expect(resolveWebServerConfig(undefined, "/repo")).toEqual([]);
  });

  it("applies defaults and normalises a single entry to a list", () => {
    expect(
      resolveWebServerConfig(
        { command: "pnpm storybook", url: "http://localhost:6006" },
        "/repo/packages/visual-tests",
        {},
      ),
    ).toEqual([
      {
        command: "pnpm storybook",
        url: "http://localhost:6006",
        reuseExistingServer: true,
        timeout: 60_000,
        cwd: "/repo/packages/visual-tests",
        env: {},
      },
    ]);
  });

  it("does not reuse servers on CI by default", () => {
    const [resolved] = resolveWebServerConfig(
      { command: "x", url: "http://localhost:1" },
      "/repo",
      { CI: "true" },
    );
    expect(resolved?.reuseExistingServer).toBe(false);
  });

  it("resolves a relative cwd against the config directory", () => {
    const [resolved] = resolveWebServerConfig(
      { command: "x", url: "http://localhost:1", cwd: "../../apps/web" },
      "/repo/packages/visual-tests",
    );
    expect(resolved?.cwd).toBe(path.resolve("/repo/apps/web"));
  });

  it("keeps explicit values", () => {
    const [resolved] = resolveWebServerConfig(
      [
        {
          command: "x",
          url: "http://localhost:1",
          reuseExistingServer: false,
          timeout: 5,
          cwd: "/elsewhere",
          env: { A: "1" },
        },
      ],
      "/repo",
      {},
    );
    expect(resolved).toMatchObject({
      reuseExistingServer: false,
      timeout: 5,
      cwd: path.resolve("/elsewhere"),
      env: { A: "1" },
    });
  });

  it.each([
    [{ command: "", url: "http://localhost:1" }, /webServer\.command/],
    [{ command: "x", url: "localhost:6006" }, /webServer\.url/],
    [{ command: "x", url: "http://localhost:1", timeout: 0 }, /timeout/],
  ])("rejects an invalid entry %#", (config, message) => {
    expect(() => resolveWebServerConfig(config as never, "/repo")).toThrow(
      message,
    );
  });

  it("names the index of an invalid array entry", () => {
    expect(() =>
      resolveWebServerConfig(
        [
          { command: "x", url: "http://localhost:1" },
          { command: "", url: "http://localhost:2" },
        ],
        "/repo",
      ),
    ).toThrow(/webServer\[1\]\.command/);
  });
});
