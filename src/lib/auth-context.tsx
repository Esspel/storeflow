import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { AppUser, Store } from "./supabase";
import { supabase, getSessionToken, getCurrentUser, setCurrentUser, clearSessionToken } from "./supabase";
import { validateSession } from "./auth";

interface AuthContextValue {
  user: AppUser | null;
  activeStore: Store | null;
  stores: Store[];
  isLoading: boolean;
  isAuthenticated: boolean;
  setActiveStore: (store: Store) => void;
  refreshUser: () => Promise<void>;
  loginUser: (user: AppUser) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => getCurrentUser());
  const [activeStore, setActiveStoreState] = useState<Store | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!getSessionToken();
  });

  const loadStores = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_stores")
      .select("store_id, stores(*)")
      .eq("user_id", userId);
    if (data) {
      const storeList = data.map((r: { stores: Store }) => r.stores).filter(Boolean) as Store[];
      setStores(storeList);
      if (storeList.length > 0) {
        setActiveStoreState((prev) => prev ?? storeList[0]);
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const u = await validateSession(token);
      if (u) {
        setUser(u);
        setCurrentUser(u);
        await loadStores(u.id);
      } else {
        clearSessionToken();
        setUser(null);
      }
    } catch {
      clearSessionToken();
      setUser(null);
    }
    setIsLoading(false);
  }, [loadStores]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    refreshUser();
  }, [refreshUser]);

  const loginUser = useCallback(async (u: AppUser) => {
    setUser(u);
    setCurrentUser(u);
    await loadStores(u.id);
  }, [loadStores]);

  const setActiveStore = useCallback((store: Store) => {
    setActiveStoreState(store);
  }, []);

  const logout = useCallback(() => {
    clearSessionToken();
    setUser(null);
    setActiveStoreState(null);
    setStores([]);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      activeStore,
      stores,
      isLoading,
      isAuthenticated: !!user,
      setActiveStore,
      refreshUser,
      loginUser,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === "admin";
}

export function useIsManager(): boolean {
  const { user } = useAuth();
  return user?.role === "manager" || user?.role === "admin";
}

export function useActiveStoreId(): string | null {
  const { activeStore } = useAuth();
  return activeStore?.id ?? null;
}
