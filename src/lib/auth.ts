import { supabase, setSessionToken, type AppUser } from "./supabase";

const SESSION_KEY = "sf_session_token";
const USER_KEY = "sf_user";

export function getStoredSession(): { token: string; user: AppUser } | null {
  try {
    const token = localStorage.getItem(SESSION_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    if (!token || !userStr) return null;
    return { token, user: JSON.parse(userStr) };
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AppUser) {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(
  username: string,
  password: string,
): Promise<{ user: AppUser; token: string } | { error: string }> {
  const { data: user, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("username", username)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !user) {
    return { error: "Ogiltigt användarnamn eller lösenord." };
  }

  const { data: verified } = await supabase.rpc("verify_password", {
    plain_password: password,
    hashed_password: user.password_hash,
  });

  if (!verified) {
    return { error: "Ogiltigt användarnamn eller lösenord." };
  }

  const token = crypto.randomUUID() + "-" + Date.now();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("app_sessions").insert({
    user_id: user.id,
    token,
    expires_at: expiresAt,
  });

  // Set the token so subsequent requests pass it for RLS validation
  setSessionToken(token);

  await supabase
    .from("app_users")
    .update({ last_login: new Date().toISOString() })
    .eq("id", user.id);

  const appUser: AppUser = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    store_id: user.store_id,
    active_store_id: user.active_store_id ?? null,
    is_active: user.is_active,
    last_login: user.last_login,
    created_at: user.created_at,
  };

  return { user: appUser, token };
}

export async function logout(token: string) {
  await supabase.from("app_sessions").delete().eq("token", token);
  setSessionToken(null);
  clearSession();
}

export async function validateSession(token: string): Promise<AppUser | null> {
  // Set token early so RLS policies can validate the caller for any writes
  setSessionToken(token);

  const { data: session } = await supabase
    .from("app_sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!session) { setSessionToken(null); return null; }
  if (new Date(session.expires_at) < new Date()) {
    await supabase.from("app_sessions").delete().eq("token", token);
    setSessionToken(null);
    return null;
  }

  const { data: user } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", session.user_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    store_id: user.store_id,
    active_store_id: user.active_store_id ?? null,
    is_active: user.is_active,
    last_login: user.last_login,
    created_at: user.created_at,
  };
}
