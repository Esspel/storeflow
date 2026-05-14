import React, { createContext, useContext, useEffect, useState } from "react";
import { type AppUser } from "./supabase";
import { getStoredSession, storeSession, clearSession, login as doLogin, logout as doLogout, validateSession } from "./auth";

type AuthContextType = {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshUser: (user: AppUser) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      setLoading(false);
      return;
    }
    validateSession(stored.token).then((validUser) => {
      if (validUser) {
        setUser(validUser);
        setToken(stored.token);
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
    return {};
  };

  const logout = async () => {
    if (token) await doLogout(token);
    setUser(null);
    setToken(null);
    clearSession();
  };

  const refreshUser = (updated: AppUser) => {
    setUser(updated);
    if (token) storeSession(token, updated);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
