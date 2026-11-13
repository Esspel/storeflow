// Post-build: prepare SPA for Cloudflare Workers / Netlify deployment.
// TanStack Start generates _shell.html which needs to be index.html.
import { copyFileSync, existsSync, cpSync, writeFileSync } from "fs";
import { resolve } from "path";

const shellHtml = resolve("dist/client/_shell.html");
const indexHtml = resolve("dist/client/index.html");
const rootIndexHtml = resolve("dist/index.html");
const notFoundHtml = resolve("dist/404.html");
const clientNotFoundHtml = resolve("dist/client/404.html");
const distClientDir = resolve("dist/client");
const distRootDir = resolve("dist");

function safeCopy(src, dest) {
  try {
    if (existsSync(src)) {
      copyFileSync(src, dest);
    }
  } catch (e) {
    console.warn(`[post-build] Could not copy ${src} -> ${dest}:`, e.message);
  }
}

function safeWrite(dest, content) {
  try {
    writeFileSync(dest, content);
  } catch (e) {
    console.warn(`[post-build] Could not write ${dest}:`, e.message);
  }
}

// 1. Ensure index.html in dist/client and dist/
if (existsSync(shellHtml)) {
  safeCopy(shellHtml, indexHtml);
}
safeCopy(indexHtml, rootIndexHtml);

// 2. 404.html fallbacks for static hosts
safeCopy(indexHtml, notFoundHtml);
safeCopy(indexHtml, clientNotFoundHtml);

// 3. Copy all assets, sw.js, manifest.json, icons from dist/client to dist/ for wrangler
try {
  if (existsSync(distClientDir)) {
    cpSync(distClientDir, distRootDir, { recursive: true, force: true });
    console.log("[post-build] Successfully prepared dist/ and dist/client for SPA routing");
  }
} catch (e) {
  console.warn("[post-build] Warning copying client directory to dist root:", e.message);
}
