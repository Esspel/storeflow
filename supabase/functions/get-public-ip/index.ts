// Edge Function: get-public-ip
// Returns the client's public IP (via ifconfig.co) for store IP binding.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const res = await fetch("https://ifconfig.co/json", {
      method: "GET",
      headers: { Accept: "application/json" },
    }).catch(() => null);

    if (!res || !res.ok) {
      return json({ error: "Kunde inte hämta IP från ifconfig.co" }, 500);
    }

    const data = await res.json();
    return json({ ip: data.ip || data.ipv4 || null }, 200);
  } catch (err) {
    console.error("get-public-ip error:", err);
    return json({ error: "Ett fel uppstod." }, 500);
  }
});
