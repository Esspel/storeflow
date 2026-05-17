import { supabase, type AppUser, setSessionToken, setCurrentUser, clearSessionToken, getSessionToken } from "./supabase";

const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface LoginResult {
  user: AppUser;
  token: string;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${EDGE_FN_URL}/secure-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Inloggning misslyckades");
  }

  const { user, token } = data as LoginResult;
  setSessionToken(token);
  setCurrentUser(user);
  return { user, token };
}

export async function logout() {
  const token = getSessionToken();
  if (token) {
    await supabase
      .from("app_sessions")
      .delete()
      .eq("token", token)
      .then(() => {});
  }
  clearSessionToken();
}

export async function validateSession(token: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from("app_sessions")
    .select("user_id, expires_at, app_users(id, username, display_name, role, hierarchy_level, role_manually_set, employee_group, store_id, active_store_id, forening_id, distrikt_id, is_active, must_change_password, last_login, created_at)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  const u = (data as { app_users: AppUser | null }).app_users;
  if (!u) return null;

  setCurrentUser(u);
  return u;
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const { data: hashed, error: hashErr } = await supabase.rpc("hash_password", {
    plain_password: newPassword,
  });

  if (hashErr || !hashed) throw new Error("Kunde inte hasha lösenord");

  const { error } = await supabase
    .from("app_users")
    .update({ password_hash: hashed, must_change_password: false })
    .eq("id", userId);

  if (error) throw error;
}
