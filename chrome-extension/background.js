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
// SAP_COOLDOWN_INFO - returns cooldown status for SAP checks
// SAP_RECORD_CHECK - logs that an article check was performed (for debugging)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  // Endast fel och redo-meddelanden loggas — inte varje artikel

  // 1. Handle PING - for extension detection
  if (request.type === "PING") {
    // PING svarar tyst — loggas inte per anrop
    sendResponse({ success: true, status: "PONG" });
    return true;
  }

  // 2. Handle internal API calls (SAP)
  // Use async/await instead of .then() chains per Chrome Extension best practices
  if (request.type === "FETCH_INTERNAL") {
    (async () => {
      const url = request.url;
      const startTime = Date.now();
      try {
        const response = await fetch(url, {
          method: request.method || "GET",
          headers: request.headers || {},
          credentials: "include", // Sends saved auth cookies for the internal domain
        });
        const text = await response.text();
        const duration = Date.now() - startTime;
        sendResponse({ success: true, status: response.status, data: text });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Okänt fel";
        console.error("[Intern Proxy Bridge] FETCH_INTERNAL failed:", {
          url: url,
          error: message,
          durationMs: Date.now() - startTime,
        });
        sendResponse({ success: false, error: message });
      }
    })();
    return true; // Keep channel open for async response
  }

  // 3. Handle SAP_COOLDOWN_CHECK - debug info for cooldown management
  if (request.type === "SAP_COOLDOWN_CHECK") {
    const { sapArticleId, lastCheck, cooldownDays } = request;
    const now = Date.now();
    const last = lastCheck ? new Date(lastCheck).getTime() : 0;
    const elapsedDays = last ? (now - last) / (1000 * 60 * 60 * 24) : Infinity;
    const minDays = 14;
    const maxDays = 60;
    const daysRemaining = last ? Math.max(0, cooldownDays - elapsedDays) : 0;
    const shouldCheck = !last || elapsedDays >= cooldownDays;

    sendResponse({ success: true, shouldCheck, elapsedDays, daysRemaining, minDays, maxDays });
    return true;
  }

  // 4. Handle SAP_RECORD_CHECK - loggas ej per artikel
  if (request.type === "SAP_RECORD_CHECK") {
    const { sapArticleId, hasShelfLife, shelfLifeDays, nextCheckDays } = request;
    sendResponse({ success: true, recorded: true });
    return true;
  }

  console.warn("[Intern Proxy Bridge] Unknown request type:", request?.type);
  return false;
});

// Log when extension is installed/updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log("[Intern Proxy Bridge] Extension installed/updated:", details.reason);
});
