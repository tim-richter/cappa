import {
  approveRequestSchema,
  screenshotCategorySchema,
} from "@cappa/protocol";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { type ScreenshotView, transform } from "./util";

/**
 * Screenshot routes, all read-through to the engine:
 *
 * - `GET /api/screenshots` — every screenshot (`?search=`, `?category=`)
 * - `GET /api/screenshots/:id` — one screenshot
 * - `POST /api/screenshots/approve-batch` — approve several by name, which is
 *   also how the UI approves just one
 *
 * Nothing is cached between requests: the index is rebuilt from disk each time,
 * so a capture run — or a `cappa` invocation in another terminal — is reflected
 * immediately instead of leaving the open UI showing a stale snapshot.
 */
const querySchema = z.object({
  search: z.string().optional(),
  category: screenshotCategorySchema.optional(),
});

export const screenshotsPlugin: FastifyPluginAsync = async (fastify) => {
  const list = async (): Promise<ScreenshotView[]> => {
    return transform(await fastify.engine.listScreenshots());
  };

  fastify.get("/", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ error: z.flattenError(parsed.error) });
      return;
    }

    const { search, category } = parsed.data;

    // Transform the full list first so `next`/`prev` span every screenshot,
    // then narrow.
    let screenshots = await list();

    if (category) {
      screenshots = screenshots.filter(
        (screenshot) => screenshot.category === category,
      );
    }

    if (search) {
      const searchTerm = search.toLowerCase();
      screenshots = screenshots.filter((screenshot) =>
        screenshot.name.toLowerCase().includes(searchTerm),
      );
    }

    return screenshots;
  });

  // Must be registered before `/:id`, or "approve-batch" is read as an id.
  fastify.post("/approve-batch", async (request, reply) => {
    if (fastify.readOnly) {
      reply.code(403).send({ error: "Server is read-only" });
      return;
    }

    const parsed = approveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: z.flattenError(parsed.error) });
      return;
    }

    const result = await fastify.engine.approve(parsed.data.names);
    reply.code(200).send(result);
  });

  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const screenshots = await list();
    const screenshot = screenshots.find((s) => s.id === decodeURIComponent(id));

    if (!screenshot) {
      reply.code(404).send({ error: "Screenshot not found" });
      return;
    }

    return screenshot;
  });
};
