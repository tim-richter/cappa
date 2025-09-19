import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import middie from '@fastify/middie'
import fs from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isProd = process.env.NODE_ENV === 'production'

async function createServer() {
	const app = Fastify({ logger: true })

	// Example API
	app.get('/api/health', async function () {
		return { ok: true }
	})

	if (isProd) {
		// Prod: serve built assets
		// dist structure: dist/
		//   - client/ (vite build)
		//   - server/server.js (this file bundled by tsup)
		const distClientDir = path.resolve(__dirname, '../client')
		await app.register(fastifyStatic, {
			root: distClientDir,
			prefix: '/assets/',
			wildcard: false,
			decorateReply: false
		})

		// SPA fallback: serve index.html for non-API routes
		app.get('/*', async function (_req, reply) {
			const indexPath = path.join(distClientDir, 'index.html')
			const html = await fs.readFile(indexPath, 'utf8')
			reply.type('text/html').send(html)
			return
		})
	}

	return app
}

async function main() {
	const app = await createServer()
	const port = Number(process.env.PORT ?? 5173)
	const host = process.env.HOST ?? '0.0.0.0'
	try {
		await app.listen({ port, host })
		app.log.info(`Server listening on http://${host}:${port}`)
	} catch (err) {
		app.log.error(err)
		process.exit(1)
	}
}

main()
