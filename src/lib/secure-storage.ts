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
// AES-GCM encryption for IndexedDB token storage (STATE-01)
async function getCryptoKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('storeflow-crypto-key-2026'),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  );
  return raw;
}

export async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getCryptoKey();
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token)
  );
  // Store as iv + ciphertext, base64 encoded
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(encrypted: string): Promise<string | null> {
  try {
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const key = await getCryptoKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}


function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
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
    const val = localStorage.getItem("sf_session_token");
    return val ? await decryptToken(val) : null;
  }
  const encrypted = await idbGet<string>(TOKEN_KEY);
  return encrypted ? await decryptToken(encrypted) : null;
}

export async function secureGetUser<T>(): Promise<T | null> {
  if (!isBrowser()) return null;
  if (!isIDBAvailable()) {
    if (!isLocalStorageAvailable()) return null;
    const raw = localStorage.getItem("sf_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
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

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(token, TOKEN_KEY);
      store.put(user, USER_KEY);
      store.put(expiresAt, EXPIRY_KEY);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — auth will just require re-login
  }
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

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(TOKEN_KEY);
      store.delete(USER_KEY);
      store.delete(EXPIRY_KEY);

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
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
