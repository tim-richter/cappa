import type { WebServerConfig } from "../types";
import {
  type ProcessExit,
  type ServerProcess,
  type SpawnServerOptions,
  spawnServerProcess,
} from "./process";
import { isUrlReady, waitForUrl } from "./readiness";
import { NO_WEB_SERVER_HINT, sameServer } from "./unreachable";

/** A `webServer` entry with every default applied. */
export type ResolvedWebServerConfig = Required<WebServerConfig>;

export type WebServerLogLevel = "debug" | "info" | "warn" | "error" | "success";

export type WebServerLog = (level: WebServerLogLevel, message: string) => void;

export type WebServerPoolOptions = {
  servers: ResolvedWebServerConfig[];
  /** Where lifecycle messages go when `ensure` is not handed a log. */
  log?: WebServerLog;
  /** Live output, for `--log-level 4`. Output is buffered either way. */
  onOutput?: (server: ResolvedWebServerConfig, chunk: string) => void;
  /** Overrides process spawning. Tests use this. */
  spawn?: (command: string, options: SpawnServerOptions) => ServerProcess;
  /** Overrides the readiness probe. Tests use this. */
  probe?: (url: string, timeoutMs: number) => Promise<boolean>;
  /** Grace period between SIGTERM and SIGKILL. @default 5000 */
  killGraceMs?: number;
};

/** A web server could not be started, or would not become ready. */
export class WebServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebServerError";
  }
}

type EntryState =
  | { kind: "idle" }
  /** Something else was already answering at `url`. Never stopped by cappa. */
  | { kind: "reused" }
  | { kind: "running"; process: ServerProcess }
  /** Exited on its own after it was ready. Started again on the next run. */
  | { kind: "exited"; exit: ProcessExit; tail: string[] };

type Entry = {
  config: ResolvedWebServerConfig;
  state: EntryState;
  starting: Promise<void> | null;
};

const describeExit = (exit: ProcessExit): string =>
  exit.signal
    ? `signal ${exit.signal}`
    : exit.code === null
      ? "an error"
      : `code ${exit.code}`;

const formatTail = (command: string, lines: string[]): string =>
  lines.length === 0
    ? `\`${command}\` printed nothing.`
    : `Last output of \`${command}\`:\n${lines.map((line) => `  ${line}`).join("\n")}`;

const seconds = (ms: number) => `${Math.round(ms / 100) / 10}s`;

/**
 * The servers a config's `webServer` describes, started on demand.
 *
 * Lazy and restartable rather than started once: the owning engine calls
 * `ensure` before every run and `stop` when the browser goes idle, so a review
 * session that sits unused gives the port back, and the next capture starts —
 * and rebuilds — the app again, picking up whatever changed in between.
 *
 * Every `ensure` says which way it went, because "reusing a server" and
 * "started one" look identical in screenshots, and a stale build, another
 * branch or another project on the same port is otherwise very hard to spot.
 */
export class WebServerPool {
  private readonly entries: Entry[];
  private readonly options: WebServerPoolOptions;
  private readonly probe: (url: string, timeoutMs: number) => Promise<boolean>;
  /** Bumped by `stop`, so a start in flight knows it was cancelled. */
  private generation = 0;

  constructor(options: WebServerPoolOptions) {
    this.options = options;
    this.probe = options.probe ?? isUrlReady;
    this.entries = options.servers.map((config) => ({
      config,
      state: { kind: "idle" },
      starting: null,
    }));
  }

  /** Whether the config has any `webServer` entry at all. */
  get configured(): boolean {
    return this.entries.length > 0;
  }

  /** Number of processes cappa started that are still running. */
  get running(): number {
    return this.entries.filter(
      (entry) => entry.state.kind === "running" && !entry.state.process.exit,
    ).length;
  }

