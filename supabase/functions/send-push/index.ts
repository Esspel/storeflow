// Edge Function: send-push
//
// Sends Web Push notifications to subscriptions stored in the database.
// Filters by user_ids or store_id, cleans up stale/deprecated endpoints (FCM legacy, 404, 410).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient } from "../_shared/auth.ts";

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
      return json({ error: "VAPID keys not configured" }, 500);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // 1. Skapa serviceRoleClient via det gemensamma auth-biblioteket
    const supabase = serviceRoleClient();

    let payload: SendPushPayload;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Ogiltig JSON i request-body." }, 400);
    }

    const { title, body, url = "/", tag = "storeflow", user_ids, store_id } = payload;

    if (!title) {
      return json({ error: "Titel krävs för att skicka push-notis." }, 400);
    }

    // Tom body är tillåten — använd titeln som body så att OS-notisen inte blir tom.
    const bodyText = (body ?? "").trim() ? body : title;

    // Endast relativa sökvägar tillåts — förhindrar att en notis kan navigera
    // användaren till en extern sida när den klickas.
    const safeUrl = typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/";

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
        return json({ sent: 0, message: "No users found for store" });
      }
      query = query.in("user_id", ids);
    }

    const { data: subscriptions, error } = await query;
    if (error) throw error;

    const pushPayload = JSON.stringify({ title, body: bodyText, url: safeUrl, tag });
    const staleEndpoints: string[] = [];
    const errors: string[] = [];
    let sent = 0;
    let skipped = 0;

    await Promise.all(
      (subscriptions ?? []).map(async (sub: { endpoint: string; subscription_json: unknown }) => {
        // Automatically remove deprecated FCM endpoints
        if (isDeprecatedEndpoint(sub.endpoint)) {
          staleEndpoints.push(sub.endpoint);
          skipped++;
          return;
        }

        try {
          await webpush.sendNotification(sub.subscription_json as webpush.PushSubscription, pushPayload);
          sent++;
        } catch (err: unknown) {
          const e = err as { statusCode?: number; body?: string; message?: string };
          const status = e.statusCode;
          const detail = `${sub.endpoint.slice(0, 40)}... status=${status} body=${e.body ?? e.message ?? String(err)}`;
          console.error("Push send error:", detail);
          errors.push(detail);
          if (status === 410 || status === 404) {
            staleEndpoints.push(sub.endpoint);
          }
        }
      }),
    );

    // Clean up stale and deprecated subscriptions
    if (staleEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
    }

    return json({ sent, skipped, removed: staleEndpoints.length, errors });
  } catch (err) {
    console.error("send-push error:", err);
    return json({ error: String(err) }, 500);
  }
});
