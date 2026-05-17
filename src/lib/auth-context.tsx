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
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => getCurrentUser());
  const [activeStore, setActiveStoreState] = useState<Store | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("active_store");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadStores = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_stores")
      .select("store_id, stores(*)")
      .eq("user_id", userId);
    if (data) {
      const storeList = data.map((r: { stores: Store }) => r.stores).filter(Boolean) as Store[];
      setStores(storeList);
      if (!activeStore && storeList.length > 0) {
        setActiveStoreState(storeList[0]);
        localStorage.setItem("active_store", JSON.stringify(storeList[0]));
      }
    }
  }, [activeStore]);

  const refreshUser = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    const u = await validateSession(token);
    if (u) {
      setUser(u);
      await loadStores(u.id);
    } else {
      clearSessionToken();
      setUser(null);
    }
    setIsLoading(false);
  }, [loadStores]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const setActiveStore = useCallback((store: Store) => {
    setActiveStoreState(store);
    localStorage.setItem("active_store", JSON.stringify(store));
  }, []);

  const logout = useCallback(() => {
    clearSessionToken();
    setUser(null);
    setActiveStoreState(null);
    setStores([]);
    localStorage.removeItem("active_store");
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
