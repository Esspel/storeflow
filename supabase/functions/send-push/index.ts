import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Old FCM endpoint format deprecated by Google in June 2024.
// Subscriptions using this format never deliver even though FCM returns 201.
function isDeprecatedEndpoint(endpoint: string): boolean {
  return endpoint.includes("fcm.googleapis.com/fcm/send/");
}

interface SendPushPayload {
  user_ids?: string[];
  store_id?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@storeflow.app";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const payload: SendPushPayload = await req.json();
    const { title, body, url = "/", tag = "storeflow", user_ids, store_id } = payload;

    // Build query for subscriptions
    let query = supabase.from("push_subscriptions").select("*");

    if (user_ids && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    } else if (store_id) {
      const { data: storeUsers } = await supabase
        .from("user_stores")
        .select("user_id")
        .eq("store_id", store_id);
      const ids = (storeUsers ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) {
        return new Response(
          JSON.stringify({ sent: 0, message: "No users found for store" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      query = query.in("user_id", ids);
    }

    const { data: subscriptions, error } = await query;
    if (error) throw error;

    const pushPayload = JSON.stringify({ title, body, url, tag });
    const staleEndpoints: string[] = [];
    let sent = 0;
    let skipped = 0;

    await Promise.all(
      (subscriptions ?? []).map(async (sub: { endpoint: string; subscription_json: unknown }) => {
        // Automatically remove deprecated FCM endpoints — they accept the request
        // but silently drop the message, so there is no point in sending to them.
        if (isDeprecatedEndpoint(sub.endpoint)) {
          staleEndpoints.push(sub.endpoint);
          skipped++;
          return;
        }

        try {
          await webpush.sendNotification(sub.subscription_json as webpush.PushSubscription, pushPayload);
          sent++;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          // 410 Gone = subscription revoked, 404 Not Found = endpoint gone
          if (status === 410 || status === 404) {
            staleEndpoints.push(sub.endpoint);
          } else {
            console.error("Push send error for endpoint", sub.endpoint, err);
          }
        }
      }),
    );

    // Clean up stale and deprecated subscriptions
    if (staleEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
    }

    return new Response(
      JSON.stringify({ sent, skipped, removed: staleEndpoints.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
