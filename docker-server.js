import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const clientDir = join(__dirname, "dist", "client");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

async function tryStaticFile(pathname) {
  const filePath = join(clientDir, pathname);
  if (!filePath.startsWith(clientDir)) return null;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mime = mimeTypes[ext] || "application/octet-stream";
    const headers = { "Content-Type": mime };
    if (pathname.startsWith("/assets/")) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    return { content, headers };
  } catch {
    return null;
  }
}

const workerModule = await import("./dist/server/index.js");
const worker = workerModule.default;

const port = parseInt(process.env.PORT || "3000", 10);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);

  const staticResult = await tryStaticFile(url.pathname);
  if (staticResult) {
    for (const [k, v] of Object.entries(staticResult.headers)) {
      res.setHeader(k, v);
    }
    res.writeHead(200);
    res.end(staticResult.content);
    return;
  }

  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const body = req.method !== "GET" && req.method !== "HEAD"
      ? await new Promise((resolve) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
        })
      : undefined;

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
    });

    const response = await worker.fetch(request, {}, { waitUntil: () => {} });

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error("SSR error:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`StoreFlow running on http://0.0.0.0:${port}`);
});
