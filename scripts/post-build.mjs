// Post-build: replace the entire SSR server bundle with a minimal SPA Worker.
// The TanStack Start SSR bundle imports node:async_hooks which crashes on
// Cloudflare Workers (Bolt.host) since it lacks Node.js compatibility flags.
// Instead we serve the prerendered index.html shell for all navigation requests
// and let the client-side router handle routing.
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const serverJs = resolve("dist/server/server.js");
const indexHtml = readFileSync(resolve("dist/client/index.html"), "utf8");

const spaWorker = `const INDEX_HTML = ${JSON.stringify(indexHtml)};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;
    const ext = p.includes(".") ? p.split(".").pop() : "";
    const isAsset = p.startsWith("/assets/") ||
      ["js","css","ico","png","jpg","jpeg","svg","webp","woff","woff2","ttf","json","txt","xml","map"].includes(ext);
    if (isAsset) {
      return new Response(null, { status: 404 });
    }
    return new Response(INDEX_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};`;

writeFileSync(serverJs, spaWorker, "utf8");
console.log("[post-build] dist/server/server.js replaced with SPA Worker stub.");
