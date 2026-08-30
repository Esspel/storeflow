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
  console.log("[Intern Proxy Bridge] Received message:", request?.type, "from", sender?.origin);

  // 1. Handle PING - for extension detection
  if (request.type === "PING") {
    console.log("[Intern Proxy Bridge] Responding PONG");
    sendResponse({ success: true, status: "PONG" });
    return true;
  }

  // 2. Handle internal API calls (SAP)
  // Use async/await instead of .then() chains per Chrome Extension best practices
  if (request.type === "FETCH_INTERNAL") {
    (async () => {
      const url = request.url;
      console.log("[Intern Proxy Bridge] FETCH_INTERNAL:", request.method || "GET", url);
      try {
        const response = await fetch(url, {
          method: request.method || "GET",
          headers: request.headers || {},
          credentials: "include", // Sends saved auth cookies for the internal domain
        });
        const text = await response.text();
        console.log("[Intern Proxy Bridge] Response status:", response.status, "data length:", text.length);
        sendResponse({ success: true, status: response.status, data: text });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Okänt fel";
        console.error("[Intern Proxy Bridge] Fetch error for", url, ":", message);
        sendResponse({ success: false, error: message });
      }
    })();
    return true; // Keep channel open for async response
  }

  console.warn("[Intern Proxy Bridge] Unknown request type:", request?.type);
  return false;
});

// Log when extension is installed/updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log("[Intern Proxy Bridge] Extension installed/updated:", details.reason);
});
