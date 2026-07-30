// Edge Function: storeflow-api
//
// Authenticated REST API for storeflow, meant for automation tools and AI
// agents (Power Automate, scripts, the mcp-server function, etc.) — no
// browser session required.
//
// Auth: Authorization: Bearer <api_key | jwt_access_token>
//       (mint API keys or exchange them for JWTs via the issue-api-key function)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { serviceRoleClient, authenticateRequest } from "../_shared/auth.ts";
import {
  ScopeError, listTemplates, getTemplate, createTemplate, updateTemplate,
  listTasks, getTask, createTask, updateTask,
  listCustomerRequests, getCustomerRequest, createCustomerRequest, updateCustomerRequest,
  listCustomerRounds, getCustomerRound,
  listDeviations, getDeviation, createDeviation, updateDeviation,
  listStores, getStore,
  listTemplatePackages, getTemplatePackage, createTemplatePackage, updateTemplatePackage,
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

  // 1. Nytt autentiseringsflöde via auth.ts
  // Validatorn läser Authorization-headern och returnerar en färdig AuthContext (ctx)
  const ctx = await authenticateRequest(req);
  if (!ctx) return json({ error: "Ogiltig eller saknad Authorization: Bearer <token>." }, 401);

  // 2. Skapa serviceRoleClient för anrop mot Supabase/database
  const supabase = serviceRoleClient();

  const url = new URL(req.url);
  const segments = pathAfterFunctionName(req);
  const q = url.searchParams;

  try {
    // ── /templates ──
    if (segments[0] === "templates") {
      if (segments.length === 1 && req.method === "GET") {
        const data = await listTemplates(supabase, ctx, {
          store_id: q.get("store_id") ?? undefined,
          category: q.get("category") ?? undefined,
          status: q.get("status") ?? undefined,
          limit: q.get("limit") ? Number(q.get("limit")) : undefined,
        });
        return json({ success: true, templates: data });
      }
      if (segments.length === 2 && req.method === "GET") {
        const data = await getTemplate(supabase, ctx, segments[1]);
        return json({ success: true, template: data });
      }
      if (segments.length === 1 && req.method === "POST") {
        const body = await req.json();
        const data = await createTemplate(supabase, ctx, body);
        return json({ success: true, template: data }, 201);
      }
      if (segments.length === 2 && (req.method === "PUT" || req.method === "PATCH")) {
        const body = await req.json();
        const data = await updateTemplate(supabase, ctx, { ...body, template_id: segments[1] });
        return json({ success: true, template: data });
      }
    }

    // ── /tasks ──
    if (segments[0] === "tasks") {
      if (segments.length === 1 && req.method === "GET") {
        const data = await listTasks(supabase, ctx, {
          store_id: q.get("store_id") ?? undefined,
          status: q.get("status") ?? undefined,
          category: q.get("category") ?? undefined,
          assigned_to: q.get("assigned_to") ?? undefined,
          due_date: q.get("due_date") ?? undefined,
          limit: q.get("limit") ? Number(q.get("limit")) : undefined,
        });
        return json({ success: true, tasks: data });
      }
      if (segments.length === 2 && req.method === "GET") {
        const data = await getTask(supabase, ctx, segments[1]);
        return json({ success: true, task: data });
      }
      if (segments.length === 1 && req.method === "POST") {
        const body = await req.json();
        const data = await createTask(supabase, ctx, body);
        return json({ success: true, task: data }, 201);
      }
      if (segments.length === 2 && (req.method === "PUT" || req.method === "PATCH")) {
        const body = await req.json();
        const data = await updateTask(supabase, ctx, { ...body, task_id: segments[1] });
        return json({ success: true, task: data });
      }
    }

    // ── /customer-requests ──
    if (segments[0] === "customer-requests") {
      if (segments.length === 1 && req.method === "GET") {
        const data = await listCustomerRequests(supabase, ctx, {
          store_id: q.get("store_id") ?? undefined,
          status: q.get("status") ?? undefined,
          priority: q.get("priority") ?? undefined,
          query: q.get("query") ?? undefined,
          limit: q.get("limit") ? Number(q.get("limit")) : undefined,
        });
        return json({ success: true, customer_requests: data });
      }
      if (segments.length === 2 && req.method === "GET") {
        const data = await getCustomerRequest(supabase, ctx, segments[1]);
        return json({ success: true, customer_request: data });
      }
      if (segments.length === 1 && req.method === "POST") {
        const body = await req.json();
        const data = await createCustomerRequest(supabase, ctx, body);
        return json({ success: true, customer_request: data }, 201);
      }
      if (segments.length === 2 && (req.method === "PUT" || req.method === "PATCH")) {
        const body = await req.json();
        const data = await updateCustomerRequest(supabase, ctx, { ...body, request_id: segments[1] });
        return json({ success: true, customer_request: data });
      }
    }

    // ── /customer-rounds ──
    if (segments[0] === "customer-rounds") {
      if (segments.length === 1 && req.method === "GET") {
        const data = await listCustomerRounds(supabase, ctx, {
          store_id: q.get("store_id") ?? undefined,
          status: q.get("status") ?? undefined,
          limit: q.get("limit") ? Number(q.get("limit")) : undefined,
        });
        return json({ success: true, customer_rounds: data });
      }
      if (segments.length === 2 && req.method === "GET") {
        const data = await getCustomerRound(supabase, ctx, segments[1]);
        return json({ success: true, customer_round: data });
      }
    }

    // ── /deviations ──
    if (segments[0] === "deviations") {
      if (segments.length === 1 && req.method === "GET") {
        const data = await listDeviations(supabase, ctx, {
          store_id: q.get("store_id") ?? undefined,
          status: q.get("status") ?? undefined,
          priority: q.get("priority") ?? undefined,
          category: q.get("category") ?? undefined,
          query: q.get("query") ?? undefined,
          limit: q.get("limit") ? Number(q.get("limit")) : undefined,
        });
        return json({ success: true, deviations: data });
      }
      if (segments.length === 2 && req.method === "GET") {
        const data = await getDeviation(supabase, ctx, segments[1]);
        return json({ success: true, deviation: data });
      }
      if (segments.length === 1 && req.method === "POST") {
        const body = await req.json();
        const data = await createDeviation(supabase, ctx, body);
        return json({ success: true, deviation: data }, 201);
      }
      if (segments.length === 2 && (req.method === "PUT" || req.method === "PATCH")) {
        const body = await req.json();
        const data = await updateDeviation(supabase, ctx, { ...body, deviation_id: segments[1] });
        return json({ success: true, deviation: data });
      }
    }

    // ── /stores ──
    if (segments[0] === "stores") {
      if (segments.length === 1 && req.method === "GET") {
        const data = await listStores(supabase, ctx, {
          is_active: q.get("is_active") !== null ? q.get("is_active") === "true" : undefined,
          region: q.get("region") ?? undefined,
          query: q.get("query") ?? undefined,
          limit: q.get("limit") ? Number(q.get("limit")) : undefined,
        });
        return json({ success: true, stores: data });
      }
      if (segments.length === 2 && req.method === "GET") {
        const data = await getStore(supabase, ctx, segments[1]);
        return json({ success: true, store: data });
      }
    }

    // ── /template-packages ──
    if (segments[0] === "template-packages") {
      if (segments.length === 1 && req.method === "GET") {
        const data = await listTemplatePackages(supabase, ctx, {
          store_id: q.get("store_id") ?? undefined,
          limit: q.get("limit") ? Number(q.get("limit")) : undefined,
        });
        return json({ success: true, template_packages: data });
      }
      if (segments.length === 2 && req.method === "GET") {
        const data = await getTemplatePackage(supabase, ctx, segments[1]);
        return json({ success: true, template_package: data });
      }
      if (segments.length === 1 && req.method === "POST") {
        const body = await req.json();
        const data = await createTemplatePackage(supabase, ctx, body);
        return json({ success: true, template_package: data }, 201);
      }
      if (segments.length === 2 && (req.method === "PUT" || req.method === "PATCH")) {
        const body = await req.json();
        const data = await updateTemplatePackage(supabase, ctx, { ...body, package_id: segments[1] });
        return json({ success: true, template_package: data });
      }
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
