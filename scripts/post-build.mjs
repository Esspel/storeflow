// Post-build: prepare SPA for Netlify deployment.
// TanStack Start generates _shell.html which needs to be index.html for Netlify.
import { readFileSync, copyFileSync } from "fs";
import { resolve } from "path";

// Copy _shell.html to index.html for Netlify SPA routing
const shellHtml = resolve("dist/client/_shell.html");
const indexHtml = resolve("dist/client/index.html");

try {
  copyFileSync(shellHtml, indexHtml);
  console.log("[post-build] Copied _shell.html to index.html for Netlify SPA routing.");
} catch (e) {
  console.warn("[post-build] _shell.html not found, checking if index.html exists...");
  try {
    readFileSync(indexHtml, "utf8");
    console.log("[post-build] index.html already exists.");
  } catch (e2) {
    console.error("[post-build] Critical: No HTML shell found in dist/client!");
    process.exit(1);
  }
}
