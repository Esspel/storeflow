// Edge Function: mcp-server
//
// A remote MCP (Model Context Protocol) server for storeflow, built on the
// same auth/scopes and core logic as storeflow-api. Implements the
// "Streamable HTTP" transport in stateless mode: every request is a single
// JSON-RPC 2.0 call over POST, answered with a single JSON response (no
// session/SSE required for this tool set).
//
// Point an MCP client at:
//   https://<project-ref>.supabase.co/functions/v1/mcp-server
//   Header: Authorization: Bearer <api_key>   (mint one via issue-api-key)
//
// Supported methods: initialize, notifications/initialized, tools/list, tools/call, ping

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { authenticate, serviceRoleClient } from "../_shared/auth.ts";
import {
  ScopeError, listTemplates, getTemplate, createTemplate,
  listDeliveryPlan, listSchedule, searchProduct,
} from "../_shared/storeflow-core.ts";

const SERVER_INFO = { name: "storeflow-mcp", version: "1.0.0" };
const PROTOCOL_VERSION = "2025-06-18";

// deno-lint-ignore no-explicit-any
type ToolHandler = (supabase: any, ctx: any, args: Record<string, unknown>) => Promise<unknown>;

const TOOLS: { name: string; description: string; inputSchema: Record<string, unknown>; handler: ToolHandler }[] = [
  {
    name: "list_templates",
    description: "Lista checklistmallar (mallar) i storeflow, valfritt filtrerat på butik, kategori eller status.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string", description: "Butiks-UUID. Utelämna för alla butiker nyckeln har åtkomst till." },
        category: { type: "string" },
        status: { type: "string", description: "T.ex. 'active'" },
        limit: { type: "number", description: "Max antal, default 50, max 200." },
      },
    },
    handler: async (supabase, ctx, args) => listTemplates(supabase, ctx, args as never),
  },
  {
    name: "get_template",
    description: "Hämta en checklistmall i sin helhet, inklusive alla steg och vilka butiker den är kopplad till.",
    inputSchema: {
      type: "object",
      properties: { template_id: { type: "string" } },
      required: ["template_id"],
    },
    handler: async (supabase, ctx, args) => getTemplate(supabase, ctx, args.template_id as string),
  },
  {
    name: "create_template",
    description: "Skapa en ny checklistmall med steg och butikskoppling. Stödjer grundfälten (titel, beskrivning, kategori, prioritet, återkommelseregel, artikelkoppling) — inte de mer avancerade mall-funktionerna (processer, arv, villkorliga steg).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        priority: { type: "string", description: "T.ex. 'Låg', 'Medel', 'Hög'" },
        recurrence_rule: { type: "string", description: "Valfri återkommelseregel." },
        due_date_offset: { type: "number" },
        sap_article_id: { type: "string", description: "Materialnummer att koppla mallen till, om relevant." },
        store_ids: { type: "array", items: { type: "string" }, description: "Vilka butiker mallen ska tilldelas (minst en)." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, requires_photo: { type: "boolean" } },
            required: ["label"],
          },
        },
      },
      required: ["title", "store_ids"],
    },
    handler: async (supabase, ctx, args) => createTemplate(supabase, ctx, args as never),
  },
  {
    name: "list_delivery_plans",
    description: "Läs leveransplan(er) med tillhörande leveranser för en butik, valfritt filtrerat på vecka/år.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string" },
        week_number: { type: "number" },
        year: { type: "number" },
      },
      required: ["store_id"],
    },
    handler: async (supabase, ctx, args) => listDeliveryPlan(supabase, ctx, args as never),
  },
  {
    name: "get_schedule",
    description: "Läs importerat schema (personal + pass) för en butik, en specifik vecka och år.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string" },
        week_number: { type: "number" },
        year: { type: "number" },
      },
      required: ["store_id", "week_number", "year"],
    },
    handler: async (supabase, ctx, args) => listSchedule(supabase, ctx, args as never),
  },
  {
    name: "search_product",
    description:
      "Bygg en länk till Mitt Coop-sortiment för en produkt. Ange material_number om det är känt (öppnar produktsidan direkt). " +
      "Annars sök med query/ean/bnr och/eller category_id + status_code (öppnar sortimentets sökfunktion). " +
      "OBS: detta returnerar en länk att öppna — vi har ingen direkt API-åtkomst till Coops produktdata.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string", description: "Avgör vilken butiks siteId som används i länken." },
        material_number: { type: "string" },
        ean: { type: "string" },
        bnr: { type: "string" },
        query: { type: "string", description: "Fritextsökning." },
        category_id: { type: "number", description: "Mitt Coop-kategori-id." },
        status_code: { type: "number", description: "Mitt Coop-statuskod (t.ex. 3=Aktiv, 6=Har utgått)." },
      },
    },
    handler: async (supabase, ctx, args) => searchProduct(supabase, ctx, args as never),
  },
];

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "MCP-servern använder POST med JSON-RPC 2.0." }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = serviceRoleClient();

  let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    rpc = await req.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Notifications (no "id") never get a JSON-RPC response body — 202 is enough.
  const isNotification = rpc.id === undefined;

  if (rpc.method === "initialize") {
    const result = {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    };
    return respond(rpcResult(rpc.id, result));
  }

  if (rpc.method === "notifications/initialized" || rpc.method === "notifications/cancelled") {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  if (rpc.method === "ping") {
    return respond(rpcResult(rpc.id, {}));
  }

  // Everything past this point needs a valid API key
  const ctx = await authenticate(req, supabase);
  if (!ctx) {
    if (isNotification) return new Response(null, { status: 202, headers: corsHeaders });
    return respond(rpcError(rpc.id, -32001, "Ogiltig eller saknad Authorization: Bearer <api_key>."), 401);
  }

  if (rpc.method === "tools/list") {
    return respond(rpcResult(rpc.id, {
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    }));
  }

  if (rpc.method === "tools/call") {
    const toolName = rpc.params?.name as string | undefined;
    const args = (rpc.params?.arguments as Record<string, unknown>) ?? {};
    const tool = TOOLS.find((t) => t.name === toolName);
    if (!tool) return respond(rpcResult(rpc.id, { content: [{ type: "text", text: `Okänt verktyg: ${toolName}` }], isError: true }));

    try {
      const result = await tool.handler(supabase, ctx, args);
      return respond(rpcResult(rpc.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }));
    } catch (err) {
      const message = err instanceof ScopeError ? err.message : (err instanceof Error ? err.message : "Internt fel.");
      return respond(rpcResult(rpc.id, { content: [{ type: "text", text: message }], isError: true }));
    }
  }

  if (isNotification) return new Response(null, { status: 202, headers: corsHeaders });
  return respond(rpcError(rpc.id, -32601, `Okänd metod: ${rpc.method}`), 400);
});
