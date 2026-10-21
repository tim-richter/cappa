import {
  type ChildProcess,
  execFile,
  execFileSync,
  spawn,
} from "node:child_process";

/** Grace period between SIGTERM and SIGKILL. */
export const DEFAULT_KILL_GRACE_MS = 5000;

/** How long to wait for the kernel to reap a SIGKILLed group. */
const SIGKILL_WAIT_MS = 2000;

const isWindows = process.platform === "win32";

/**
 * The last part of a process's output, kept in memory.
 *
 * Bounded by bytes rather than lines: a dev server that prints one enormous
 * line is no reason to hold on to all of it, and the tail exists to explain a
 * failure, not to be a log.
 */
export class OutputTail {
  private chunks: string[] = [];
  private size = 0;

  constructor(private readonly maxBytes = 64 * 1024) {}

  push(chunk: string): void {
    this.chunks.push(chunk);
    this.size += chunk.length;

    while (this.size > this.maxBytes && this.chunks.length > 1) {
      this.size -= this.chunks.shift()?.length ?? 0;
    }
  }

  /** The last `maxLines` non-empty lines. */
  lines(maxLines = 30): string[] {
    return this.chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .slice(-maxLines);
  }
}

export type ProcessExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export type ServerProcess = {
  readonly pid: number | undefined;
  /** Settles once the direct child has exited. Never rejects. */
  readonly exited: Promise<ProcessExit>;
  /** The exit, once there is one. */
  readonly exit: ProcessExit | undefined;
  readonly output: OutputTail;
  /** Stop the whole process tree. Safe to call repeatedly. */
  kill(graceMs?: number): Promise<void>;
};

export type SpawnServerOptions = {
  cwd: string;
  env?: Record<string, string>;
  /** Called with every chunk of output as it arrives. */
  onOutput?: (chunk: string) => void;
};

/**
 * Process groups this process started and has not stopped yet.
 *
 * Exists for the one exit no `close()` covers: the process leaving without
 * shutting down. A server left running holds its port, and the next run would
 * silently *reuse* it — a stale build answering for the current one.
 */
const liveProcesses = new Set<ChildProcess>();
let exitHookInstalled = false;

const installExitHook = () => {
  if (exitHookInstalled) {
    return;
  }
  exitHookInstalled = true;

  // Synchronous by necessity: nothing asynchronous runs after `exit`. There is
  // no time for a graceful SIGTERM either, so this goes straight to SIGKILL.
  process.on("exit", () => {
    for (const child of liveProcesses) {
      killTreeNow(child);
    }
    liveProcesses.clear();
  });
};

const killTreeNow = (child: ChildProcess) => {
  if (child.pid === undefined) {
    return;
  }

  try {
    if (isWindows) {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    // Already gone.
  }
};

/**
 * Start `command` through a shell, as the leader of its own process group.
 *
 * A group, because the command is rarely the server itself: `pnpm storybook`
 * is pnpm, running a shell, running storybook, running workers. Killing only
 * the direct child would leave the rest holding the port.
 *
 * Output is buffered, never written anywhere unless `onOutput` asks for it —
 * `cappa capture --json` must stay a single clean document on stdout.
 */
export function spawnServerProcess(
  command: string,
  options: SpawnServerOptions,
): ServerProcess {
  const child = spawn(command, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: true,
    // On POSIX this makes the child a process-group leader. On Windows it
    // would open a console window instead, and `taskkill /T` walks the tree
    // without needing a group.
    detached: !isWindows,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const output = new OutputTail();
  const onData = (data: Buffer) => {
    const chunk = data.toString();
    output.push(chunk);
    options.onOutput?.(chunk);
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  liveProcesses.add(child);
  installExitHook();

  let exit: ProcessExit | undefined;
  const exited = new Promise<ProcessExit>((resolve) => {
    const settle = (value: ProcessExit) => {
      if (exit) {
        return;
      }
      exit = value;
      resolve(value);
    };

    child.once("exit", (code, signal) => settle({ code, signal }));
    child.once("error", (error) => {
      output.push(`${error.message}\n`);
      settle({ code: null, signal: null });
    });
  });

  let killing: Promise<void> | undefined;

  return {
    get pid() {
      return child.pid;
    },
    exited,
    get exit() {
      return exit;
    },
    output,
    kill(graceMs = DEFAULT_KILL_GRACE_MS) {
      killing ??= killProcessTree(child, exited, graceMs).finally(() => {
        liveProcesses.delete(child);
      });
      return killing;
    },
  };
}

/** True while any process in the group led by `pid` is alive. */
const groupAlive = (pid: number): boolean => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but is not ours to signal — still alive.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * SIGTERM the whole group, then SIGKILL whatever is left after `graceMs`.
 *
 * Waits on the group, not the child: the shell can exit at once while the
 * server it started is still shutting down — and still holding the port.
 */
async function killProcessTree(
  child: ChildProcess,
  exited: Promise<ProcessExit>,
  graceMs: number,
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }

  if (isWindows) {
    // `/F` is the only reliable option: console apps ignore a polite taskkill.
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => resolve());
    });
    await exited;
    return;
  }

  if (!groupAlive(pid)) {
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + graceMs;
  while (groupAlive(pid) && Date.now() < deadline) {
    await delay(50);
  }

  if (groupAlive(pid)) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Gone in the meantime.
    }

    // `kill` only queues the signal, and the shell that led the group has
    // usually exited on the SIGTERM already — so `exited` settled long ago and
    // says nothing about the server. Wait until the group is actually gone,
    // or the port is still held when this returns.
    const killDeadline = Date.now() + SIGKILL_WAIT_MS;
    while (groupAlive(pid) && Date.now() < killDeadline) {
      await delay(20);
    }
  }

  await exited;
}
