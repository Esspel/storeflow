import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ApiKeyContext = {
  keyId: string;
  storeId: string | null; // null = tillgång till alla butiker
  scopes: string[];
};

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validerar Authorization-headern.
 * Stöder både API-nycklar (sf_live_...) och JWT-access tokens.
 * Avvisar återkallade (revoked_at) och utgångna (expires_at) nycklar.
 */
export async function authenticateRequest(req: Request, admin?: SupabaseClient): Promise<ApiKeyContext | null> {
  const client = admin ?? serviceRoleClient();
  const authHeader = req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  // Fall 1: API-nyckel (sf_live_...)
  if (token.startsWith("sf_live_")) {
    const hash = await sha256Hex(token);
    const { data: key } = await client
      .from("api_keys")
      .select("id, store_id, scopes, revoked_at, expires_at")
      .eq("key_hash", hash)
      .maybeSingle();

    if (!key || key.revoked_at) return null;
    if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) return null;

    // Fire-and-forget uppdatering av last_used_at
    client.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {});

    return { keyId: key.id, storeId: key.store_id, scopes: key.scopes ?? [] };
  }

  // Fall 2: JWT Access Token (från Token Exchange / Supabase Auth)
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;

  // Hämta tillhörande scopes och storeId från user_metadata / app_metadata
  const scopes = user.app_metadata?.scopes ?? user.user_metadata?.scopes ?? [];
  const storeId = user.app_metadata?.store_id ?? user.user_metadata?.store_id ?? null;

  return {
    keyId: user.id,
    storeId,
    scopes,
  };
}

// Bakåtkompatibelt alias — behåll gamla namnet fungerande om något fortfarande importerar det.
export const authenticate = authenticateRequest;

export function hasScope(ctx: ApiKeyContext, scope: string): boolean {
  return ctx.scopes.includes(scope);
}

export function canAccessStore(ctx: ApiKeyContext, storeId: string | null | undefined): boolean {
  if (!ctx.storeId) return true; // obegränsad = alla butiker
  return ctx.storeId === storeId;
}

export function serviceRoleClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// ─── App-session (browser) autentisering ───────────────────────────────────────
//
// Storeflow's own login system doesn't use Supabase Auth JWTs — sessions are
// tracked via a custom x-session-token header, validated against the
// app_sessions table (see app_current_user_id() / migration
// 20260515172512_make_session_functions_security_definer.sql). Edge functions
// that need to know "which logged-in Storeflow user is calling me" (as
// opposed to "which API key/JWT is calling me") use this instead of
// authenticateRequest.

export type AppSessionContext = {
  userId: string;
  role: "admin" | "manager" | "employee";
  storeId: string | null;
  displayName: string;
};

export async function authenticateAppSession(req: Request, admin?: SupabaseClient): Promise<AppSessionContext | null> {
  const token = req.headers.get("x-session-token");
  if (!token) return null;

  const client = admin ?? serviceRoleClient();

  const { data: session } = await client
    .from("app_sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: user } = await client
    .from("app_users")
    .select("id, role, store_id, display_name, is_active")
    .eq("id", session.user_id)
    .maybeSingle();
  if (!user || !user.is_active) return null;

  return {
    userId: user.id,
    role: user.role as AppSessionContext["role"],
    storeId: user.store_id,
    displayName: user.display_name,
  };
}
