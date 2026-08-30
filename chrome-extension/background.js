/**
 * Intern Proxy Bridge - Background Service Worker
 *
 * Handles PING (extension detection) and FETCH_INTERNAL (proxy SAP requests)
 * messages from the storeflow web application.
 *
 * Runs as a Chrome Extension service worker (Manifest V3).
 * Service workers are ephemeral (~30s inactivity timeout) — never store state
 * in module-level variables. Persist to chrome.storage if state must survive.
 */

// PING handler - responds to storeflow web app to confirm extension is installed
// FETCH_INTERNAL handler - proxies API requests to internal SAP systems with cookies
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  // 1. Handle PING - for extension detection
  if (request.type === "PING") {
    sendResponse({ success: true, status: "PONG" });
    return true;
  }

  // 2. Handle internal API calls (SAP)
  // Use async/await instead of .then() chains per Chrome Extension best practices
  if (request.type === "FETCH_INTERNAL") {
    (async () => {
      try {
        const response = await fetch(request.url, {
          method: request.method || "GET",
          headers: request.headers || {},
          credentials: "include", // Sends saved auth cookies for the internal domain
        });
        const text = await response.text();
        sendResponse({ success: true, status: response.status, data: text });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Okänt fel";
        sendResponse({ success: false, error: message });
      }
    })();
    return true; // Keep channel open for async response
  }

  return false;
});