  /**
   * Make every server ready, in parallel, starting the ones that are not.
   *
   * All of them, even for a run that only captures one plugin's tasks: nothing
   * maps a plugin to a server, and guessing would start the wrong one.
   */
  async ensure(log: WebServerLog = this.defaultLog): Promise<void> {
    if (this.entries.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      this.entries.map((entry) => this.ensureEntry(entry, log)),
    );

    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );

    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new WebServerError(
        errors
          .map((error) => (error instanceof Error ? error.message : error))
          .join("\n\n"),
      );
    }
  }

  /**
   * Stop every server cappa started. A reused server is left alone — cappa did
   * not start it, so it is not cappa's to stop.
   */
  async stop(): Promise<void> {
    this.generation += 1;

    await Promise.all(
      this.entries.map(async (entry) => {
        const state = entry.state;
        // Before the kill, so the exit watcher sees a deliberate stop rather
        // than a crash.
        entry.state = { kind: "idle" };

        if (state.kind === "running") {
          await state.process.kill(this.options.killGraceMs);
        }
      }),
    );
  }

  /**
   * What to tell the user about a connection refused at `origin`.
   *
   * Always an actionable sentence: the bare "ECONNREFUSED" it replaces is the
   * single most common capture failure, and says nothing about what to do.
   */
  explainUnreachable(origin?: string): string {
    if (this.entries.length === 0) {
      return NO_WEB_SERVER_HINT;
    }

    const matching = origin
      ? this.entries.find((entry) => sameServer(entry.config.url, origin))
      : undefined;

    const crashed =
      matching?.state.kind === "exited"
        ? matching
        : this.entries.find((entry) => entry.state.kind === "exited");

    if (crashed && crashed.state.kind === "exited") {
      return `The web server \`${crashed.config.command}\` exited with ${describeExit(crashed.state.exit)} during the run; it is started again on the next run.\n${formatTail(crashed.config.command, crashed.state.tail)}`;
    }

    if (origin && !matching) {
      const urls = this.entries.map((entry) => entry.config.url).join(", ");
      return `No \`webServer\` entry serves ${origin} (configured: ${urls}). Check that the plugin's URL matches \`webServer.url\`.`;
    }

    return "The configured `webServer` was ready, but stopped accepting connections.";
  }

  private readonly defaultLog: WebServerLog = (level, message) => {
    this.options.log?.(level, message);
  };

  private ensureEntry(entry: Entry, log: WebServerLog): Promise<void> {
    // Two callers asking at once — discovery from the UI and a run, say — share
    // one start rather than spawning the command twice.
    entry.starting ??= this.startEntry(entry, log).finally(() => {
      entry.starting = null;
    });
    return entry.starting;
  }

  private async startEntry(entry: Entry, log: WebServerLog): Promise<void> {
    const { command, url, timeout, cwd, env, reuseExistingServer } =
      entry.config;
    const previous = entry.state;

    if (previous.kind === "running" && !previous.process.exit) {
      log("info", `Using \`${command}\` at ${url}, started earlier by cappa`);
      return;
    }

    if (previous.kind === "exited") {
      log(
        "warn",
        `\`${command}\` exited with ${describeExit(previous.exit)} after the last run; starting it again`,
      );
    }

    if (await this.probe(url, Math.min(timeout, 5000))) {
      if (reuseExistingServer) {
        entry.state = { kind: "reused" };
        log("info", `Reusing server at ${url} — \`${command}\` was not run`);
        return;
      }

      throw new WebServerError(
        `${url} is already in use, and \`webServer.reuseExistingServer\` is false. Stop whatever is serving it, or allow reusing it.`,
      );
    }

    const generation = this.generation;
    const startedAt = Date.now();

    log(
      "info",
      `Starting \`${command}\` — waiting up to ${seconds(timeout)} for ${url}`,
    );

    const child = (this.options.spawn ?? spawnServerProcess)(command, {
      cwd,
      env,
      onOutput: this.options.onOutput
        ? (chunk) => this.options.onOutput?.(entry.config, chunk)
        : undefined,
    });

    // Recorded before it is ready, so a `stop` during start-up kills it too.
    entry.state = { kind: "running", process: child };

    const result = await waitForUrl(url, {
      timeoutMs: timeout,
      abort: child.exited,
      probe: this.probe,
    });

    if (generation !== this.generation) {
      await child.kill(this.options.killGraceMs);
      throw new WebServerError(
        `\`${command}\` was stopped before ${url} was ready.`,
      );
    }

    if (result === "ready") {
      this.watchForCrash(entry, child);
      log(
        "success",
        `Started \`${command}\` — ${url} ready in ${seconds(Date.now() - startedAt)}`,
      );
      return;
    }

    entry.state = { kind: "idle" };

    if (result === "aborted") {
      const exit = await child.exited;
      throw new WebServerError(
        `\`${command}\` exited with ${describeExit(exit)} before ${url} was ready.\n${formatTail(command, child.output.lines())}`,
      );
    }

    await child.kill(this.options.killGraceMs);
    throw new WebServerError(
      `Timed out after ${seconds(timeout)} waiting for \`${command}\` to serve ${url}. If it needs longer — a build step, say — raise \`webServer.timeout\`.\n${formatTail(command, child.output.lines())}`,
    );
  }

  /**
   * Record a server that exits on its own, so the failures it causes can say
   * why and the next run starts it again. Deliberately no restart loop: a
   * server that keeps crashing should fail loudly, not flap.
   */
  private watchForCrash(entry: Entry, child: ServerProcess): void {
    void child.exited.then((exit) => {
      const state = entry.state;
      if (state.kind !== "running" || state.process !== child) {
        // Stopped on purpose.
        return;
      }

      entry.state = { kind: "exited", exit, tail: child.output.lines() };
      // The process group may outlive the shell that led it.
      void child.kill(this.options.killGraceMs);
      this.defaultLog(
        "error",
        `\`${entry.config.command}\` exited with ${describeExit(exit)} while cappa was using it.`,
      );
    });
  }
}
