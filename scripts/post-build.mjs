// Post-build: prepare SPA for Netlify deployment.
// TanStack Start generates _shell.html which needs to be index.html for Netlify.
import { readFileSync, copyFileSync } from "fs";
import { resolve } from "path";

// Copy _shell.html to index.html for Netlify SPA routing
const shellHtml = resolve("dist/client/_shell.html");
const indexHtml = resolve("dist/client/index.html");
const rootIndexHtml = resolve("dist/index.html");
const clientAssetsDir = resolve("dist/client/assets");
const rootAssetsDir = resolve("dist/assets");

try {
  copyFileSync(shellHtml, indexHtml);
  copyFileSync(indexHtml, rootIndexHtml);

  // wrangler tjänar assets från dist/ (assets-directory i wrangler.jsonc)
  try {
    const { existsSync, mkdirSync } = await import("fs");
    if (existsSync(clientAssetsDir) && !existsSync(rootAssetsDir)) {
      mkdirSync(rootAssetsDir, { recursive: true });
    }
    const { cpSync } = await import("fs");
    cpSync(clientAssetsDir, rootAssetsDir, { recursive: true, force: true });
    console.log("[post-build] Copied _shell.html to index.html, index.html to dist/, and assets to dist/ for Netlify SPA routing and wrangler");
  } catch (e3) {
    console.warn("[post-build] index.html kopierades men assets-kopiering misslyckades:", e3.message);
  }
} catch (e) {
  console.warn("[post-build] _shell.html not found, checking if index.html exists...");
  try {
    readFileSync(indexHtml, "utf8");
    copyFileSync(indexHtml, rootIndexHtml);
    console.log("[post-build] index.html copied to dist/ for wrangler");
  } catch (e2) {
    console.error("[post-build] Critical: No HTML shell found in dist/client!");
    process.exit(1);
  }
}
