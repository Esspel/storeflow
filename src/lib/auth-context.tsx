import React, { createContext, useContext, useEffect, useState } from "react";
import { type AppUser, type Store, supabase, setSessionToken } from "./supabase";
import { getStoredSession, storeSession, clearSession, login as doLogin, logout as doLogout, validateSession } from "./auth";

type AuthContextType = {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  userStores: Store[];
  activeStore: Store | null;
  setActiveStore: (store: Store | null) => void;
  // Global context store — for HQ/Forening/Distrikt users browsing another store's data
  globalContextStore: Store | null;
  setGlobalContextStore: (store: Store | null) => void;
  // Effective store: globalContextStore if set, otherwise activeStore
  effectiveStore: Store | null;
  login: (username: string, password: string) => Promise<{ error?: string; mustChangePassword?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: (user: AppUser) => void;
  refreshUserStores: () => Promise<void>;
  // Lock screen / quick user switch
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
  const [globalContextStore, setGlobalContextStoreState] = useState<Store | null>(() => {
    try {
      const raw = localStorage.getItem("sf-global-context-store");
      return raw ? (JSON.parse(raw) as Store) : null;
    } catch { return null; }
  });
  const [lockScreenOpen, setLockScreenOpen] = useState(false);

  const effectiveStore = globalContextStore ?? activeStore;

  const setGlobalContextStore = (store: Store | null) => {
    setGlobalContextStoreState(store);
    try {
      if (store) localStorage.setItem("sf-global-context-store", JSON.stringify(store));
      else localStorage.removeItem("sf-global-context-store");
    } catch {}
  };

  const loadUserStores = async (userId: string, currentUser: AppUser) => {
    const hierarchyLevel = currentUser.hierarchy_level;
    const isAboveStore = currentUser.role === "admin" || hierarchyLevel === "hk" || hierarchyLevel === "forening" || hierarchyLevel === "distrikt";
    if (isAboveStore) {
      // HQ/Admin/Forening/Distrikt users see stores scoped to their hierarchy
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
      // Set token on the Supabase client BEFORE any queries so RLS functions
      // that read x-session-token work correctly during validation
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

  const login = async (username: string, password: string) => {
    const result = await doLogin(username, password);
    if ("error" in result) return { error: result.error };
    // Set token on the Supabase client immediately so all subsequent queries
    // include x-session-token and RLS policies resolve correctly
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
      // Ensure user state reflects the forced change so root layout doesn't redirect away
      const userWithFlag = { ...result.user, must_change_password: true };
      setUser(userWithFlag);
      await storeSession(result.token, userWithFlag);
      return { mustChangePassword: true };
    }
    return {};
  };

  const logout = async () => {
    if (token) await doLogout(token);
    setSessionToken(null);
    setUser(null);
    setToken(null);
    setUserStores([]);
    setActiveStoreState(null);
    setGlobalContextStoreState(null);
    try { localStorage.removeItem("sf-global-context-store"); } catch {}
    await clearSession();
  };

  const refreshUser = (updated: AppUser) => {
    setUser(updated);
    if (token) storeSession(token, updated);
  };

  const openLockScreen = () => setLockScreenOpen(true);
  const closeLockScreen = () => setLockScreenOpen(false);

  const quickSwitch = async (newUser: AppUser, newToken: string) => {
    // Expire old session silently (best-effort)
    if (token) {
      supabase.from("app_sessions").delete().eq("token", token).then(() => {});
    }
    setSessionToken(newToken);
    setUser(newUser);
    setToken(newToken);
    await storeSession(newToken, newUser);
    // Load stores for new user
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
      value={{ user, token, loading, userStores, activeStore, setActiveStore, globalContextStore, setGlobalContextStore, effectiveStore, login, logout, refreshUser, refreshUserStores, lockScreenOpen, openLockScreen, closeLockScreen, quickSwitch }}
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
