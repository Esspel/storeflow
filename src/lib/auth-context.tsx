import React, { createContext, useContext, useEffect, useState } from "react";
import { type AppUser, type Store, supabase } from "./supabase";
import { getStoredSession, storeSession, clearSession, login as doLogin, logout as doLogout, validateSession } from "./auth";

type AuthContextType = {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  // Stores the user is assigned to
  userStores: Store[];
  // The currently active store (for filtering)
  activeStore: Store | null;
  setActiveStore: (store: Store | null) => void;
  login: (username: string, password: string) => Promise<{ error?: string; mustChangePassword?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: (user: AppUser) => void;
  refreshUserStores: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userStores, setUserStores] = useState<Store[]>([]);
  const [activeStore, setActiveStoreState] = useState<Store | null>(null);

  const loadUserStores = async (userId: string, currentUser: AppUser) => {
    if (currentUser.role === "admin") {
      // Admins see all stores
      const { data } = await supabase.from("stores").select("*").order("name");
      const stores = (data ?? []) as Store[];
      setUserStores(stores);
      return stores;
    }
    const { data } = await supabase
      .from("user_stores")
      .select("store:stores(*)")
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
    const stored = getStoredSession();
    if (!stored) {
      setLoading(false);
      return;
    }
    validateSession(stored.token).then(async (validUser) => {
      if (validUser) {
        setUser(validUser);
        setToken(stored.token);
        const stores = await loadUserStores(validUser.id, validUser);
        // Restore active store
        if (validUser.active_store_id) {
          const active = stores.find((s) => s.id === validUser.active_store_id) ?? null;
          setActiveStoreState(active);
        } else if (stores.length > 0) {
          setActiveStoreState(stores[0]);
        }
      } else {
        clearSession();
      }
      setLoading(false);
    });
  }, []);

  const login = async (username: string, password: string) => {
    const result = await doLogin(username, password);
    if ("error" in result) return { error: result.error };
    setUser(result.user);
    setToken(result.token);
    storeSession(result.token, result.user);
    const stores = await loadUserStores(result.user.id, result.user);
    if (result.user.active_store_id) {
      const active = stores.find((s) => s.id === result.user.active_store_id) ?? null;
      setActiveStoreState(active);
    } else if (stores.length > 0) {
      setActiveStoreState(stores[0]);
    }
    if (result.user.must_change_password) return { mustChangePassword: true };
    return {};
  };

  const logout = async () => {
    if (token) await doLogout(token);
    setUser(null);
    setToken(null);
    setUserStores([]);
    setActiveStoreState(null);
    clearSession();
  };

  const refreshUser = (updated: AppUser) => {
    setUser(updated);
    if (token) storeSession(token, updated);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, userStores, activeStore, setActiveStore, login, logout, refreshUser, refreshUserStores }}
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
