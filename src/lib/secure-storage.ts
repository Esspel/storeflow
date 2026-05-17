// Secure session storage using IndexedDB. SSR-safe, no localStorage.

const DB_NAME = "storeflow_secure";
const DB_VERSION = 1;
const STORE_NAME = "session";
const TOKEN_KEY = "sf_token";
const USER_KEY = "sf_user";

function isClient(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

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
    // Silently fail
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

export async function secureGetToken(): Promise<string | null> {
  if (!isClient()) return null;
  return idbGet<string>(TOKEN_KEY);
}

export async function secureGetUser<T>(): Promise<T | null> {
  if (!isClient()) return null;
  return idbGet<T>(USER_KEY);
}

export async function secureSetSession(token: string, user: unknown): Promise<void> {
  if (!isClient()) return;
  await Promise.all([idbSet(TOKEN_KEY, token), idbSet(USER_KEY, user)]);
}

export async function secureClearSession(): Promise<void> {
  if (!isClient()) return;
  await Promise.all([idbDelete(TOKEN_KEY), idbDelete(USER_KEY)]);
}

export async function secureGetSession<T>(): Promise<{ token: string; user: T } | null> {
  const [token, user] = await Promise.all([secureGetToken(), secureGetUser<T>()]);
  if (!token || !user) return null;
  return { token, user };
}
