// Edge Function: issue-api-key
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

function safeCompare(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
}

function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sf_live_${hex}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Endast POST stöds." }, 405);

  const supabase = serviceRoleClient();

  // 1. Validera autentisering via x-import-secret eller x-session-token i app_sessions
  const expectedSecret = Deno.env.get("IMPORT_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-import-secret") ?? "";
  const sessionToken = req.headers.get("x-session-token");

  let isAuthenticated = false;
  let currentUserId: string | null = null;

  if (expectedSecret && safeCompare(providedSecret, expectedSecret)) {
    isAuthenticated = true;
  } else if (sessionToken) {
    const { data: session, error } = await supabase
      .from("app_sessions")
      .select("id, user_id, expires_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (!error && session) {
      const isNotExpired = !session.expires_at || new Date(session.expires_at).getTime() > Date.now();
      if (isNotExpired) {
        isAuthenticated = true;
        currentUserId = session.user_id;
      }
    }
  }

  if (!isAuthenticated) {
    return json({ error: "Ogiltig eller saknad autentisering." }, 401);
  }

  let body: {
    action?: string;
    name?: string;
    store_id?: string | null;
    scopes?: string[];
    key_id?: string;
    api_key?: string;
    expires_at?: string | null;
    user_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Ogiltig JSON i request-body." }, 400);
  }

  if (body.action === "list") {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, store_id, scopes, created_at, last_used_at, revoked_at, expires_at, rotated_from_id")
      .order("created_at", { ascending: false });

    if (error) return json({ error: error.message }, 500);
    return json({ success: true, keys: data });
  }

  if (body.action === "revoke") {
    if (!body.key_id) return json({ error: "key_id saknas." }, 400);

    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", body.key_id);

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
      name: body.name,
      key_prefix: rawKey.slice(0, 16),
      key_hash: keyHash,
      store_id: body.store_id ?? null,
      scopes,
      expires_at: body.expires_at ?? null,
      created_by: currentUserId ?? body.user_id ?? null,
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

  if (body.action === "rotate") {
    if (!body.key_id) return json({ error: "key_id saknas." }, 400);

    const { data: oldKey, error: fetchErr } = await supabase
      .from("api_keys")
      .select("*")
      .eq("id", body.key_id)
      .single();

    if (fetchErr || !oldKey) return json({ error: "Nyckeln hittades inte." }, 404);
    if (oldKey.revoked_at) return json({ error: "Kan inte rotera en återkallad nyckel." }, 400);

    const { error: revokeErr } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", oldKey.id);

    if (revokeErr) return json({ error: revokeErr.message }, 500);

    const rawKey = generateApiKey();
    const keyHash = await sha256Hex(rawKey);

    const { data: newKey, error: createErr } = await supabase.from("api_keys").insert({
      name: oldKey.name,
      key_prefix: rawKey.slice(0, 16),
      key_hash: keyHash,
      store_id: oldKey.store_id,
      scopes: oldKey.scopes,
      expires_at: oldKey.expires_at,
      rotated_from_id: oldKey.id,
      created_by: currentUserId ?? oldKey.created_by ?? null,
    }).select("id, key_prefix").single();

    if (createErr || !newKey) return json({ error: createErr?.message ?? "Kunde inte rotera nyckeln." }, 500);

    return json({
      success: true,
      api_key: rawKey,
      key_id: newKey.id,
      key_prefix: newKey.key_prefix,
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

    supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id).then();

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

  return json({ error: "Okänd action." }, 400);
});
