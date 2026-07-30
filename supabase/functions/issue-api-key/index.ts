// Edge Function: issue-api-key
//
// Mints, lists, revokes API keys, or exchanges them for short-lived JWTs.
// Used by storeflow-api and mcp-server.
// Gated by the same IMPORT_WEBHOOK_SECRET used by the two import functions —
// this is an admin-only operation, not something end users or agents call.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient } from "../_shared/auth.ts";
import { SignJWT } from "npm:jose@^6.2.5";

const ALL_SCOPES = [
  "templates:read", "templates:write",
  "tasks:read", "tasks:write",
  "customer_requests:read", "customer_requests:write",
  "customer_rounds:read",
  "deviations:read", "deviations:write",
  "stores:read",
  "template_packages:read", "template_packages:write",
  "deliveries:read", "schedule:read", "products:search",
];

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 40);
  return `sf_live_${b64}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Endast POST stöds." }, 405);

  const expectedSecret = Deno.env.get("IMPORT_WEBHOOK_SECRET");
  if (!expectedSecret) return json({ error: "IMPORT_WEBHOOK_SECRET är inte konfigurerad på servern." }, 500);
  if (req.headers.get("x-import-secret") !== expectedSecret) return json({ error: "Ogiltig eller saknad x-import-secret." }, 401);

  let body: { action?: string; name?: string; store_id?: string | null; scopes?: string[]; key_id?: string; api_key?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ogiltig JSON i request-body." }, 400);
  }

  // Skapa databasklient med service role för admin-operationer i api_keys-tabellen
  const supabase = serviceRoleClient();

  if (body.action === "list") {
    const { data, error } = await supabase.from("api_keys")
      .select("id, name, key_prefix, store_id, scopes, created_at, last_used_at, revoked_at")
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

    const rawKey = generateApiKey();
    const keyHash = await sha256Hex(rawKey);
    const { data: created, error } = await supabase.from("api_keys").insert({
      name: body.name, key_prefix: rawKey.slice(0, 12), key_hash: keyHash,
      store_id: body.store_id ?? null, scopes,
    }).select("id, key_prefix").single();
    if (error || !created) return json({ error: error?.message ?? "Kunde inte skapa nyckel." }, 500);

    return json({
      success: true,
      api_key: rawKey,
      key_id: created.id,
      key_prefix: created.key_prefix,
      warning: "Spara nyckeln nu — den visas aldrig igen.",
    });
  }

  if (body.action === "exchange") {
    if (!body.api_key) return json({ error: "api_key saknas." }, 400);

    const keyHash = await sha256Hex(body.api_key);
    const { data: keyRecord, error } = await supabase
      .from("api_keys")
      .select("id, store_id, scopes, revoked_at")
      .eq("key_hash", keyHash)
      .single();

    if (error || !keyRecord || keyRecord.revoked_at) {
      return json({ error: "Ogiltig eller återkallad API-nyckel." }, 401);
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

  return json({ error: "Okänd action. Använd 'create', 'list', 'revoke' eller 'exchange'." }, 400);
});
