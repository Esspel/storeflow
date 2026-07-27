import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ApiKeyContext = {
  keyId: string;
  storeId: string | null; // null = access to all stores
  scopes: string[];
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Validates the `Authorization: Bearer sf_live_...` header against api_keys.
// Returns the key's scope/store context, or null if missing/invalid/revoked.
export async function authenticate(req: Request, admin: SupabaseClient): Promise<ApiKeyContext | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const rawKey = match[1].trim();
  if (!rawKey) return null;

  const hash = await sha256Hex(rawKey);
  const { data: key } = await admin
    .from("api_keys")
    .select("id, store_id, scopes, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!key || key.revoked_at) return null;

  // Fire-and-forget last_used_at update — don't block the request on it
  admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {});

  return { keyId: key.id, storeId: key.store_id, scopes: key.scopes ?? [] };
}

export function hasScope(ctx: ApiKeyContext, scope: string): boolean {
  return ctx.scopes.includes(scope);
}

// Confirms the key is allowed to touch the given store (either unscoped, or matches).
export function canAccessStore(ctx: ApiKeyContext, storeId: string | null | undefined): boolean {
  if (!ctx.storeId) return true; // unscoped key = all stores
  return ctx.storeId === storeId;
}

export function serviceRoleClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
