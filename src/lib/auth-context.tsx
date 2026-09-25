import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { type AppUser, type Store, supabase, setSessionToken } from "./supabase";
import {
  getStoredSession,
  storeSession,
  clearSession,
  login as doLogin,
  logout as doLogout,
  validateSession,
  isSessionLocallyExpired,
  backgroundValidateAndRefresh,
  refreshSession,
} from "./auth";
import { secureGetSessionExpiresAt } from "./secure-storage";

type AuthContextType = {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  hasCheckedAuth: boolean;
  userStores: Store[];
  activeStore: Store | null;
  setActiveStore: (store: Store | null) => Promise<void>;
  effectiveStore: Store | null;
  isFirstLogin: boolean;
  showFirstTimeSetup: boolean;
  triggerFirstTimeSetup: () => void;
  dismissFirstTimeSetup: () => void;
  login: (
    username: string,
    password: string,
    pin?: string,
  ) => Promise<{ error?: string; mustChangePassword?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: (user: AppUser) => void;
  refreshUserStores: () => Promise<void>;
  lockScreenOpen: boolean;
  openLockScreen: () => void;
  closeLockScreen: () => void;
  quickSwitch: (newUser: AppUser, newToken: string) => Promise<void>;
  isOffline: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

const IDB_RETRY_COUNT = 3;
const IDB_RETRY_DELAY_MS = 200;
const BACKGROUND_VALIDATE_INTERVAL_MS = 5 * 60 * 1000;
const NETWORK_RETRY_INTERVAL_MS = 30_000;

function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = String(err);
  return (
    /failed to fetch|network|timeout|offline|TypeError/i.test(msg) ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [userStores, setUserStores] = useState<Store[]>([]);
  const [activeStore, setActiveStoreState] = useState<Store | null>(null);
  const [lockScreenOpen, setLockScreenOpen] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    setIsClient(true);
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const effectiveStore = activeStore;

  const loadUserStores = useCallback(async (userId: string, currentUser: AppUser) => {
    const hierarchyLevel = currentUser.hierarchy_level;
    const isAboveStore =
      currentUser.role === "admin" ||
      hierarchyLevel === "hk" ||
      hierarchyLevel === "forening" ||
      hierarchyLevel === "distrikt";

    if (isAboveStore) {
      let query = supabase
        .from("stores")
        .select("*, forening:foreningar(*), distrikt:distrikt(*)")
        .order("name");

      if (hierarchyLevel === "forening" && currentUser.forening_id) {
        query = query.eq("forening_id", currentUser.forening_id);
      } else if (hierarchyLevel === "distrikt" && currentUser.distrikt_id) {
        query = query.eq("distrikt_id", currentUser.distrikt_id);
      }

      const { data, error } = await query;
      if (error) {
        if (!isNetworkError(error)) {
          console.error("Fel vid hämtning av överordnade butiker:", error.message);
        }
        setUserStores([]);
        return [];
      }
      const stores = (data ?? []) as Store[];
      setUserStores(stores);
      return stores;
    }

    const { data, error } = await supabase
      .from("user_stores")
      .select("store:stores(*, forening:foreningar(*), distrikt:distrikt(*))")
      .eq("user_id", userId);

    if (error) {
      if (!isNetworkError(error)) {
        console.error("Fel vid hämtning av användarbutiker:", error.message);
      }
      setUserStores([]);
      return [];
    }

    const stores = (data ?? [])
      .map((r: { store: unknown }) => r.store)
      .filter((s): s is Store => Boolean(s));

    setUserStores(stores);
    return stores;
  }, []);

  const refreshUserStores = useCallback(async () => {
    if (!user) return;
    await loadUserStores(user.id, user);
  }, [user, loadUserStores]);

  // ─── Trust-first session restoration on initial mount ──────────────────────
  //
  // NEW APPROACH (trust-first): Restore the session from IndexedDB immediately
  // and trust it. The local expiry timestamp is checked first — if the session
  // hasn't expired locally, we set the token + user right away and show the app
  // instantly. Background validation runs after the initial render without
  // blocking.
  //
  // This replaces the old "validate first or redirect" approach that bounced
  // users to /login whenever a network call to validateSession failed on reload.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      // Retry IDB reads a few times — IndexedDB may not be open yet on first load
      let stored: { token: string; user: AppUser } | null = null;

      for (let attempt = 0; attempt < IDB_RETRY_COUNT && !cancelled; attempt++) {
        try {
          stored = await getStoredSession();
        } catch {
          stored = null;
        }
        if (stored) break;
        if (attempt < IDB_RETRY_COUNT - 1) {
          await new Promise((r) => setTimeout(r, IDB_RETRY_DELAY_MS));
        }
      }

      if (!mountedRef.current || cancelled) return;

      if (!stored) {
        setLoading(false);
        setHasCheckedAuth(true);
        return;
      }

      // Check local expiry before trusting
      let locallyExpired: boolean;
      try {
        locallyExpired = await isSessionLocallyExpired();
      } catch {
        locallyExpired = false;
      }
      if (!mountedRef.current || cancelled) return;

      if (locallyExpired) {
        setSessionToken(null);
        await clearSession();
        setLoading(false);
        setHasCheckedAuth(true);
        return;
      }

      // TRUST-FIRST: Restore session immediately — show the app without waiting
      setSessionToken(stored.token);
      setToken(stored.token);
      setUser(stored.user);

      setLoading(false);
      setHasCheckedAuth(true);
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Background session validation — runs whenever a token is present ──────
  //
  // This effect kicks in after the initial session is restored. It validates
  // the session against the server in the background (non-blocking) and:
  //  - If valid: updates user data, loads stores, refreshes session if near expiry
  //  - If network error: keeps the local session alive, retries sooner
  //  - If invalid (expired/revoked): clears session and redirects to login
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Seed: load stores for the restored user
    const initialUser = user;

    async function tick(currentToken: string, currentUser: AppUser | null) {
      if (!isMounted || !mountedRef.current) return;

      const result = await backgroundValidateAndRefresh(currentToken);

      if (!isMounted || !mountedRef.current) return;

      if (result.needsRemoval) {
        setSessionToken(null);
        setUser(null);
        setToken(null);
        setUserStores([]);
        setActiveStoreState(null);
        await clearSession();
        if (isMounted) {
          window.location.href = "/login";
        }
        return;
      }

      if (result.user) {
        setIsOffline(false);
        const freshUser = result.user;
        setUser(freshUser);
        await storeSession(currentToken, freshUser);

        if (!isMounted || !mountedRef.current) return;

        const stores = await loadUserStores(freshUser.id, freshUser);
        if (!isMounted || !mountedRef.current) return;

        if (freshUser.active_store_id) {
          const active = stores.find((s) => s.id === freshUser.active_store_id) ?? null;
          setActiveStoreState(active);
        } else if (stores.length > 0 && !activeStore) {
          setActiveStoreState(stores[0]);
        }

        timeoutId = setTimeout(
          () => tick(currentToken, freshUser),
          BACKGROUND_VALIDATE_INTERVAL_MS,
        );
        return;
      }

      // Network error — keep session alive, do NOT mark global offline
      // on first transient failure. Retries occur naturally via tick().
      // Only set offline after sustained failure (handled elsewhere if needed).
      // setIsOffline(true); <-- REMOVED to prevent breaking all routes
      timeoutId = setTimeout(() => tick(currentToken, currentUser), NETWORK_RETRY_INTERVAL_MS);
    }

    tick(token, initialUser);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [token, user, loadUserStores, activeStore]);

  // Network status monitoring
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const setActiveStore = useCallback(
    async (store: Store | null) => {
      setActiveStoreState(store);
      if (user) {
        const { error } = await supabase
          .from("app_users")
          .update({ active_store_id: store?.id ?? null })
          .eq("id", user.id);

        if (error) {
          console.error("Fel vid uppdatering av aktiv butik:", error.message);
        }
      }
    },
    [user],
  );

  // Absolute session timeout: check every 60s whether the local limit has passed
  useEffect(() => {
    const CHECK_INTERVAL_MS = 60_000;
    const id = setInterval(async () => {
      const currentToken = tokenRef.current;
      if (!currentToken) return;
      const expiresAt = await secureGetSessionExpiresAt();
      if (expiresAt !== null && Date.now() >= expiresAt) {
        await supabase.from("app_sessions").delete().eq("token", currentToken);
        setSessionToken(null);
        setUser(null);
        setToken(null);
        setUserStores([]);
        setActiveStoreState(null);
        await clearSession();
        window.location.href = "/login";
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  // Warn 5 minutes before absolute expiry, and attempt proactive refresh
  useEffect(() => {
    let warnId: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      if (!token) return;
      const expiresAt = await secureGetSessionExpiresAt();
      if (!expiresAt) return;
      const warnAt = expiresAt - 5 * 60 * 1000;
      const delay = warnAt - Date.now();
      if (delay > 0) {
        warnId = setTimeout(() => {
          window.dispatchEvent(new CustomEvent("session-expiring-soon"));
          // Attempt proactive refresh
          if (tokenRef.current) {
            refreshSession(tokenRef.current)
              .then((ok) => {
                if (ok) setIsOffline(false);
              })
              .catch(() => {});
          }
        }, delay);
      }
    })();

    return () => {
      if (warnId) clearTimeout(warnId);
    };
  }, [token]);

  const login = useCallback(
    async (username: string, password: string, pin?: string) => {
      const result = await doLogin(username, password, pin);
      if ("error" in result) return { error: result.error };

      setSessionToken(result.token);
      setUser(result.user);
      setToken(result.token);
      await storeSession(result.token, result.user);

      const stores = await loadUserStores(result.user.id, result.user);
      if (result.user.active_store_id) {
        const active = stores.find((s) => s.id === result.user.active_store_id) ?? null;
        setActiveStoreState(active);
      } else if (stores.length > 0) {
        setActiveStoreState(stores[0]);
      }

      const isFirst = result.user.last_login === null;
      if (result.user.must_change_password || isFirst) {
        setIsFirstLogin(isFirst);
        const userWithFlag = { ...result.user, must_change_password: true };
        setUser(userWithFlag);
        await storeSession(result.token, userWithFlag);
        return { mustChangePassword: true };
      }

      setIsFirstLogin(false);
      setIsOffline(false);
      return {};
    },
    [loadUserStores],
  );

  const logout = useCallback(async () => {
    if (token) {
      await doLogout(token);
      setSessionToken(null);
      setUser(null);
      setToken(null);
      setUserStores([]);
      setActiveStoreState(null);
      await clearSession();
    }
  }, [token]);

  const refreshUser = useCallback(
    (updated: AppUser) => {
      setUser(updated);
      if (token) storeSession(token, updated);
    },
    [token],
  );

  const openLockScreen = useCallback(() => setLockScreenOpen(true), []);
  const closeLockScreen = useCallback(() => setLockScreenOpen(false), []);
  const triggerFirstTimeSetup = useCallback(() => setShowFirstTimeSetup(true), []);
  const dismissFirstTimeSetup = useCallback(() => setShowFirstTimeSetup(false), []);

  const quickSwitch = useCallback(
    async (newUser: AppUser, newToken: string) => {
      if (token) {
        supabase
          .from("app_sessions")
          .delete()
          .eq("token", token)
          .then(() => {});
      }
      setSessionToken(newToken);
      setUser(newUser);
      setToken(newToken);
      await storeSession(newToken, newUser);

      const stores = await loadUserStores(newUser.id, newUser);
      if (newUser.active_store_id) {
        const active = stores.find((s) => s.id === newUser.active_store_id) ?? null;
        setActiveStoreState(active);
      } else if (stores.length > 0) {
        setActiveStoreState(stores[0]);
      }
      setLockScreenOpen(false);
      setIsOffline(false);
    },
    [token, loadUserStores],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        hasCheckedAuth,
        userStores,
        activeStore,
        setActiveStore,
        effectiveStore,
        isFirstLogin,
        showFirstTimeSetup,
        triggerFirstTimeSetup,
        dismissFirstTimeSetup,
        login,
        logout,
        refreshUser,
        refreshUserStores,
        lockScreenOpen,
        openLockScreen,
        closeLockScreen,
        quickSwitch,
        isOffline,
        isClient,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
