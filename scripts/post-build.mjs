// Post-build: replace SSR server with a minimal static SPA worker.
// This avoids node:async_hooks and other Node-only imports that crash
// on Cloudflare Workers / Bolt.host edge runtime.
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const serverJs = resolve("dist/server/server.js");
const indexHtml = readFileSync(resolve("dist/client/index.html"), "utf8");

const spaWorker = `
const INDEX_HTML = ${JSON.stringify(indexHtml)};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Static assets: let the runtime serve them (they live in dist/client/)
    // Any HTML navigation request gets the SPA shell
    const ext = path.split(".").pop();
    const isAsset = path.startsWith("/assets/") ||
      ["js","css","ico","png","jpg","jpeg","svg","webp","woff","woff2","ttf","json","txt","xml","map"].includes(ext);

    if (isAsset) {
      // Return 404 so the static file serving layer handles it natively
      return new Response(null, { status: 404 });
    }

    return new Response(INDEX_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
`.trim();

writeFileSync(serverJs, spaWorker, "utf8");
console.log("[post-build] Replaced dist/server/server.js with SPA stub.");
