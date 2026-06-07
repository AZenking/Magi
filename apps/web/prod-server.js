import { createServer } from "node:http";

async function main() {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const { default: handler } = await import("./dist/server/server.js");

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const method = req.method ?? "GET";
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
