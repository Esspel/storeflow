import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Issued quick-switch sessions last 8 hours (a full shift)
const SESSION_TTL_HOURS = 8;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mode, store_id } = body as {
      mode: "pin" | "barcode";
      user_id?: string;
      pin?: string;
      barcode?: string;
      store_id: string;
    };

    if (!store_id) {
      return new Response(JSON.stringify({ error: "store_id krävs." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId: string | null = null;
    let userData: Record<string, unknown> | null = null;

    if (mode === "barcode") {
      const { barcode } = body as { barcode: string };
      if (!barcode) {
        return new Response(JSON.stringify({ error: "Streckkod saknas." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: rows } = await supabase.rpc("lookup_user_by_barcode", {
        p_barcode: barcode,
        p_store_id: store_id,
      });

      if (!rows || rows.length === 0) {
        return new Response(JSON.stringify({ error: "Okänd streckkod. Kontakta din chef." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = rows[0].id;
      userData = rows[0];
    } else if (mode === "pin") {
      const { user_id, pin } = body as { user_id: string; pin: string };
      if (!user_id || !pin) {
        return new Response(JSON.stringify({ error: "user_id och pin krävs." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: valid } = await supabase.rpc("verify_quick_pin", {
        p_user_id: user_id,
        p_pin: pin,
      });

      if (!valid) {
        return new Response(JSON.stringify({ error: "Fel PIN-kod." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: user } = await supabase
        .from("app_users")
        .select("id, username, display_name, role, role_manually_set, employee_group, store_id, active_store_id, must_change_password, last_login, created_at")
        .eq("id", user_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!user) {
        return new Response(JSON.stringify({ error: "Användaren hittades inte." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = user.id;
      userData = user;
    } else {
      return new Response(JSON.stringify({ error: "Ogiltigt mode." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userId || !userData) {
      return new Response(JSON.stringify({ error: "Autentisering misslyckades." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    return new Response(JSON.stringify({ user: appUser, token }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("quick-switch error:", err);
    return new Response(JSON.stringify({ error: "Ett fel uppstod. Försök igen." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
