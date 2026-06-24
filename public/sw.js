// StoreFlow Service Worker — offline shell caching + Web Push + Background Sync
// Strategy: Cache-First for static assets, Network-First for API/supabase calls.
// Bump CACHE_VERSION on every production deploy to force a cache refresh and
// trigger the update banner on all open tabs.
const CACHE_VERSION = "v5";
const CACHE_NAME = `storeflow-shell-${CACHE_VERSION}`;

// ── IndexedDB token access ───────────────────────────────────────────────────
// Reads the session token directly from the same IndexedDB store that
// secure-storage.ts writes to. This survives SW restarts and closed tabs.
const IDB_NAME = "storeflow_secure";
const IDB_VERSION = 1;
const IDB_STORE = "session";
const IDB_TOKEN_KEY = "sf_token";

function getTokenFromIDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, "readonly");
        const get = tx.objectStore(IDB_STORE).get(IDB_TOKEN_KEY);
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// ── Offline sync queue (IndexedDB) ──────────────────────────────────────────
const SYNC_DB_NAME = "storeflow_sync";
const SYNC_DB_VERSION = 1;
const SYNC_STORE = "queue";

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_DB_NAME, SYNC_DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SYNC_STORE, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueSync(entry) {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(SYNC_STORE, "readwrite");
    tx.objectStore(SYNC_STORE).add(entry);
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  } catch {}
}

async function drainSyncQueue() {
  const token = await getTokenFromIDB();
  if (!token) return;
  let db;
  try { db = await openSyncDB(); } catch { return; }

  const tx = db.transaction(SYNC_STORE, "readwrite");
  const store = tx.objectStore(SYNC_STORE);
  const all = await new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });
  const keys = await new Promise((resolve) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });

  for (let i = 0; i < all.length; i++) {
    const entry = all[i];
    try {
      const res = await fetch(entry.url, {
        method: entry.method || "POST",
        headers: {
          ...entry.headers,
          "x-session-token": token,
        },
        body: entry.body ? JSON.stringify(entry.body) : undefined,
      });
      if (res.ok || res.status < 500) {
        store.delete(keys[i]);
      }
    } catch {
      break;
    }
  }
  db.close();
}

// ── Message handling ─────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "ENQUEUE_SYNC") {
    enqueueSync(event.data.entry);
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

// ── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "storeflow-offline-sync") {
    event.waitUntil(drainSyncQueue());
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
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: payload.tag ?? "storeflow-notification",
    renotify: true,
    data: {
      url: payload.url ?? "/",
    },
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Forward to visible window for in-app toast
        for (const client of clients) {
          if (client.visibilityState === "visible") {
            client.postMessage({ type: "PUSH_RECEIVED", payload });
            break;
          }
        }
        // Always show OS-level notification regardless of app visibility
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
