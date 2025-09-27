import type { FastifyPluginAsync } from "fastify";

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

    let screenshots = fastify.screenshots || [];

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
    const screenshots = fastify.screenshots || [];
    const screenshot = screenshots.find((s) => s.id === decodeURIComponent(id));

    if (!screenshot) {
      reply.code(404).send({ error: "Screenshot not found" });
      return;
    }

    return screenshot;
  });

  // POST /api/screenshots - Create new screenshot (example)
  fastify.post("/", async (request, reply) => {
    const screenshot = request.body;
    // Add your screenshot creation logic here
    reply.code(201).send({ message: "Screenshot created", screenshot });
  });

  // DELETE /api/screenshots/:id - Delete screenshot
  fastify.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // Add your screenshot deletion logic here
    reply.send({ message: `Screenshot ${id} deleted` });
  });
};
