// Edge Function: issue-api-key
//
// Mints, lists, or revokes API keys used by storeflow-api and mcp-server.
// Gated by the same IMPORT_WEBHOOK_SECRET used by the two import functions —
// this is an admin-only operation, not something end users or agents call.
//
// Call:
//   POST https://<project-ref>.supabase.co/functions/v1/issue-api-key
//   Headers: Content-Type: application/json, x-import-secret: <IMPORT_WEBHOOK_SECRET>
//   Body:
//     { "action": "create", "name": "Power Automate", "store_id": "uuid" | null,
//       "scopes": ["templates:read","templates:write","deliveries:read","schedule:read","products:search"] }
//     { "action": "list" }
//     { "action": "revoke", "key_id": "uuid" }
//
// "create" response includes the RAW key exactly once: { success: true, api_key: "sf_live_...", key_id, key_prefix }
// Store it immediately — it is not recoverable afterwards, only key_prefix + metadata remain.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient } from "../_shared/auth.ts";

const ALL_SCOPES = ["templates:read", "templates:write", "deliveries:read", "schedule:read", "products:search"];

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

  let body: { action?: string; name?: string; store_id?: string | null; scopes?: string[]; key_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ogiltig JSON i request-body." }, 400);
  }

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

  return json({ error: "Okänd action. Använd 'create', 'list' eller 'revoke'." }, 400);
});
