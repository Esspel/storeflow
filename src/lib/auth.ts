import { supabase, setSessionToken, type AppUser } from "./supabase";
import {
  secureGetSession,
  secureSetSession,
  secureClearSession,
  secureGetSessionExpiresAt,
  secureSetSessionExpiry,
} from "./secure-storage";

const SECURE_LOGIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secure-login`;
const REFRESH_SESSION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-session`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// How long before the server-side TTL we proactively refresh (5 minutes early)
const REFRESH_SAFETY_MARGIN_MS = 5 * 60 * 1000;

export type LoginResponse =
  { user: AppUser; token: string; mustChangePassword?: boolean } | { error: string };

export type ValidationResult =
  | { valid: true; user: AppUser }
  | { valid: false; reason: "network" }
  | { valid: false; reason: "invalid" };

export async function getStoredSession(): Promise<{ token: string; user: AppUser } | null> {
  return secureGetSession<AppUser>();
}

export async function storeSession(token: string, user: AppUser): Promise<void> {
  await secureSetSession(token, user);
}

export async function clearSession(): Promise<void> {
  await secureClearSession();
}

export async function login(
  username: string,
  password: string,
  pin?: string,
): Promise<LoginResponse> {
  try {
    const res = await fetch(SECURE_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(pin ? { username, pin } : { username, password }),
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      return { error: "Mottog ett ogiltigt svar från servern." };
    }

    if (!res.ok || data.error) {
      return { error: data.error ?? "Ogiltigt användarnamn eller lösenord." };
    }

    setSessionToken(data.token);
    return {
      user: data.user as AppUser,
      token: data.token as string,
      mustChangePassword: data.user?.must_change_password ?? false,
    };
  } catch (err) {
    console.error("Login request error:", err);
    return { error: "Kan inte ansluta till servern. Kontrollera din internetanslutning." };
  }
}

export async function logout(token: string): Promise<void> {
  try {
    await supabase.from("app_sessions").delete().eq("token", token);
  } catch (err) {
    console.error("Failed to delete session on logout:", err);
  } finally {
    setSessionToken(null);
    await clearSession();
  }
}

function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = String(err);
  return (
    /failed to fetch|network|timeout|offline|TypeError/i.test(msg) ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  );
}

function appUserFromDb(user: Record<string, unknown>): AppUser {
  return {
    id: user.id as string,
    username: user.username as string,
    display_name: user.display_name as string,
    role: (user.role as AppUser["role"]) ?? "employee",
    role_manually_set: (user.role_manually_set as boolean) ?? false,
    employee_group: (user.employee_group as string) ?? "",
    store_id: user.store_id as string | null,
    active_store_id: (user.active_store_id as string | null) ?? null,
    is_active: user.is_active as boolean,
    must_change_password: (user.must_change_password as boolean) ?? false,
    last_login: user.last_login as string | null,
    created_at: user.created_at as string,
    hierarchy_level: user.hierarchy_level as AppUser["hierarchy_level"] | undefined,
    forening_id: (user.forening_id as string | null) ?? null,
    distrikt_id: (user.distrikt_id as string | null) ?? null,
  };
}

// ─── Trust-first session validation ──────────────────────────────────────────
//
// This function validates the session token against the server WITHOUT
// modifying any global state. The caller decides how to react:
//  - valid: true   → caller updates user data
//  - reason: network → caller keeps the local session and retries later
//  - reason: invalid → caller clears the session and redirects to login
//
// Unlike the old implementation, this NEVER calls setSessionToken(null) on
// failure, so RLS continues to work for the duration of the current session
// even if the network is down.
export async function validateSession(token: string): Promise<ValidationResult> {
  let sessionErr: unknown = null;

  try {
    const { data: session, error } = await supabase
      .from("app_sessions")
      .select("user_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      sessionErr = error;
    } else if (!session) {
      // No error but no session → definitively invalid
      return { valid: false, reason: "invalid" };
    } else if (session && new Date(session.expires_at) < new Date()) {
      // Session exists but is expired → definitively invalid (clean up)
      await supabase.from("app_sessions").delete().eq("token", token);
      return { valid: false, reason: "invalid" };
    } else if (session) {
      const { data: user, error: userErr } = await supabase
        .from("app_users")
        .select("*")
        .eq("id", session.user_id)
        .eq("is_active", true)
        .maybeSingle();

      if (userErr) {
        // If the user fetch failed due to network, treat as network error
        if (isNetworkError(userErr)) {
          return { valid: false, reason: "network" };
        }
        return { valid: false, reason: "invalid" };
      }

      if (!user) {
        return { valid: false, reason: "invalid" };
      }

      return { valid: true, user: appUserFromDb(user) };
    }
  } catch (err) {
    sessionErr = err;
  }

  // Any exception or session error → network failure (keep session alive)
  if (isNetworkError(sessionErr)) {
    return { valid: false, reason: "network" };
  }
  return { valid: false, reason: "invalid" };
}

// ─── Local expiry check ──────────────────────────────────────────────────────
// Checks the locally-stored session expiry WITHOUT a network call.
// Returns true if the session has expired locally.
export async function isSessionLocallyExpired(): Promise<boolean> {
  const stored = await getStoredSession();
  if (!stored) return true;

  // Fast path: use stored expiry timestamp
  const expiresAt = await secureGetSessionExpiresAt();
  if (expiresAt !== null) {
    return Date.now() >= expiresAt;
  }

  // Fallback: if we can't read the expiry, treat as expired (safe default)
  return true;
}

// ─── Session refresh (sliding expiration) ────────────────────────────────────
// Calls the refresh-session edge function to extend the session TTL.
// Returns the new expiry time, or null if the session could not be refreshed.
export async function refreshSession(token: string): Promise<string | null> {
  try {
    const res = await fetch(REFRESH_SESSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        "x-session-token": token,
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json().catch(() => null);
    if (!data?.ok) {
      return null;
    }

    // Update the local expiry to match the server's new expiry
    const newExpiresAt = data.expires_at;
    if (newExpiresAt) {
      const newExpiry = new Date(newExpiresAt).getTime();
      await secureSetSessionExpiry(newExpiry);
    }

    return newExpiresAt ?? null;
  } catch (err) {
    if (!isNetworkError(err)) {
      console.error("Non-network error during session refresh:", err);
    }
    return null;
  }
}

// ─── Background revalidation ────────────────────────────────────────────────
// Validates the session and, if valid, refreshes it before the TTL expires.
// Returns whether the session is still considered valid locally.
export async function backgroundValidateAndRefresh(token: string): Promise<{
  user: AppUser | null;
  refreshed: boolean;
  needsRemoval: boolean;
}> {
  const result = await validateSession(token);

  if (result.valid) {
    // Session is valid — try to refresh if close to expiry
    const expiresAt = await secureGetSessionExpiresAt();
    const shouldRefresh = expiresAt !== null && Date.now() + REFRESH_SAFETY_MARGIN_MS >= expiresAt;

    if (shouldRefresh) {
      const newExpiry = await refreshSession(token);
      if (newExpiry) {
        return { user: result.user, refreshed: true, needsRemoval: false };
      }
    }

    return { user: result.user, refreshed: false, needsRemoval: false };
  }

  if (result.reason === "network") {
    // Network error — keep the session alive locally, retry later
    return { user: null, refreshed: false, needsRemoval: false };
  }

  // Session is definitively invalid (expired, revoked, or user deactivated)
  return { user: null, refreshed: false, needsRemoval: true };
}
