import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { resolveFromHere } from "./util";
import { getAllScreenshots } from "./screenshots";
import fs from "node:fs";

interface StartServerOptions {
  isProd?: boolean
  uiRoot?: string
  outputDir: string,
  screenshotPaths: {
    actual: string[],
    expected: string[],
    diff: string[]
  }
}

export async function createServer(opts: StartServerOptions) {
  const app = Fastify({ logger: true });

  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/screenshots', async (req, reply) => {
    reply.send(opts.screenshotPaths)
  })

  if (fs.existsSync(opts.outputDir)) {
    app.register(fastifyStatic, {
      root: opts.outputDir,
      prefix: '/shots',
      // security: disable dotfiles and traversal
      decorateReply: false,
        serveDotFiles: false
    })
  }

  if (opts.isProd ?? process.env.NODE_ENV === "production") {
    // Prod: serve baked UI
		const uiRoot =
    opts.uiRoot ??
    process.env.UI_ROOT ??
    resolveFromHere('../public')

  app.register(fastifyStatic, {
    root: uiRoot,
    prefix: '/'
  })

  // SPA fallback (non-API → index.html)
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url && req.raw.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'not found' })
      return
    }
    reply.sendFile('index.html')
  })
  }

  return app;
}
