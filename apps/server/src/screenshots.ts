import { type Screenshot, ScreenshotFileSystem } from "@cappa/core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod/mini";

/**
 * Fastify plugin for screenshots routes
 *
 * This plugin handles all routes under /api/screenshots:
 * - GET /api/screenshots - Get all screenshots (supports ?search=term&category=new|deleted|changed|passed)
 * - GET /api/screenshots/:id - Get specific screenshot by ID
 * - POST /api/screenshots/approve-batch - Approve multiple screenshots by name
 * - POST /api/screenshots - Create new screenshot
 * - DELETE /api/screenshots/:id - Delete screenshot by ID
 */
const approveBatchBodySchema = z.object({
  names: z.array(z.string()),
});

export const screenshotsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /api/screenshots - Get all screenshots with optional search and category filters
  fastify.get("/", async (request) => {
    const { search, category } = request.query as {
      search?: string;
      category?: "new" | "deleted" | "changed" | "passed";
    };

    let screenshots = fastify.screenshots;

    // Filter by category if provided
    if (category) {
      screenshots = screenshots.filter(
        (screenshot) => screenshot.category === category,
      );
    }

    // Filter by search term if provided
    if (search) {
      const searchTerm = search.toLowerCase();
      screenshots = screenshots.filter((screenshot) =>
        screenshot.name.toLowerCase().includes(searchTerm),
      );
    }

    return screenshots;
  });

  // POST /api/screenshots/approve-batch - Approve multiple screenshots by name (must be before /:id)
  fastify.post("/approve-batch", async (request, reply) => {
    const parsed = approveBatchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: z.flattenError(parsed.error) });
      return;
    }
    const { names } = parsed.data;
    if (names.length === 0) {
      reply.code(400).send({
        error: {
          fieldErrors: { names: ["names must be a non-empty array"] },
          formErrors: [],
        },
      });
      return;
    }
    const fileSystem = new ScreenshotFileSystem(fastify.outputDir);
    let screenshots = fastify.screenshots;
    const approved: string[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const name of names) {
      const screenshot = screenshots.find((s) => s.name === name);
      if (!screenshot) {
        errors.push({ name, error: "Screenshot not found" });
        continue;
      }
      if (screenshot.approved) {
        continue;
      }
      try {
        fileSystem.approveByName(name);
      } catch (err) {
        errors.push({
          name,
          error: err instanceof Error ? err.message : "Approval failed",
        });
        continue;
      }
      const updated = { ...screenshot, approved: true };
      screenshots = screenshots.map((s) => (s.name === name ? updated : s));
      approved.push(name);
    }

    fastify.screenshots = screenshots;
    reply.code(200).send({ approved, errors });
  });

  // GET /api/screenshots/:id - Get specific screenshot
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const screenshots = fastify.screenshots;
    const screenshot = screenshots.find((s) => s.id === decodeURIComponent(id));

    if (!screenshot) {
      reply.code(404).send({ error: "Screenshot not found" });
      return;
    }

    return screenshot;
  });

  // PATCH /api/screenshots - Update screenshot
  fastify.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const screenshot = request.body as Screenshot;
    const screenshots = fastify.screenshots;

    const screenshotToUpdate = screenshots.find(
      (s) => s.id === decodeURIComponent(id),
    );

    if (!screenshotToUpdate) {
      reply.code(404).send({ error: "Screenshot not found" });
      return;
    }

    const validatedScreenshot = z
      .object({
        approved: z.boolean("approved must be a boolean"),
      })
      .safeParse(screenshot);

    if (validatedScreenshot.error) {
      reply
        .code(400)
        .send({ error: z.flattenError(validatedScreenshot.error) });
      return;
    }

    const updatedScreenshot = {
      ...screenshotToUpdate,
      ...validatedScreenshot.data,
    };

    // update the screenshot in the screenshots array
    fastify.screenshots = screenshots.map((s) =>
      s.id === decodeURIComponent(id) ? updatedScreenshot : s,
    );

    if (updatedScreenshot.approved) {
      const fileSystem = new ScreenshotFileSystem(fastify.outputDir);
      fileSystem.approveByName(updatedScreenshot.name);
    }

    reply.code(200).send(updatedScreenshot);
  });
};
