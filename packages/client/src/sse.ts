/**
 * Minimal server-sent-events reader over `fetch`.
 *
 * Deliberately not `EventSource`, despite that being the obvious choice:
 *
 * - `EventSource` cannot send request headers, so the access token would have
 *   to travel in the query string — where it lands in server logs and browser
 *   history.
 * - It reconnects on its own schedule with no way to observe or cancel the
 *   attempt, which makes clean teardown impossible.
 *
 * `fetch` gives headers, an `AbortSignal`, and explicit control of resume,
 * for the cost of the small parser below. It works unchanged in browsers and
 * in Node 18+.
 */

export type SseFrame = {
  id?: string;
  event?: string;
  data: string;
};

/**
 * Parse an SSE byte stream into frames.
 *
 * Frames are separated by a blank line; `\r\n` and `\n` are both accepted, and
 * lines starting with `:` are comments (the server's heartbeat) and ignored.
 */
export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        const frame = toFrame(buffer);
        if (frame) {
          yield frame;
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const frame = toFrame(chunk);
        if (frame) {
          yield frame;
        }

        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const toFrame = (chunk: string): SseFrame | undefined => {
  const lines = chunk.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) {
    return undefined;
  }

  let id: string | undefined;
  let event: string | undefined;
  const data: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) {
      continue;
    }

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "id") {
      id = value;
    } else if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }

  if (data.length === 0) {
    return undefined;
  }

  return { id, event, data: data.join("\n") };
};
