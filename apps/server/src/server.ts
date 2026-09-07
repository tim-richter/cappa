import fs from "node:fs";
import path from "node:path";
import type { CaptureEngine } from "@cappa/core";
import {
  ASSET_PREFIX,
  type Capabilities,
  PROTOCOL_VERSION,
  TOKEN_HEADER,
} from "@cappa/protocol";
import compress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { runsPlugin } from "./runs";
import { screenshotsPlugin } from "./screenshots";
import { isLoopbackHost, resolveFromHere } from "./util";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * The capture engine, injected rather than constructed.
     *
     * The server never loads `cappa.config.ts`: plugins are live closures, so
     * only the process that evaluated the config can hold them. Taking the
     * engine by injection is what keeps a remote engine a drop-in replacement.
     */
    engine: CaptureEngine;
    outputDir: string;
    readOnly: boolean;
  }
}

export interface StartServerOptions {
  engine: CaptureEngine;
  outputDir: string;
  isProd?: boolean;
  uiRoot?: string;
  logger?: boolean;
  /** Theme for the review UI: 'light' or 'dark' */
  theme?: "light" | "dark";
  /**
   * Refuse capture, approval and every other mutation.
   *
   * For serving a CI artifact, where the browser-driving routes have no
   * business being reachable.
   */
  readOnly?: boolean;
  /**
   * Shared secret required on every `/api/*` request.
   *
   * Omit for a loopback bind. Anything reachable from the network must set one:
   * this server drives a real browser and writes to disk.
   */
  token?: string;
  /**
   * Serve the review UI.
   *
   * Defaults to whatever `isProd` resolves to, which is what `cappa review`
   * wants. A host that only exists for a remote `cappa capture` has no reader,
   * so it turns this off and answers `/api/*` alone — the UI's static files and
   * its SPA fallback are simply never registered, and `/` 404s like any other
   * unknown route.
   */
  ui?: boolean;
}

export async function createServer(opts: StartServerOptions) {
  const app = Fastify({ logger: opts.logger ?? true });

  const readOnly = opts.readOnly ?? false;

  app.decorate("engine", opts.engine);
  app.decorate("outputDir", opts.outputDir);
  app.decorate("readOnly", readOnly);

  await app.register(compress);

  if (opts.token) {
    const expected = opts.token;

    app.addHook("onRequest", async (request, reply) => {
      if (!request.url.startsWith("/api/")) {
        return;
      }

      const provided =
        request.headers[TOKEN_HEADER] ??
        (request.query as { token?: string } | undefined)?.token;

      if (provided !== expected) {
        reply.code(401).send({ error: "Unauthorized" });
      }
    });
  }

  const capabilities: Capabilities = {
    capture: !readOnly,
    approve: !readOnly,
    events: true,
  };

  app.get("/api/health", async () => ({
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    capabilities,
  }));

  app.get("/api/config", async () => ({
    theme: opts.theme ?? "light",
    readOnly,
  }));

  await app.register(runsPlugin, { prefix: "/api" });

  await app.register(screenshotsPlugin, { prefix: "/api/screenshots" });

  if (fs.existsSync(opts.outputDir)) {
    app.register(fastifyStatic, {
      root: path.resolve(opts.outputDir),
      prefix: ASSET_PREFIX,
      // security: disable dotfiles and traversal
      decorateReply: false,
      serveDotFiles: false,
      maxAge: 0,
    });
  }

  const isProd = opts.isProd ?? process.env.NODE_ENV === "production";

  if (opts.ui ?? isProd) {
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

export { isLoopbackHost };
