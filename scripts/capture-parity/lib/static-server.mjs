import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const CONTENT_TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/**
 * Serve `root` on `port` with no caching, so every capture run sees exactly the
 * bytes on disk. Deliberately dependency-free: the harness must run before
 * `pnpm install` has necessarily produced a static-server binary.
 */
export function startStaticServer(root, port) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = join(root, normalize(url).replace(/^(\.\.[/\\])+/, ""));

    try {
      if (statSync(file).isDirectory()) file = join(file, "index.html");
      statSync(file);
    } catch {
      res.writeHead(404).end("not found");
      return;
    }

    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type":
        CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({
        close: () => new Promise((done) => server.close(() => done())),
      }),
    );
  });
}
