import { authenticateRequest, serviceRoleClient } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    // Authentisera via API-key eller JWT (som andra edge functions)
    const ctx = await authenticateRequest(req);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Använd service role för att kringgå RLS på uppdateringar
    const supabase = serviceRoleClient();

    const body = await req.json();
    const {
      sap_article_id,
      shelf_lifetime_days,
      expiry_date,
      arrival_date,
      compensation_price_ore,
      store_id,
    } = body;

    if (!sap_article_id) throw new Error("sap_article_id is required");
    if (shelf_lifetime_days == null || expiry_date == null || arrival_date == null) {
      throw new Error("shelf_lifetime_days, expiry_date, and arrival_date are required");
    }
    if (!store_id && !ctx.storeId) {
      throw new Error("store_id is required (or set via API key / session)");
    }

    const targetStore = store_id || ctx.storeId;

    const expiry = new Date(expiry_date);
    const arrival = new Date(arrival_date);
    if (expiry <= arrival) {
      throw new Error("expiry_date must be after arrival_date");
    }

    // Lookup with store context
    const { data: existing, error: existingError } = await supabase
      .from("product_shelf_life")
      .select("id")
      .eq("sap_article_id", sap_article_id)
      .eq("store_id", targetStore)
      .maybeSingle();

    if (existingError) throw existingError;

    const payload = {
      store_id: targetStore,
      sap_article_id,
      shelf_lifetime_days,
      expiry_date: expiry.toISOString(),
      arrival_date: arrival.toISOString(),
      compensation_price_ore: compensation_price_ore ?? 2,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase
        .from("product_shelf_life")
        .update(payload)
        .eq("id", existing.id)
        .eq("store_id", targetStore);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("product_shelf_life")
        .insert({ ...payload, created_at: new Date().toISOString() });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
