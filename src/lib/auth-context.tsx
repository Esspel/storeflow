import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { type AppUser, type Store, supabase, setSessionToken } from "./supabase";
import { getStoredSession, storeSession, clearSession, login as doLogin, logout as doLogout, validateSession } from "./auth";
import { secureGetSessionExpiresAt, SESSION_LIFETIME_MS } from "./secure-storage";

type AuthContextType = {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  userStores: Store[];
  activeStore: Store | null;
  setActiveStore: (store: Store | null) => void;
  effectiveStore: Store | null;
  isFirstLogin: boolean;
  showFirstTimeSetup: boolean;
  triggerFirstTimeSetup: () => void;
  dismissFirstTimeSetup: () => void;
  login: (username: string, password: string) => Promise<{ error?: string; mustChangePassword?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: (user: AppUser) => void;
  refreshUserStores: () => Promise<void>;
  lockScreenOpen: boolean;
  openLockScreen: () => void;
  closeLockScreen: () => void;
  quickSwitch: (newUser: AppUser, newToken: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userStores, setUserStores] = useState<Store[]>([]);
  const [activeStore, setActiveStoreState] = useState<Store | null>(null);
  const [lockScreenOpen, setLockScreenOpen] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);

  // Keep a ref so the timeout interval can access the latest token without stale closures
  const tokenRef = useRef<string | null>(null);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // effectiveStore is always activeStore — kept for API compat
  const effectiveStore = activeStore;

  const loadUserStores = async (userId: string, currentUser: AppUser) => {
    const hierarchyLevel = currentUser.hierarchy_level;
    const isAboveStore = currentUser.role === "admin" || hierarchyLevel === "hk" || hierarchyLevel === "forening" || hierarchyLevel === "distrikt";
    if (isAboveStore) {
      let query = supabase.from("stores").select("*, forening:foreningar(*), distrikt:distrikt(*)").order("name");
      if (hierarchyLevel === "forening" && currentUser.forening_id) {
        query = supabase.from("stores").select("*, forening:foreningar(*), distrikt:distrikt(*)").eq("forening_id", currentUser.forening_id).order("name");
      } else if (hierarchyLevel === "distrikt" && currentUser.distrikt_id) {
        query = supabase.from("stores").select("*, forening:foreningar(*), distrikt:distrikt(*)").eq("distrikt_id", currentUser.distrikt_id).order("name");
      }
      const { data } = await query;
      const stores = (data ?? []) as Store[];
      setUserStores(stores);
      return stores;
    }
    const { data } = await supabase
      .from("user_stores")
      .select("store:stores(*, forening:foreningar(*), distrikt:distrikt(*))")
      .eq("user_id", userId);
    const stores = ((data ?? []).map((r: { store: unknown }) => r.store).filter(Boolean)) as Store[];
    setUserStores(stores);
    return stores;
  };

  const setActiveStore = async (store: Store | null) => {
    setActiveStoreState(store);
    if (user) {
      await supabase
        .from("app_users")
        .update({ active_store_id: store?.id ?? null })
        .eq("id", user.id);
    }
  };

  const refreshUserStores = async () => {
    if (!user) return;
    await loadUserStores(user.id, user);
  };

  useEffect(() => {
    (async () => {
      const stored = await getStoredSession();
      if (!stored) {
        setLoading(false);
        return;
      }
      setSessionToken(stored.token);
      const validUser = await validateSession(stored.token);
      if (validUser) {
        setUser(validUser);
        setToken(stored.token);
        const stores = await loadUserStores(validUser.id, validUser);
        if (validUser.active_store_id) {
          const active = stores.find((s) => s.id === validUser.active_store_id) ?? null;
          setActiveStoreState(active);
        } else if (stores.length > 0) {
          setActiveStoreState(stores[0]);
        }
      } else {
        setSessionToken(null);
        await clearSession();
      }
      setLoading(false);
    })();
  }, []);

  // Absolute session timeout: check every 60 s whether the 12-hour wall-clock limit has passed.
  // If it has, wipe local session and force a full page reload to the login screen.
  useEffect(() => {
    const CHECK_INTERVAL_MS = 60_000;
    const id = setInterval(async () => {
      if (!tokenRef.current) return;
      const expiresAt = await secureGetSessionExpiresAt();
      if (expiresAt !== null && Date.now() >= expiresAt) {
        if (tokenRef.current) {
          await supabase.from("app_sessions").delete().eq("token", tokenRef.current);
        }
        setSessionToken(null);
        setUser(null);
        setToken(null);
        setUserStores([]);
        setActiveStoreState(null);
        await clearSession();
        // Hard redirect so any in-memory state is also wiped
        window.location.href = "/login";
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Warn 5 minutes before absolute expiry so users can save work
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
          // Dispatch a custom event that any component can listen to
          window.dispatchEvent(new CustomEvent("session-expiring-soon"));
        }, delay);
      }
    })();
    return () => { if (warnId) clearTimeout(warnId); };
  }, [token]);

  const login = async (username: string, password: string) => {
    const result = await doLogin(username, password);
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
    if (result.user.must_change_password || result.user.last_login === null) {
      const firstLogin = result.user.last_login === null;
      setIsFirstLogin(firstLogin);
      const userWithFlag = { ...result.user, must_change_password: true };
      setUser(userWithFlag);
      await storeSession(result.token, userWithFlag);
      return { mustChangePassword: true };
    }
    setIsFirstLogin(false);
    return {};
  };

  const logout = async () => {
    if (token) await doLogout(token);
    setSessionToken(null);
    setUser(null);
    setToken(null);
    setUserStores([]);
    setActiveStoreState(null);
    await clearSession();
  };

  const refreshUser = (updated: AppUser) => {
    setUser(updated);
    if (token) storeSession(token, updated);
  };

  const openLockScreen = () => setLockScreenOpen(true);
  const closeLockScreen = () => setLockScreenOpen(false);
  const triggerFirstTimeSetup = () => setShowFirstTimeSetup(true);
  const dismissFirstTimeSetup = () => setShowFirstTimeSetup(false);

  const quickSwitch = async (newUser: AppUser, newToken: string) => {
    if (token) {
      supabase.from("app_sessions").delete().eq("token", token).then(() => {});
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
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, userStores, activeStore, setActiveStore, effectiveStore, isFirstLogin, showFirstTimeSetup, triggerFirstTimeSetup, dismissFirstTimeSetup, login, logout, refreshUser, refreshUserStores, lockScreenOpen, openLockScreen, closeLockScreen, quickSwitch }}
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
