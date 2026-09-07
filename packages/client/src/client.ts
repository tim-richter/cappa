import {
  type ApproveResult,
  approveResultSchema,
  type ConfigResponse,
  configResponseSchema,
  errorResponseSchema,
  type HealthResponse,
  healthResponseSchema,
  type PluginInfo,
  PROTOCOL_VERSION,
  pluginInfoSchema,
  type RunDetail,
  type RunEvent,
  type RunSummary,
  routes,
  runDetailSchema,
  runEventSchema,
  runSummarySchema,
  type Screenshot,
  type ScreenshotQuery,
  type StartRunRequest,
  screenshotSchema,
  startRunResponseSchema,
  type Target,
  TOKEN_HEADER,
  targetSchema,
} from "@cappa/protocol";
import { z } from "zod";
import { ProtocolMismatchError, toClientError } from "./errors";
import { parseSse } from "./sse";

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export type ClientOptions = {
  /** Server base URL, e.g. `http://localhost:3000`. A trailing slash is fine. */
  baseUrl: string;
  /** Access token, required when the server was started with one. */
  token?: string;
  /** Injectable `fetch`, for tests and non-standard runtimes. */
  fetch?: FetchLike;
  /**
   * Check the server's protocol version on the first request.
   * @default true
   */
  checkProtocolVersion?: boolean;
  /**
   * Delay before re-opening a dropped event stream, in milliseconds.
   * @default 2000
   */
  reconnectDelayMs?: number;
};

export type SubscribeRunOptions = {
  /** Replay events after this sequence number before streaming live ones. */
  sinceSeq?: number;
  /**
   * Called when the event stream drops. The client reconnects and resumes from
   * the last sequence number it saw, so this is informational.
   */
  onError?: (error: unknown) => void;
};

export type ListTargetsOptions = { refresh?: boolean };

/** Events after which there is nothing left to stream. */
const isTerminal = (event: RunEvent) =>
  event.type === "run:complete" || event.type === "run:error";

/**
 * A `404` from the server.
 *
 * Duck-typed rather than `instanceof CappaHttpError`: this package ships dual
 * ESM/CJS builds, so a consumer can hold two copies of the error class and an
 * identity check would silently be false — the same hazard that turned a `409`
 * into a `500` in the server once already.
 */
const isNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { status?: number }).status === 404;

/**
 * `CaptureEngine` over HTTP and SSE.
 *
 * The same interface `LocalEngine` implements, so a UI holding this is
 * indistinguishable from one driving an in-process browser — which is the whole
 * point: pointing the review UI at a remote capture server later is a base-URL
 * change, not a rewrite.
 */
export class RemoteEngine {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly doFetch: FetchLike;
  private readonly reconnectDelayMs: number;
  private readonly shouldCheckVersion: boolean;

