// Edge Function: issue-api-key
//
// Mints, lists, revokes, and rotates API keys, or exchanges them for
// short-lived JWTs. Used by storeflow-api and mcp-server, and by the
// "API-nycklar" panel under Inställningar in the app.
//
// Auth (either one):
//   - x-session-token: <session token>   — a logged-in Storeflow admin
//     (used by the browser settings UI). Validated against app_sessions.
//   - x-import-secret: <IMPORT_WEBHOOK_SECRET> — for scripts/automation
//     that don't have a Storeflow login (kept for backwards compatibility).
//
// Actions (body.action): "create" | "list" | "revoke" | "rotate" | "exchange"

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient, sha256Hex, authenticateAppSession } from "../_shared/auth.ts";
import { SignJWT } from "npm:jose@^6.2.5";

const ALL_SCOPES = [
  "templates:read", "templates:write",
  "tasks:read", "tasks:write",
  "customer_requests:read", "customer_requests:write",
  "customer_rounds:read",
  "deviations:read", "deviations:write",
  "stores:read",
  "template_packages:read", "template_packages:write",
  "deliveries:read", "deliveries:write",
  "schedule:read", "schedule:write",
  "products:search",
];

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 40);
  return `sf_live_${b64}`;
}

function isValidExpiresAt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Endast POST stöds." }, 405);

  const supabase = serviceRoleClient();

  // ── Autentisering: admin-session (UI) eller delad hemlighet (automation) ──
  const importSecret = Deno.env.get("IMPORT_WEBHOOK_SECRET");
  const givenSecret = req.headers.get("x-import-secret");
  const secretOk = !!importSecret && !!givenSecret && givenSecret === importSecret;

  let actorId: string | null = null;

  if (!secretOk) {
    const session = await authenticateAppSession(req, supabase);
    if (!session) {
      return json({ error: "Ogiltig autentisering. Logga in som administratör eller ange x-import-secret." }, 401);
    }
    if (session.role !== "admin") {
      return json({ error: "Endast administratörer kan hantera API-nycklar." }, 403);
    }
    actorId = session.userId;
  }

  let body: {
    action?: string; name?: string; store_id?: string | null; scopes?: string[];
    key_id?: string; api_key?: string; expires_at?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ogiltig JSON i request-body." }, 400);
  }

  if (body.action === "list") {
    const { data, error } = await supabase.from("api_keys")
      .select("id, name, key_prefix, store_id, scopes, created_at, last_used_at, revoked_at, expires_at, rotated_from_id")
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, keys: data });
  }

  if (body.action === "revoke") {
    if (!body.key_id) return json({ error: "key_id saknas." }, 400);
    const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", body.key_id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, revoked: body.key_id });
  }

  if (body.action === "create") {
    if (!body.name) return json({ error: "name saknas." }, 400);
    const scopes = (body.scopes && body.scopes.length > 0 ? body.scopes : ALL_SCOPES).filter((s) => ALL_SCOPES.includes(s));
    if (scopes.length === 0) return json({ error: `scopes måste vara en delmängd av: ${ALL_SCOPES.join(", ")}` }, 400);

    let expiresAt: string | null = null;
    if (body.expires_at !== undefined && body.expires_at !== null) {
      if (!isValidExpiresAt(body.expires_at)) return json({ error: "expires_at måste vara ett giltigt framtida datum (ISO 8601)." }, 400);
      expiresAt = body.expires_at;
    }

    const rawKey = generateApiKey();
    const keyHash = await sha256Hex(rawKey);
    const { data: created, error } = await supabase.from("api_keys").insert({
      name: body.name, key_prefix: rawKey.slice(0, 12), key_hash: keyHash,
      store_id: body.store_id ?? null, scopes, created_by: actorId, expires_at: expiresAt,
    }).select("id, key_prefix").single();
    if (error || !created) return json({ error: error?.message ?? "Kunde inte skapa nyckel." }, 500);

    return json({
      success: true,
      api_key: rawKey,
      key_id: created.id,
      key_prefix: created.key_prefix,
      expires_at: expiresAt,
      warning: "Spara nyckeln nu — den visas aldrig igen.",
    });
  }

  if (body.action === "rotate") {
    if (!body.key_id) return json({ error: "key_id saknas." }, 400);

    const { data: oldKey, error: fetchErr } = await supabase.from("api_keys")
      .select("id, name, store_id, scopes, revoked_at, expires_at")
      .eq("id", body.key_id)
      .maybeSingle();
    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!oldKey) return json({ error: "Nyckeln hittades inte." }, 404);
    if (oldKey.revoked_at) return json({ error: "Nyckeln är redan återkallad och kan inte roteras." }, 400);

    let expiresAt = oldKey.expires_at ?? null;
    if (body.expires_at !== undefined) {
      if (body.expires_at === null) {
        expiresAt = null;
      } else {
        if (!isValidExpiresAt(body.expires_at)) return json({ error: "expires_at måste vara ett giltigt framtida datum (ISO 8601)." }, 400);
        expiresAt = body.expires_at;
      }
    }

    const rawKey = generateApiKey();
    const keyHash = await sha256Hex(rawKey);
    const { data: created, error } = await supabase.from("api_keys").insert({
      name: oldKey.name, key_prefix: rawKey.slice(0, 12), key_hash: keyHash,
      store_id: oldKey.store_id, scopes: oldKey.scopes, created_by: actorId,
      expires_at: expiresAt, rotated_from_id: oldKey.id,
    }).select("id, key_prefix").single();
    if (error || !created) return json({ error: error?.message ?? "Kunde inte rotera nyckel." }, 500);

    const { error: revokeErr } = await supabase.from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", oldKey.id);
    if (revokeErr) {
      // Nya nyckeln skapades men den gamla kunde inte återkallas — flagga tydligt, inte tyst fel.
      return json({
        error: `Ny nyckel skapades (id ${created.id}) men den gamla kunde inte återkallas: ${revokeErr.message}. Återkalla den manuellt.`,
      }, 500);
    }

    return json({
      success: true,
      api_key: rawKey,
      key_id: created.id,
      key_prefix: created.key_prefix,
      expires_at: expiresAt,
      rotated_from_id: oldKey.id,
      warning: "Spara nyckeln nu — den visas aldrig igen. Den gamla nyckeln är återkallad.",
    });
  }

  if (body.action === "exchange") {
    if (!body.api_key) return json({ error: "api_key saknas." }, 400);

    const keyHash = await sha256Hex(body.api_key);
    const { data: keyRecord, error } = await supabase
      .from("api_keys")
      .select("id, store_id, scopes, revoked_at, expires_at")
      .eq("key_hash", keyHash)
      .single();

    if (error || !keyRecord || keyRecord.revoked_at) {
      return json({ error: "Ogiltig eller återkallad API-nyckel." }, 401);
    }
    if (keyRecord.expires_at && new Date(keyRecord.expires_at).getTime() < Date.now()) {
      return json({ error: "API-nyckeln har gått ut." }, 401);
    }

    // Uppdatera last_used_at i bakgrunden utan att blockera
    await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id);

    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) {
      return json({ error: "JWT_SECRET är inte konfigurerad på servern." }, 500);
    }

    const secretKey = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({
      store_id: keyRecord.store_id,
      scopes: keyRecord.scopes,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(keyRecord.id)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secretKey);

    return json({
      success: true,
      access_token: token,
      token_type: "Bearer",
      expires_in: 900,
    });
  }

  return json({ error: "Okänd action. Använd 'create', 'list', 'revoke', 'rotate' eller 'exchange'." }, 400);
});
