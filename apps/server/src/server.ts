import fs from "node:fs";
import path from "node:path";
import type { Screenshot } from "@cappa/core";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { screenshotsPlugin } from "./screenshots";
import { resolveFromHere, transform } from "./util";

// Extend FastifyInstance to include our decorated properties
declare module "fastify" {
  interface FastifyInstance {
    screenshots: Screenshot[];
    outputDir: string;
  }
}

interface StartServerOptions {
  isProd?: boolean;
  uiRoot?: string;
  outputDir: string;
  screenshots: Screenshot[];
  logger?: boolean;
  /** Theme for the review UI: 'light' or 'dark' */
  theme?: "light" | "dark";
}

export async function createServer(opts: StartServerOptions) {
  const app = Fastify({ logger: opts.logger ?? true });

  // Add screenshots data to the app instance for use in plugins
  app.decorate("screenshots", transform(opts.screenshots));
  app.decorate("outputDir", opts.outputDir);

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/config", async () => ({
    theme: opts.theme ?? "light",
  }));

  // Register the screenshots plugin with the /api/screenshots prefix
  app.register(screenshotsPlugin, { prefix: "/api/screenshots" });

  if (fs.existsSync(opts.outputDir)) {
    app.register(fastifyStatic, {
      root: path.resolve(opts.outputDir),
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
      root: path.resolve(uiRoot),
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
