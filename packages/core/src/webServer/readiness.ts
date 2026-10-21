const PROBE_TIMEOUT_MS = 5000;
/** Delays between probes; the last one repeats. */
const POLL_DELAYS_MS = [100, 250, 500, 1000];

/**
 * Whether `url` answers with a 2xx or 3xx status.
 *
 * Redirects are not followed: a dev server that redirects `/` to `/login` is
 * up, and following it would make readiness depend on a page cappa never asked
 * about.
 */
export async function isUrlReady(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    // Nobody reads the body; let the socket go.
    await response.body?.cancel().catch(() => {});
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

export type WaitForUrlOptions = {
  timeoutMs: number;
  /** Stop waiting as soon as this settles — the server process exited. */
  abort?: Promise<unknown>;
  /** Injectable for tests. */
  probe?: (url: string, timeoutMs: number) => Promise<boolean>;
};

export type WaitForUrlResult = "ready" | "timeout" | "aborted";

/** Poll `url` until it is ready, the deadline passes, or `abort` settles. */
export async function waitForUrl(
  url: string,
  options: WaitForUrlOptions,
): Promise<WaitForUrlResult> {
  const probe = options.probe ?? isUrlReady;
  const deadline = Date.now() + options.timeoutMs;

  let aborted = false;
  const abort = (options.abort ?? new Promise<never>(() => {})).then(
    () => {
      aborted = true;
    },
    () => {
      aborted = true;
    },
  );

  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - Date.now();
    if (aborted) {
      return "aborted";
    }
    if (remaining <= 0) {
      return "timeout";
    }

    if (await probe(url, Math.min(remaining, PROBE_TIMEOUT_MS))) {
      return "ready";
    }

    const wait = Math.min(
      POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)] ?? 1000,
      Math.max(0, deadline - Date.now()),
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, wait);
      }),
      abort,
    ]);
    clearTimeout(timer);
  }
}
