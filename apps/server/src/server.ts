import fs from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { screenshotsPlugin } from "./screenshots";
import { resolveFromHere } from "./util";

type Screenshot = {
  name: string;
  url: string;
  category: "new" | "deleted" | "changed" | "passed";
};

// Extend FastifyInstance to include our decorated properties
declare module "fastify" {
  interface FastifyInstance {
    screenshots: Screenshot[];
  }
}

interface StartServerOptions {
  isProd?: boolean;
  uiRoot?: string;
  outputDir: string;
  screenshots: Screenshot[];
}

export async function createServer(opts: StartServerOptions) {
  const app = Fastify({ logger: true });

  // Add screenshots data to the app instance for use in plugins
  app.decorate("screenshots", opts.screenshots);

  app.get("/api/health", async () => ({ ok: true }));

  // Register the screenshots plugin with the /api/screenshots prefix
  app.register(screenshotsPlugin, { prefix: "/api/screenshots" });

  if (fs.existsSync(opts.outputDir)) {
    app.register(fastifyStatic, {
      root: opts.outputDir,
      prefix: "/assets/screenshots",
      // security: disable dotfiles and traversal
      decorateReply: false,
      serveDotFiles: false,
    });
  }

  if (opts.isProd ?? process.env.NODE_ENV === "production") {
    // Prod: serve baked UI
    const uiRoot =
      opts.uiRoot ?? process.env.UI_ROOT ?? resolveFromHere("../public");

    app.register(fastifyStatic, {
      root: uiRoot,
      prefix: "/",
    });

    // SPA fallback (non-API → index.html)
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api/")) {
        reply.code(404).send({ error: "not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
