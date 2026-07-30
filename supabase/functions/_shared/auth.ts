import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ApiKeyContext = {
  keyId: string;
  storeId: string | null; // null = tillgång till alla butiker
  scopes: string[];
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validerar Authorization-headern.
 * Stöder både API-nycklar (sf_live_...) och JWT-access tokens.
 */
export async function authenticate(req: Request, admin: SupabaseClient): Promise<ApiKeyContext | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  
  const token = match[1].trim();
  if (!token) return null;

  // Fall 1: API-nyckel (sf_live_...)
  if (token.startsWith("sf_live_")) {
    const hash = await sha256Hex(token);
    const { data: key } = await admin
      .from("api_keys")
      .select("id, store_id, scopes, revoked_at")
      .eq("key_hash", hash)
      .maybeSingle();

    if (!key || key.revoked_at) return null;

    // Fire-and-forget uppdatering av last_used_at
    admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {});

    return { keyId: key.id, storeId: key.store_id, scopes: key.scopes ?? [] };
  }

  // Fall 2: JWT Access Token (från Token Exchange / Supabase Auth)
  const { data: { user }, error } = await admin.auth.getUser(token);
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
