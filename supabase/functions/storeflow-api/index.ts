// Edge Function: storeflow-api
//
// Authenticated REST API for storeflow, meant for automation tools and AI
// agents (Power Automate, scripts, the mcp-server function, etc.) — no
// browser session required.
//
// Auth: Authorization: Bearer <api_key>   (mint one via the issue-api-key function)
//
// Routes (all relative to /functions/v1/storeflow-api):
//   GET  /templates?store_id=&category=&status=&limit=
//   GET  /templates/:id
//   POST /templates                body: CreateTemplateInput (see _shared/storeflow-core.ts)
//   GET  /delivery-plans?store_id=&week_number=&year=
//   GET  /schedule?store_id=&week_number=&year=
//   GET  /products/search?material_number=|ean=|bnr=|query=&category_id=&status_code=&store_id=
//
// Required scopes per route are documented in _shared/storeflow-core.ts and
// enforced there — a 403 means the key is missing a scope or store access.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { authenticate, serviceRoleClient } from "../_shared/auth.ts";
import {
  ScopeError, listTemplates, getTemplate, createTemplate,
  listDeliveryPlan, listSchedule, searchProduct,
} from "../_shared/storeflow-core.ts";

function pathAfterFunctionName(req: Request): string[] {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("storeflow-api");
  return idx >= 0 ? parts.slice(idx + 1) : parts;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabase = serviceRoleClient();
  const ctx = await authenticate(req, supabase);
  if (!ctx) return json({ error: "Ogiltig eller saknad Authorization: Bearer <api_key>." }, 401);

  const url = new URL(req.url);
  const segments = pathAfterFunctionName(req);
  const q = url.searchParams;

  try {
    // ── /templates ──
    if (segments[0] === "templates" && segments.length === 1 && req.method === "GET") {
      const data = await listTemplates(supabase, ctx, {
        store_id: q.get("store_id") ?? undefined,
        category: q.get("category") ?? undefined,
        status: q.get("status") ?? undefined,
        limit: q.get("limit") ? Number(q.get("limit")) : undefined,
      });
      return json({ success: true, templates: data });
    }
    if (segments[0] === "templates" && segments.length === 2 && req.method === "GET") {
      const data = await getTemplate(supabase, ctx, segments[1]);
      return json({ success: true, template: data });
    }
    if (segments[0] === "templates" && segments.length === 1 && req.method === "POST") {
      const body = await req.json();
      const data = await createTemplate(supabase, ctx, body);
      return json({ success: true, template: data }, 201);
    }

    // ── /delivery-plans ──
    if (segments[0] === "delivery-plans" && req.method === "GET") {
      const storeId = q.get("store_id");
      if (!storeId) return json({ error: "store_id krävs." }, 400);
      const data = await listDeliveryPlan(supabase, ctx, {
        store_id: storeId,
        week_number: q.get("week_number") ? Number(q.get("week_number")) : undefined,
        year: q.get("year") ? Number(q.get("year")) : undefined,
      });
      return json({ success: true, delivery_plans: data });
    }

    // ── /schedule ──
    if (segments[0] === "schedule" && req.method === "GET") {
      const storeId = q.get("store_id");
      const weekNumber = q.get("week_number");
      const year = q.get("year");
      if (!storeId || !weekNumber || !year) return json({ error: "store_id, week_number och year krävs." }, 400);
      const data = await listSchedule(supabase, ctx, { store_id: storeId, week_number: Number(weekNumber), year: Number(year) });
      return json({ success: true, schedule: data });
    }

    // ── /products/search ──
    if (segments[0] === "products" && segments[1] === "search" && req.method === "GET") {
      const data = await searchProduct(supabase, ctx, {
        store_id: q.get("store_id") ?? undefined,
        material_number: q.get("material_number") ?? undefined,
        ean: q.get("ean") ?? undefined,
        bnr: q.get("bnr") ?? undefined,
        query: q.get("query") ?? undefined,
        category_id: q.get("category_id") ? Number(q.get("category_id")) : undefined,
        status_code: q.get("status_code") ? Number(q.get("status_code")) : undefined,
      });
      return json({ success: true, product: data });
    }

    return json({ error: `Okänd route: ${req.method} /${segments.join("/")}` }, 404);
  } catch (err) {
    if (err instanceof ScopeError) return json({ error: err.message }, err.status);
    console.error("storeflow-api error:", err);
    return json({ error: "Internt fel." }, 500);
  }
});
