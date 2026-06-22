// Secure session storage using IndexedDB.
// Replaces localStorage for token storage to allow Service Worker access
// while keeping XSS attack surface minimal (no window-level global exposure).

const DB_NAME = "storeflow_secure";
const DB_VERSION = 1;
const STORE_NAME = "session";
const TOKEN_KEY = "sf_token";
const USER_KEY = "sf_user";
const EXPIRY_KEY = "sf_session_expires_at";

export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours absolute

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — auth will just require re-login
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

function isIDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function isLocalStorageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export async function secureGetToken(): Promise<string | null> {
  if (!isBrowser()) return null;
  if (!isIDBAvailable()) {
    if (!isLocalStorageAvailable()) return null;
    return localStorage.getItem("sf_session_token");
  }
  return idbGet<string>(TOKEN_KEY);
}

export async function secureGetUser<T>(): Promise<T | null> {
  if (!isBrowser()) return null;
  if (!isIDBAvailable()) {
    if (!isLocalStorageAvailable()) return null;
    const raw = localStorage.getItem("sf_user");
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  return idbGet<T>(USER_KEY);
}

export async function secureSetSession(token: string, user: unknown): Promise<void> {
  const expiresAt = Date.now() + SESSION_LIFETIME_MS;
  if (!isBrowser()) return;
  if (!isIDBAvailable()) {
    if (!isLocalStorageAvailable()) return;
    localStorage.setItem("sf_session_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
    localStorage.setItem("sf_session_expires_at", String(expiresAt));
    return;
  }
  await Promise.all([idbSet(TOKEN_KEY, token), idbSet(USER_KEY, user), idbSet(EXPIRY_KEY, expiresAt)]);
}

export async function secureClearSession(): Promise<void> {
  if (!isBrowser()) return;
  if (!isIDBAvailable()) {
    if (!isLocalStorageAvailable()) return;
    localStorage.removeItem("sf_session_token");
    localStorage.removeItem("sf_user");
    localStorage.removeItem("sf_session_expires_at");
    return;
  }
  await Promise.all([idbDelete(TOKEN_KEY), idbDelete(USER_KEY), idbDelete(EXPIRY_KEY)]);
}

export async function secureGetSession<T>(): Promise<{ token: string; user: T } | null> {
  const [token, user] = await Promise.all([secureGetToken(), secureGetUser<T>()]);
  if (!token || !user) return null;
  return { token, user };
}

export async function secureGetSessionExpiresAt(): Promise<number | null> {
  if (!isBrowser()) return null;
  if (!isIDBAvailable()) {
    if (!isLocalStorageAvailable()) return null;
    const raw = localStorage.getItem("sf_session_expires_at");
    return raw ? Number(raw) : null;
  }
  return idbGet<number>(EXPIRY_KEY);
}
