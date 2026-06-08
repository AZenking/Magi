import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const MIME_TYPES = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const CLIENT_DIR = join(import.meta.dirname, "dist", "client");

async function main() {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const { default: handler } = await import("./dist/server/server.js");

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const method = req.method ?? "GET";

    // Serve static assets from dist/client
    if (url.pathname.startsWith("/assets/") || url.pathname === "/favicon.ico") {
      const filePath = join(CLIENT_DIR, url.pathname);
      try {
        const data = await readFile(filePath);
        const ct = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
        res.setHeader("content-type", ct);
        res.setHeader("cache-control", "public, max-age=31536000, immutable");
        res.end(data);
        return;
      } catch {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    let body;
    if (method !== "GET" && method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const request = new Request(url, { method, headers, body });
    const response = await handler.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const buf = await response.arrayBuffer();
    res.end(buf.byteLength > 0 ? Buffer.from(buf) : undefined);
  });

  server.listen(port, () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
