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
  console.log("[Intern Proxy Bridge] Received message:", request?.type, "from", sender?.origin);

  // 1. Handle PING - for extension detection
  if (request.type === "PING") {
    console.log("[Intern Proxy Bridge] PING received, responding PONG to", sender?.origin);
    sendResponse({ success: true, status: "PONG" });
    return true;
  }

  // 2. Handle internal API calls (SAP)
  // Use async/await instead of .then() chains per Chrome Extension best practices
  if (request.type === "FETCH_INTERNAL") {
    (async () => {
      const url = request.url;
      const startTime = Date.now();
      console.log("[Intern Proxy Bridge] FETCH_INTERNAL started:", {
        method: request.method || "GET",
        url: url,
        origin: sender?.origin,
        timestamp: new Date(startTime).toISOString(),
      });
      try {
        const response = await fetch(url, {
          method: request.method || "GET",
          headers: request.headers || {},
          credentials: "include", // Sends saved auth cookies for the internal domain
        });
        const text = await response.text();
        const duration = Date.now() - startTime;
        console.log("[Intern Proxy Bridge] FETCH_INTERNAL complete:", {
          url: url,
          status: response.status,
          dataLength: text.length,
          durationMs: duration,
        });
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

    console.log("[Intern Proxy Bridge] SAP_COOLDOWN_CHECK:", {
      sapArticleId,
      lastCheck: lastCheck || "never",
      cooldownDays,
      minDays,
      maxDays,
      elapsedDays: elapsedDays.toFixed(2),
      daysRemaining: daysRemaining.toFixed(2),
      shouldCheckNow: shouldCheck,
    });

    sendResponse({
      success: true,
      shouldCheck,
      elapsedDays,
      daysRemaining,
      minDays,
      maxDays,
    });
    return true;
  }

  // 4. Handle SAP_RECORD_CHECK - record that an article was checked (debug logging)
  if (request.type === "SAP_RECORD_CHECK") {
    const { sapArticleId, hasShelfLife, shelfLifeDays, nextCheckDays } = request;
    console.log("[Intern Proxy Bridge] SAP_RECORD_CHECK:", {
      sapArticleId,
      hasShelfLife,
      shelfLifeDays: shelfLifeDays ?? "N/A",
      nextCheckInDays: nextCheckDays,
      recordedAt: new Date().toISOString(),
    });
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