import fs from "node:fs";
import path from "node:path";
import type { Screenshot } from "@cappa/core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod/mini";

/**
 * Fastify plugin for screenshots routes
 *
 * This plugin handles all routes under /api/screenshots:
 * - GET /api/screenshots - Get all screenshots (supports ?search=term&category=new|deleted|changed|passed)
 * - GET /api/screenshots/:id - Get specific screenshot by ID
 * - POST /api/screenshots - Create new screenshot
 * - DELETE /api/screenshots/:id - Delete screenshot by ID
 */
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

    const outputDir = fastify.outputDir;

    if (updatedScreenshot.approved) {
      const dir = path.dirname(
        `${outputDir}/expected/${updatedScreenshot.name}`,
      );
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
          recursive: true,
        });
      }

      fs.copyFileSync(
        `${outputDir}/actual/${updatedScreenshot.name}.png`,
        `${outputDir}/expected/${updatedScreenshot.name}.png`,
      );
    }

    reply.code(200).send(updatedScreenshot);
  });
};
