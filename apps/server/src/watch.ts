import { isWatchInProgressError } from "@cappa/core";
import { ERROR_CODES, startWatchRequestSchema } from "@cappa/protocol";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

/** How often to write an SSE comment so idle proxies keep the socket open. */
const HEARTBEAT_MS = 15_000;

/**
 * Watch routes:
 *
 * - `GET    /api/watch`        — what the watch session is doing
 * - `POST   /api/watch`        — start watching
 * - `DELETE /api/watch`        — stop watching, answering the new status
 * - `GET    /api/watch/events` — SSE stream of watch events
 *
 * Every one of them depends on the engine being able to see the files, which
 * only an in-process engine can. The routes are still mounted when it cannot —
 * answering `501` rather than 404 — so a client gets an explanation instead of
 * a missing endpoint.
 */
export const watchPlugin: FastifyPluginAsync = async (fastify) => {
  const refuseReadOnly = (reply: {
    code: (n: number) => { send: (body: unknown) => void };
  }): boolean => {
    if (fastify.readOnly) {
      reply.code(403).send({ error: "Server is read-only" });
      return true;
    }
    return false;
  };

  const refuseUnsupported = (reply: {
    code: (n: number) => { send: (body: unknown) => void };
  }): boolean => {
    if (typeof fastify.engine.startWatch !== "function") {
      reply.code(501).send({
        error: "This server's engine cannot watch files",
      });
      return true;
    }
    return false;
  };

  fastify.get("/watch", async (_request, reply) => {
    if (refuseUnsupported(reply)) {
      return;
    }

    return fastify.engine.getWatchStatus?.();
  });

  fastify.post("/watch", async (request, reply) => {
    if (refuseReadOnly(reply) || refuseUnsupported(reply)) {
      return;
    }

    const parsed = startWatchRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: z.flattenError(parsed.error) });
      return;
    }

    try {
      const status = await fastify.engine.startWatch?.(parsed.data);
      reply.code(201).send(status);
    } catch (error) {
      // One session at a time, like one run at a time: a second request is a
      // conflict rather than a server fault.
      if (isWatchInProgressError(error)) {
        reply.code(409).send({
          error: error.message,
          code: ERROR_CODES.watchInProgress,
        });
        return;
      }
      throw error;
    }
  });

  fastify.delete("/watch", async (_request, reply) => {
    if (refuseReadOnly(reply) || refuseUnsupported(reply)) {
      return;
    }

    await fastify.engine.stopWatch?.();

    // The now-inactive status rather than an empty `204`: the caller's next
    // question is "what is it doing now", and this answers it in the same
    // round-trip.
    return fastify.engine.getWatchStatus?.();
  });

  /**
   * Server-sent events for the watch session.
   *
   * Same contract as the run stream: each frame carries the event's `seq` as
   * its SSE id, so a reconnect replays exactly what was missed.
   */
  fastify.get("/watch/events", async (request, reply) => {
    if (typeof fastify.engine.subscribeWatch !== "function") {
      reply.code(501).send({
        error: "This server's engine cannot watch files",
      });
      return;
    }

    const lastEventId = request.headers["last-event-id"];
    const { sinceSeq: sinceSeqQuery } = request.query as { sinceSeq?: string };
    const sinceSeq = Number.parseInt(
      (Array.isArray(lastEventId) ? lastEventId[0] : lastEventId) ??
        sinceSeqQuery ??
        "0",
      10,
    );

    reply.hijack();

    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    raw.write("retry: 2000\n\n");

    let open = true;

    const unsubscribe = fastify.engine.subscribeWatch(
      (event) => {
        if (!open) {
          return;
        }
        raw.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
      },
      { sinceSeq: Number.isFinite(sinceSeq) ? sinceSeq : 0 },
    );

    const heartbeat = setInterval(() => {
      if (open) {
        raw.write(": heartbeat\n\n");
      }
    }, HEARTBEAT_MS);
    heartbeat.unref?.();

    const close = () => {
      if (!open) {
        return;
      }
      open = false;
      clearInterval(heartbeat);
      unsubscribe();
      raw.end();
    };

    request.raw.on("close", close);
    request.raw.on("error", close);
  });
};
