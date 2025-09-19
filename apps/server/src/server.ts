import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

function hereDir(): string {
	return path.dirname(fileURLToPath(import.meta.url))
}

function resolveFromHere(relative: string): string {
	return path.resolve(hereDir(), relative)
}

interface StartServerOptions {
  isProd?: boolean
  uiRoot?: string
}

export async function createServer(opts: StartServerOptions = {}) {
  const app = Fastify({ logger: true });

  app.get('/api/health', async () => ({ ok: true }))

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
