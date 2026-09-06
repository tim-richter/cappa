import { describe, expect, it } from "vitest";
import { parseSse, type SseFrame } from "./sse";

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

const collect = async (
  stream: ReadableStream<Uint8Array>,
): Promise<SseFrame[]> => {
  const frames: SseFrame[] = [];
  for await (const frame of parseSse(stream)) {
    frames.push(frame);
  }
  return frames;
};

describe("parseSse", () => {
  it("parses id and data fields", async () => {
    const frames = await collect(streamOf("id: 7\ndata: hello\n\n"));

    expect(frames).toEqual([{ id: "7", event: undefined, data: "hello" }]);
  });

  it("parses several frames from one chunk", async () => {
    const frames = await collect(
      streamOf("id: 1\ndata: a\n\nid: 2\ndata: b\n\n"),
    );

    expect(frames.map((frame) => frame.data)).toEqual(["a", "b"]);
  });

  it("reassembles a frame split across chunks", async () => {
    const frames = await collect(streamOf("id: 1\nda", "ta: hel", "lo\n\n"));

    expect(frames).toEqual([{ id: "1", event: undefined, data: "hello" }]);
  });

  it("joins multi-line data with newlines, per the spec", async () => {
    const frames = await collect(streamOf("data: one\ndata: two\n\n"));

    expect(frames[0]?.data).toBe("one\ntwo");
  });

  it("ignores comments, including the server heartbeat", async () => {
    const frames = await collect(streamOf(": heartbeat\n\ndata: real\n\n"));

    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toBe("real");
  });

  it("ignores a frame with no data, such as a retry directive", async () => {
    const frames = await collect(streamOf("retry: 2000\n\ndata: x\n\n"));

    expect(frames.map((frame) => frame.data)).toEqual(["x"]);
  });

  it("accepts CRLF line endings", async () => {
    const frames = await collect(streamOf("id: 1\r\ndata: hello\r\n\r\n"));

    expect(frames[0]).toEqual({ id: "1", event: undefined, data: "hello" });
  });

  it("keeps a field value that contains a colon", async () => {
    const frames = await collect(streamOf('data: {"url":"http://x/a"}\n\n'));

    expect(frames[0]?.data).toBe('{"url":"http://x/a"}');
  });

  it("tolerates a missing space after the field name", async () => {
    const frames = await collect(streamOf("id:1\ndata:hello\n\n"));

    expect(frames[0]).toEqual({ id: "1", event: undefined, data: "hello" });
  });

  it("parses a named event", async () => {
    const frames = await collect(streamOf("event: ping\ndata: x\n\n"));

    expect(frames[0]?.event).toBe("ping");
  });

  it("emits a trailing frame that was not terminated by a blank line", async () => {
    const frames = await collect(streamOf("id: 1\ndata: hello\n"));

    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toBe("hello");
  });

  it("yields nothing for an empty stream", async () => {
    expect(await collect(streamOf(""))).toEqual([]);
  });

  it("handles multi-byte characters split across chunk boundaries", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode("data: héllo\n\n");
    const split = 8; // lands mid-way through the two-byte é

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });

    expect((await collect(stream))[0]?.data).toBe("héllo");
  });
});
