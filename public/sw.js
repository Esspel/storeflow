// StoreFlow Service Worker — offline shell caching + Web Push
// Strategy: Cache-First for static assets, Network-First for API/supabase calls.
// Bump CACHE_VERSION on every production deploy to force a cache refresh and
// trigger the update banner on all open tabs.
const CACHE_VERSION = "v4";
const CACHE_NAME = `storeflow-shell-${CACHE_VERSION}`;

// Session token for attaching x-session-token to background sync requests.
// Populated via postMessage from the main thread after login.
let _sessionToken = null;

self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_TOKEN") {
    _sessionToken = event.data.token ?? null;
  }
  // Main thread sends SKIP_WAITING after the user confirms the update banner
  // (or after the 5-second countdown). This activates the new SW immediately.
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Static assets to pre-cache on install (app shell)
const SHELL_URLS = ["/", "/login"];

self.addEventListener("install", (event) => {
  // Pre-cache the app shell. Do NOT skipWaiting here — the update banner in
  // the main thread controls when the new SW activates (after user is notified).
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept Supabase API, realtime, or auth calls — always go to network
  if (
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/functions/") ||
    request.method !== "GET"
  ) {
    return;
  }

  // For navigation requests (HTML pages): network-first, fall back to cached "/"
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r ?? Response.error())),
    );
    return;
  }

  // For static assets (JS, CSS, fonts, images): cache-first
  if (url.pathname.match(/\.(js|css|woff2?|ttf|png|svg|ico|webp|jpg|jpeg)$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            return res;
          }),
      ),
    );
  }
});

// ── Web Push ─────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "StoreFlow", body: event.data.text() };
  }

  const title = payload.title ?? "StoreFlow";
  const options = {
    body: payload.body ?? "",
    icon: "/manifest.json",
    badge: "/badge-72x72.png",
    // Zebra TC52 vibration pattern: two short pulses
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: payload.tag ?? "storeflow-notification",
    renotify: true,
    data: {
      url: payload.url ?? "/",
    },
  };

  // Only show OS notification if no app window is currently visible/focused.
  // When the app is open the in-app notification tab handles it via polling.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const appOpen = clients.some((c) => c.visibilityState === "visible");
        if (appOpen) return;
        return self.registration.showNotification(title, options);
      }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if already open on target URL
        for (const client of clients) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        // Focus any open window and navigate
        for (const client of clients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return;
          }
        }
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
