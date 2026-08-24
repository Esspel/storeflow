import { supabase, setSessionToken, type AppUser } from "./supabase";
import { secureGetSession, secureSetSession, secureClearSession } from "./secure-storage";

const SECURE_LOGIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secure-login`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type LoginResponse =
  { user: AppUser; token: string; mustChangePassword?: boolean } | { error: string };

export async function getStoredSession(): Promise<{ token: string; user: AppUser } | null> {
  return secureGetSession<AppUser>();
}

export async function storeSession(token: string, user: AppUser): Promise<void> {
  await secureSetSession(token, user);
}

export async function clearSession(): Promise<void> {
  await secureClearSession();
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  try {
    const res = await fetch(SECURE_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ username, password }),
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

export async function validateSession(token: string): Promise<AppUser | null> {
  // Sätt token tidigt så RLS-policyer kan utvärdera anroparen
  setSessionToken(token);

  const { data: session, error: sessionErr } = await supabase
    .from("app_sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (sessionErr || !session) {
    setSessionToken(null);
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase.from("app_sessions").delete().eq("token", token);
    setSessionToken(null);
    return null;
  }

  const { data: user, error: userErr } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", session.user_id)
    .eq("is_active", true)
    .maybeSingle();

  if (userErr || !user) {
    setSessionToken(null);
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    role_manually_set: user.role_manually_set ?? false,
    employee_group: user.employee_group ?? "",
    store_id: user.store_id,
    active_store_id: user.active_store_id ?? null,
    is_active: user.is_active,
    must_change_password: user.must_change_password ?? false,
    last_login: user.last_login,
    created_at: user.created_at,
    hierarchy_level: user.hierarchy_level ?? undefined,
    forening_id: user.forening_id ?? null,
    distrikt_id: user.distrikt_id ?? null,
  };
}
