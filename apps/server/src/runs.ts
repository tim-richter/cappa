import { isRunInProgressError, isUnknownTargetsError } from "@cappa/core";
import { startRunRequestSchema } from "@cappa/protocol";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

/** How often to write an SSE comment so idle proxies keep the socket open. */
const HEARTBEAT_MS = 15_000;

const targetsQuerySchema = z.object({
  refresh: z.string().optional(),
});

const isTruthy = (value?: string) =>
  value === "1" || value === "true" || value === "";

/**
 * Capture routes:
 *
 * - `GET  /api/plugins`         — plugins the engine can run
 * - `GET  /api/targets`         — discovered tasks (`?refresh=1` re-discovers)
 * - `POST /api/runs`            — start a run
 * - `GET  /api/runs`            — run history, newest first
 * - `GET  /api/runs/:id`        — run detail
 * - `POST /api/runs/:id/cancel` — abort a run
 * - `GET  /api/runs/:id/events` — SSE event stream
 */
export const runsPlugin: FastifyPluginAsync = async (fastify) => {
  const refuseReadOnly = (reply: {
    code: (n: number) => { send: (body: unknown) => void };
  }): boolean => {
    if (fastify.readOnly) {
      reply.code(403).send({ error: "Server is read-only" });
      return true;
    }
    return false;
  };

  fastify.get("/plugins", async () => fastify.engine.listPlugins());

  fastify.get("/targets", async (request, reply) => {
    const parsed = targetsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ error: z.flattenError(parsed.error) });
      return;
    }

    try {
      return await fastify.engine.listTargets({
        refresh: isTruthy(parsed.data.refresh),
      });
    } catch (error) {
      if (isRunInProgressError(error)) {
        reply.code(409).send({
          error: error.message,
          activeRunId: error.activeRunId,
        });
        return;
      }
      throw error;
    }
  });

  fastify.post("/runs", async (request, reply) => {
    if (refuseReadOnly(reply)) {
      return;
    }

    const parsed = startRunRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: z.flattenError(parsed.error) });
      return;
    }

    try {
      const summary = await fastify.engine.startRun(parsed.data);
      reply.code(201).send({ runId: summary.id, run: summary });
    } catch (error) {
      // One run at a time; a second request is a conflict, not a server fault.
      if (isRunInProgressError(error)) {
        reply.code(409).send({
          error: error.message,
          activeRunId: error.activeRunId,
        });
        return;
      }
      // The client may only ask for tasks discovery produced — this is what
      // stops a request steering the browser to an arbitrary URL.
      if (isUnknownTargetsError(error)) {
        reply.code(400).send({ error: error.message, taskIds: error.taskIds });
        return;
      }
      throw error;
    }
  });

  fastify.get("/runs", async () => fastify.engine.listRuns());

  fastify.get("/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = await fastify.engine.getRun(decodeURIComponent(id));

    if (!run) {
      reply.code(404).send({ error: "Run not found" });
      return;
    }

    return run;
  });

  fastify.post("/runs/:id/cancel", async (request, reply) => {
    if (refuseReadOnly(reply)) {
      return;
    }

    const { id } = request.params as { id: string };
    const runId = decodeURIComponent(id);
    const run = await fastify.engine.getRun(runId);

    if (!run) {
      reply.code(404).send({ error: "Run not found" });
      return;
    }

    await fastify.engine.cancelRun(runId);
    reply.code(202).send({ runId });
  });

  /**
   * Server-sent events for one run.
   *
   * Each frame carries the event's `seq` as its SSE id, so a browser
   * `EventSource` reconnect replays exactly what was missed via the
   * `Last-Event-ID` header — a dropped connection is invisible to the client.
   * Non-browser clients can pass `?sinceSeq=` instead.
   */
  fastify.get("/runs/:id/events", async (request, reply) => {
    const { id } = request.params as { id: string };
    const runId = decodeURIComponent(id);

    const run = await fastify.engine.getRun(runId);
    if (!run) {
      reply.code(404).send({ error: "Run not found" });
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

    // Take over the socket: Fastify must not try to serialize a response for a
    // stream that stays open.
    reply.hijack();

    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tell nginx and friends not to buffer the stream.
      "X-Accel-Buffering": "no",
    });
    raw.write("retry: 2000\n\n");

    let open = true;

    const unsubscribe = fastify.engine.subscribeRun(
      runId,
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
    // Never let an idle stream hold the process open.
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
