// Edge Function: quick-switch
//
// Allows rapid user switching on shared store terminals via PIN code or barcode scan.
// Issues a short-lived session (8h) and updates active_store_id.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient } from "../_shared/auth.ts";

// Issued quick-switch sessions last 8 hours (a full shift)
const SESSION_TTL_HOURS = 8;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let body: {
      mode?: "pin" | "barcode";
      user_id?: string;
      pin?: string;
      barcode?: string;
      store_id?: string;
    };

    try {
      body = await req.json();
    } catch {
      return json({ error: "Ogiltig JSON i request-body." }, 400);
    }

    const { mode, store_id } = body;

    if (!store_id) {
      return json({ error: "store_id krävs." }, 400);
    }

    // Skapa databasklient med service role för autentiserings- och sessionshantering
    const supabase = serviceRoleClient();

    let userId: string | null = null;
    let userData: Record<string, unknown> | null = null;

    if (mode === "barcode") {
      const { barcode } = body;
      if (!barcode) {
        return json({ error: "Streckkod saknas." }, 400);
      }

      const { data: rows } = await supabase.rpc("lookup_user_by_barcode", {
        p_barcode: barcode,
        p_store_id: store_id,
      });

      if (!rows || rows.length === 0) {
        return json({ error: "Okänd streckkod. Kontakta din chef." }, 401);
      }

      userId = rows[0].id;
      userData = rows[0];
    } else if (mode === "pin") {
      const { user_id, pin } = body;
      if (!user_id || !pin) {
        return json({ error: "user_id och pin krävs." }, 400);
      }

      const { data: valid } = await supabase.rpc("verify_quick_pin", {
        p_user_id: user_id,
        p_pin: pin,
      });

      if (!valid) {
        return json({ error: "Fel PIN-kod." }, 401);
      }

      const { data: user } = await supabase
        .from("app_users")
        .select("id, username, display_name, role, role_manually_set, employee_group, store_id, active_store_id, must_change_password, last_login, created_at")
        .eq("id", user_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!user) {
        return json({ error: "Användaren hittades inte." }, 401);
      }

      userId = user.id;
      userData = user;
    } else {
      return json({ error: "Ogiltigt mode." }, 400);
    }

    if (!userId || !userData) {
      return json({ error: "Autentisering misslyckades." }, 401);
    }

    // Issue a new limited session (8h TTL)
    const token = crypto.randomUUID() + "-qs-" + Date.now();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

    await supabase.from("app_sessions").insert({
      user_id: userId,
      token,
      expires_at: expiresAt,
    });

    // Update last_login and set active_store_id
    await supabase
      .from("app_users")
      .update({ last_login: new Date().toISOString(), active_store_id: store_id })
      .eq("id", userId);

    const appUser = {
      id: userData.id,
      username: userData.username,
      display_name: userData.display_name,
      role: userData.role,
      role_manually_set: userData.role_manually_set ?? false,
      employee_group: userData.employee_group ?? "",
      store_id: userData.store_id ?? null,
      active_store_id: store_id,
      is_active: true,
      must_change_password: userData.must_change_password ?? false,
      last_login: userData.last_login,
      created_at: userData.created_at,
    };

    return json({ user: appUser, token }, 200);
  } catch (err) {
    console.error("quick-switch error:", err);
    return json({ error: "Ett fel uppstod. Försök igen." }, 500);
  }
});
