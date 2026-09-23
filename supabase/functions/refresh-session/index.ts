// Edge Function: refresh-session
//
// Extends the expiry of an existing app_sessions row, implementing sliding
// session expiration. Called periodically by the client to keep an active
// session alive beyond the initial TTL.
//
// Auth: x-session-token header (the app session token)
// Uses service_role to bypass RLS on app_sessions UPDATE (no UPDATE policy exists).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient } from "../_shared/auth.ts";

const SESSION_TTL_HOURS = 12;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Endast POST stöds." }, 405);
  }

  const token = req.headers.get("x-session-token");
  if (!token) {
    return json({ error: "Session token krävs." }, 401);
  }

  try {
    const supabase = serviceRoleClient();

    // Validate the session is still active
    const { data: session, error: sessionErr } = await supabase
      .from("app_sessions")
      .select("user_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (sessionErr || !session) {
      return json({ error: "Ogiltig session." }, 401);
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      // Session expired — delete it
      await supabase.from("app_sessions").delete().eq("token", token);
      return json({ error: "Sessionen har gångt ut." }, 401);
    }

    // Verify the user is still active
    const { data: user, error: userErr } = await supabase
      .from("app_users")
      .select("is_active")
      .eq("id", session.user_id)
      .maybeSingle();

    if (userErr || !user || !user.is_active) {
      // User deactivated — delete session
      await supabase.from("app_sessions").delete().eq("token", token);
      return json({ error: "Användaren är inaktiv." }, 401);
    }

    // Extend the session expiry (sliding window)
    const newExpiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabase
      .from("app_sessions")
      .update({ expires_at: newExpiresAt })
      .eq("token", token);

    if (updateErr) {
      console.error("Failed to extend session:", updateErr.message);
      return json({ error: "Kunde inte förnya sessionen." }, 500);
    }

    return json({ ok: true, expires_at: newExpiresAt, user_id: session.user_id }, 200);
  } catch (err) {
    console.error("refresh-session error:", err);
    return json({ error: "Ett fel uppstod." }, 500);
  }
});
