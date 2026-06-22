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
const DEFAULT_API_PORT = "3001";

function clean(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveApiUrl(url) {
  const configured = clean(process.env.VITE_API_URL);
  if (configured) return configured;

  const protocol =
    clean(process.env.PUBLIC_PROTOCOL) ??
    clean(url.protocol.replace(":", "")) ??
    "http";
  const apiPort = clean(process.env.API_PORT) ?? DEFAULT_API_PORT;
  return `${protocol}://${url.hostname}:${apiPort}`;
}

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
    let buf = Buffer.from(await response.arrayBuffer());

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") && buf.byteLength > 0) {
      const payload = JSON.stringify({
        API_URL: resolveApiUrl(url),
        API_PORT: clean(process.env.API_PORT) ?? DEFAULT_API_PORT,
      }).replace(/</g, "\\u003c");
      const envScript = `<script>window.__ENV__=${payload};</script>`;
      const html = buf.toString("utf8");
      const headIdx = html.indexOf("<head>");
      if (headIdx !== -1) {
        const insertAt = headIdx + "<head>".length;
        const modified =
          html.slice(0, insertAt) + envScript + html.slice(insertAt);
        buf = Buffer.from(modified, "utf8");
        res.removeHeader("content-length");
        res.setHeader("content-length", buf.byteLength);
      }
    }

    res.end(buf.byteLength > 0 ? buf : undefined);
  });

  server.listen(port, () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