  /** Cached so the version handshake happens once, not per call. */
  private versionCheck: Promise<void> | undefined;
  private readonly liveStreams = new Set<AbortController>();
  private closed = false;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.doFetch =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
    this.shouldCheckVersion = options.checkProtocolVersion ?? true;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.token ? { ...extra, [TOKEN_HEADER]: this.token } : { ...extra };
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: {
      method?: string;
      body?: unknown;
      skipVersionCheck?: boolean;
    } = {},
  ): Promise<T> {
    if (!init.skipVersionCheck) {
      await this.ensureVersion();
    }

    const hasBody = init.body !== undefined;
    const response = await this.doFetch(this.url(path), {
      method: init.method ?? "GET",
      headers: this.headers(
        hasBody ? { "content-type": "application/json" } : {},
      ),
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      throw toClientError(
        response.status,
        await this.readErrorBody(response),
        `${init.method ?? "GET"} ${path} failed with ${response.status}`,
      );
    }

    return schema.parse(await response.json());
  }

  private async readErrorBody(response: Response) {
    try {
      const parsed = errorResponseSchema.safeParse(await response.json());
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  private ensureVersion(): Promise<void> {
    if (!this.shouldCheckVersion) {
      return Promise.resolve();
    }

    this.versionCheck ??= this.health()
      .then((health) => {
        if (health.protocolVersion !== PROTOCOL_VERSION) {
          throw new ProtocolMismatchError(
            PROTOCOL_VERSION,
            health.protocolVersion,
          );
        }
      })
      .catch((error) => {
        // A *failed* handshake must not be cached. A version mismatch is
        // permanent, but a transport failure is not — a server still starting
        // up, or a token that arrives on the next page load — and caching the
        // rejection would make the first failed request poison every later one
        // for the lifetime of the client.
        if (!(error instanceof ProtocolMismatchError)) {
          this.versionCheck = undefined;
        }
        throw error;
      });

    return this.versionCheck;
  }

  async health(): Promise<HealthResponse> {
    return this.request(routes.health, healthResponseSchema, {
      skipVersionCheck: true,
    });
  }

  async config(): Promise<ConfigResponse> {
    return this.request(routes.config, configResponseSchema);
  }

  async listPlugins(): Promise<PluginInfo[]> {
    return this.request(routes.plugins, z.array(pluginInfoSchema));
  }

  async listTargets(options: ListTargetsOptions = {}): Promise<Target[]> {
    const query = options.refresh ? "?refresh=1" : "";
    return this.request(`${routes.targets}${query}`, z.array(targetSchema));
  }

  async startRun(request: StartRunRequest = {}): Promise<RunSummary> {
    const response = await this.request(
      routes.runs,
      startRunResponseSchema.extend({ run: runSummarySchema.optional() }),
      { method: "POST", body: request },
    );

    // Older servers may only return the id; fall back to fetching the run.
    if (response.run) {
      return response.run;
    }

    const detail = await this.getRun(response.runId);
    if (!detail) {
      throw new Error(`Run ${response.runId} disappeared after starting`);
    }
    return detail;
  }

  async getRun(id: string): Promise<RunDetail | undefined> {
    try {
      return await this.request(routes.run(id), runDetailSchema);
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async listRuns(): Promise<RunSummary[]> {
    return this.request(routes.runs, z.array(runSummarySchema));
  }

  async cancelRun(id: string): Promise<void> {
    await this.request(routes.runCancel(id), z.unknown(), { method: "POST" });
  }

  /**
   * Stream a run's events, resuming automatically if the connection drops.
   *
   * Returns an unsubscribe function; call it or `close()` to stop. The stream
   * ends on its own once the run reaches a terminal event.
   */
  subscribeRun(
    id: string,
    onEvent: (event: RunEvent) => void,
    options: SubscribeRunOptions = {},
  ): () => void {
    const controller = new AbortController();
    this.liveStreams.add(controller);

    let lastSeq = options.sinceSeq ?? 0;
    let stopped = false;

    const stop = () => {
      if (stopped) {
        return;
      }
      stopped = true;
      this.liveStreams.delete(controller);
      controller.abort();
    };

    const pump = async () => {
      while (!stopped) {
        try {
          const response = await this.doFetch(
            this.url(`${routes.runEvents(id)}?sinceSeq=${lastSeq}`),
            {
              headers: this.headers({ accept: "text/event-stream" }),
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            throw toClientError(
              response.status,
              await this.readErrorBody(response),
              `Event stream for run ${id} failed with ${response.status}`,
            );
          }

          if (!response.body) {
            throw new Error("Event stream returned no body");
          }

          for await (const frame of parseSse(response.body)) {
            if (stopped) {
              break;
            }

            const parsed = runEventSchema.safeParse(JSON.parse(frame.data));
            if (!parsed.success) {
              options.onError?.(parsed.error);
              continue;
            }

            // Track progress before dispatching, so a listener that throws
            // cannot make a reconnect replay the same event.
            lastSeq = parsed.data.seq;
            onEvent(parsed.data);

            if (isTerminal(parsed.data)) {
              stop();
              return;
            }
          }
        } catch (error) {
          if (stopped) {
            return;
          }
          options.onError?.(error);
        }

        if (stopped) {
          return;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, this.reconnectDelayMs),
        );
      }
    };

    void pump();

    return stop;
  }

  async listScreenshots(query: ScreenshotQuery = {}): Promise<Screenshot[]> {
    const params = new URLSearchParams();
    if (query.search) {
      params.set("search", query.search);
    }
    if (query.category) {
      params.set("category", query.category);
    }

    const search = params.toString();
    return this.request(
      `${routes.screenshots}${search ? `?${search}` : ""}`,
      // The server adds `next`/`prev` and asset URLs on top of the wire shape.
      z.array(screenshotSchema),
    );
  }

  /**
   * One screenshot by the id the server assigns it, or `undefined` when there
   * is no such screenshot.
   *
   * Deliberately not part of `CaptureEngine`: an engine discovers and captures,
   * while addressing a single screenshot by a server-assigned view id — and
   * getting `next`/`prev` back with it — is a review concern that only exists
   * over HTTP.
   */
  async getScreenshot(id: string): Promise<Screenshot | undefined> {
    try {
      return await this.request(routes.screenshot(id), screenshotSchema);
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async approve(names: string[]): Promise<ApproveResult> {
    return this.request(routes.approveBatch, approveResultSchema, {
      method: "POST",
      body: { names },
    });
  }

  /** Stop every live event stream. The client stays usable for plain requests. */
  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.liveStreams) {
      controller.abort();
    }
    this.liveStreams.clear();
  }

  /** True once `close()` has been called. */
  get isClosed(): boolean {
    return this.closed;
  }
}

export const createClient = (options: ClientOptions): RemoteEngine =>
  new RemoteEngine(options);
