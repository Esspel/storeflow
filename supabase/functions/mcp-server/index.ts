// Edge Function: mcp-server
//
// A remote MCP (Model Context Protocol) server for storeflow, built on the
// same auth/scopes and core logic as storeflow-api. Implements the
// "Streamable HTTP" transport in stateless mode: every request is a single
// JSON-RPC 2.0 call over POST, answered with a single JSON response.
//
// Point an MCP client at:
//   https://<project-ref>.supabase.co/functions/v1/mcp-server
//   Header: Authorization: Bearer <api_key | jwt_access_token>
//
// Supported methods: initialize, notifications/initialized, tools/list, tools/call, ping

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { serviceRoleClient, authenticateRequest } from "../_shared/auth.ts";
import {
  ScopeError,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  listTasks,
  getTask,
  createTask,
  updateTask,
  listCustomerRequests,
  getCustomerRequest,
  createCustomerRequest,
  updateCustomerRequest,
  listCustomerRounds,
  getCustomerRound,
  listDeviations,
  getDeviation,
  createDeviation,
  updateDeviation,
  listStores,
  getStore,
  listTemplatePackages,
  getTemplatePackage,
  createTemplatePackage,
  updateTemplatePackage,
  listDeliveryPlan,
  listSchedule,
  searchProduct,
} from "../_shared/storeflow-core.ts";

const SERVER_INFO = { name: "storeflow-mcp", version: "2.0.0" };
const PROTOCOL_VERSION = "2025-06-18";

// deno-lint-ignore no-explicit-any
type ToolHandler = (supabase: any, ctx: any, args: Record<string, unknown>) => Promise<unknown>;

const TOOLS: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}[] = [
  // ── Mallar (Templates) ──
  {
    name: "list_templates",
    description:
      "Lista checklistmallar i storeflow, valfritt filtrerat på butik, kategori eller status.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string", description: "Butiks-UUID." },
        category: { type: "string" },
        status: {
          type: "string",
          description: "T.ex. 'active', 'review', 'deprecated', 'archived'",
        },
        limit: { type: "number", description: "Max antal, default 50, max 200." },
      },
    },
    handler: async (supabase, ctx, args) => listTemplates(supabase, ctx, args as never),
  },
  {
    name: "get_template",
    description:
      "Hämta en checklistmall i sin helhet, inklusive alla steg och vilka butiker den är kopplad till.",
    inputSchema: {
      type: "object",
      properties: { template_id: { type: "string" } },
      required: ["template_id"],
    },
    handler: async (supabase, ctx, args) => getTemplate(supabase, ctx, args.template_id as string),
  },
  {
    name: "create_template",
    description: "Skapa en ny checklistmall med steg och butikskoppling.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        priority: { type: "string", description: "'Låg', 'Medel', 'Hög', 'Kritisk'" },
        recurrence_rule: { type: "string", description: "T.ex. 'daily', 'weekly', 'monthly'" },
        due_date_offset: { type: "number" },
        sap_article_id: { type: "string" },
        store_ids: {
          type: "array",
          items: { type: "string" },
          description: "Vilka butiker mallen ska tilldelas.",
        },
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
    name: "update_template",
    description: "Redigera/uppdatera en befintlig checklistmall och dess steg/butikskopplingar.",
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        priority: { type: "string" },
        status: { type: "string", description: "'active', 'review', 'deprecated', 'archived'" },
        recurrence_rule: { type: "string" },
        due_date_offset: { type: "number" },
        sap_article_id: { type: "string" },
        store_ids: { type: "array", items: { type: "string" } },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              requires_photo: { type: "boolean" },
              sort_order: { type: "number" },
            },
            required: ["label"],
          },
        },
      },
      required: ["template_id"],
    },
    handler: async (supabase, ctx, args) => updateTemplate(supabase, ctx, args as never),
  },

  // ── Uppgifter (Tasks) ──
  {
    name: "list_tasks",
    description:
      "Lista uppgifter/aktiva checklistor i storeflow, valfritt filtrerat på butik, status, kategori, tilldelad användare eller förfallodatum.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string" },
        status: { type: "string", description: "'todo', 'progress', 'done', 'late', 'cancelled'" },
        category: { type: "string" },
        assigned_to: { type: "string", description: "Användar-UUID" },
        due_date: { type: "string", description: "ÅÅÅÅ-MM-DD" },
        limit: { type: "number", description: "Max antal, default 50, max 200." },
      },
    },
    handler: async (supabase, ctx, args) => listTasks(supabase, ctx, args as never),
  },
  {
    name: "get_task",
    description: "Hämta en specifik uppgift med alla dess tillhörande steg och frågor.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
    handler: async (supabase, ctx, args) => getTask(supabase, ctx, args.task_id as string),
  },
  {
    name: "create_task",
    description: "Skapa en ny uppgift (aktiv checklista) för en butik med valfria steg och frågor.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        priority: { type: "string", description: "'Låg', 'Medel', 'Hög', 'Kritisk'" },
        status: { type: "string", description: "'todo', 'progress', 'done'" },
        store_id: { type: "string" },
        assigned_to: { type: "string" },
        created_by: { type: "string" },
        due_date: { type: "string" },
        due_date_time: { type: "string" },
        recurring: { type: "string" },
        recurrence_rule: { type: "string" },
        sap_article_id: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, requires_photo: { type: "boolean" } },
            required: ["label"],
          },
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              question_type: { type: "string" },
              is_required: { type: "boolean" },
            },
            required: ["label"],
          },
        },
      },
      required: ["title"],
    },
    handler: async (supabase, ctx, args) => createTask(supabase, ctx, args as never),
  },
  {
    name: "update_task",
    description:
      "Redigera/uppdatera en uppgift, ändra status (t.ex. markera som 'done'), förfallodatum, tilldelning eller steg.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        priority: { type: "string" },
        status: { type: "string", description: "'todo', 'progress', 'done', 'late', 'cancelled'" },
        assigned_to: { type: "string" },
        due_date: { type: "string" },
        due_date_time: { type: "string" },
        completed_at: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              is_done: { type: "boolean" },
              requires_photo: { type: "boolean" },
            },
          },
        },
      },
      required: ["task_id"],
    },
    handler: async (supabase, ctx, args) => updateTask(supabase, ctx, args as never),
  },

  // ── Kundönskemål (Customer Requests) ──
  {
    name: "list_customer_requests",
    description:
      "Lista kundönskemål i storeflow, valfritt filtrerat på butik, status, prioritet eller fritextsökning.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string" },
        status: { type: "string", description: "'open', 'ordered', 'declined', 'fulfilled'" },
        priority: { type: "string", description: "'low', 'normal', 'high'" },
        query: {
          type: "string",
          description: "Sök i produktnamn, artikelnummer eller anteckningar.",
        },
        limit: { type: "number" },
      },
    },
    handler: async (supabase, ctx, args) => listCustomerRequests(supabase, ctx, args as never),
  },
  {
    name: "get_customer_request",
    description: "Hämta detaljer för ett enskilt kundönskemål.",
    inputSchema: {
      type: "object",
      properties: { request_id: { type: "string" } },
      required: ["request_id"],
    },
    handler: async (supabase, ctx, args) =>
      getCustomerRequest(supabase, ctx, args.request_id as string),
  },
  {
    name: "create_customer_request",
    description: "Skapa ett nytt kundönskemål för en butik.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string" },
        product_name: { type: "string" },
        article_number: { type: "string" },
        notes: { type: "string" },
        priority: { type: "string", description: "'low', 'normal', 'high'" },
        status: { type: "string", description: "'open', 'ordered', 'declined', 'fulfilled'" },
        requested_by: { type: "string" },
        source: { type: "string" },
        mitt_coop_category_id: { type: "number" },
        mitt_coop_status_code: { type: "number" },
      },
      required: ["store_id", "product_name"],
    },
    handler: async (supabase, ctx, args) => createCustomerRequest(supabase, ctx, args as never),
  },
  {
    name: "update_customer_request",
    description: "Redigera/uppdatera ett kundönskemål (t.ex. status, kommentarer, prioritet).",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string" },
        status: { type: "string", description: "'open', 'ordered', 'declined', 'fulfilled'" },
        staff_comment: { type: "string" },
        internal_notes: { type: "string" },
        priority: { type: "string" },
        product_name: { type: "string" },
        article_number: { type: "string" },
        notes: { type: "string" },
      },
      required: ["request_id"],
    },
    handler: async (supabase, ctx, args) => updateCustomerRequest(supabase, ctx, args as never),
  },

  // ── Kundrundor (Customer Rounds) ──
  {
    name: "list_customer_rounds",
    description:
      "Läsa av och lista genomförda och pågående kundrundor (butiksrundor) för en butik.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string" },
        status: { type: "string", description: "'in_progress', 'completed'" },
        limit: { type: "number" },
      },
    },
    handler: async (supabase, ctx, args) => listCustomerRounds(supabase, ctx, args as never),
  },
  {
    name: "get_customer_round",
    description:
      "Hämta en kundrunda i sin helhet inklusive alla svar, poäng och eventuella avvikelser.",
    inputSchema: {
      type: "object",
      properties: { session_id: { type: "string" } },
      required: ["session_id"],
    },
    handler: async (supabase, ctx, args) =>
      getCustomerRound(supabase, ctx, args.session_id as string),
  },

  // ── Avvikelser (Deviations / Incidents) ──
  {
    name: "list_deviations",
    description:
      "Läsa av och lista avvikelser (incidents) i storeflow, valfritt filtrerat på butik, status, prioritet, kategori eller sökord.",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string" },
        status: {
          type: "string",
          description: "'open', 'in_progress', 'escalated', 'resolved', 'closed'",
        },
        priority: { type: "string", description: "'Låg', 'Medel', 'Hög', 'Kritisk'" },
        category: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
    handler: async (supabase, ctx, args) => listDeviations(supabase, ctx, args as never),
  },
  {
    name: "get_deviation",
    description: "Hämta en specifik avvikelse i sin helhet inklusive kommentarer.",
    inputSchema: {
      type: "object",
      properties: { deviation_id: { type: "string" } },
      required: ["deviation_id"],
    },
    handler: async (supabase, ctx, args) =>
      getDeviation(supabase, ctx, args.deviation_id as string),
  },
  {
    name: "create_deviation",
    description: "Rapportera/skapa en ny avvikelse i en butik.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        store_id: { type: "string" },
        reported_by: { type: "string" },
        assigned_to: { type: "string" },
        responsible_user_id: { type: "string" },
        priority: { type: "string", description: "'Låg', 'Medel', 'Hög', 'Kritisk'" },
        status: {
          type: "string",
          description: "'open', 'in_progress', 'escalated', 'resolved', 'closed'",
        },
        sap_article_id: { type: "string" },
        source: { type: "string" },
      },
      required: ["title"],
    },
    handler: async (supabase, ctx, args) => createDeviation(supabase, ctx, args as never),
  },
  {
    name: "update_deviation",
    description:
      "Redigera/uppdatera en avvikelse, ändra status (t.ex. till 'resolved'), tilldelning, prioritet eller beskrivning.",
    inputSchema: {
      type: "object",
      properties: {
        deviation_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string" },
        status: {
          type: "string",
          description: "'open', 'in_progress', 'escalated', 'resolved', 'closed'",
        },
        assigned_to: { type: "string" },
        responsible_user_id: { type: "string" },
        resolved_at: { type: "string" },
      },
      required: ["deviation_id"],
    },
    handler: async (supabase, ctx, args) => updateDeviation(supabase, ctx, args as never),
  },

  // ── Butiksregister (Stores) ──
  {
    name: "list_stores",
    description:
      "Läsa av butiksregistret i storeflow (alla butiker med kontaktuppgifter, koncept, adress, butikschef, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        is_active: { type: "boolean" },
        region: { type: "string" },
        query: { type: "string", description: "Sök på namn, stad, butiksnummer eller koncept." },
        limit: { type: "number" },
      },
    },
    handler: async (supabase, ctx, args) => listStores(supabase, ctx, args as never),
  },
  {
    name: "get_store",
    description: "Hämta fullständig information om en enskild butik.",
    inputSchema: {
      type: "object",
      properties: { store_id: { type: "string" } },
      required: ["store_id"],
    },
    handler: async (supabase, ctx, args) => getStore(supabase, ctx, args.store_id as string),
  },

  // ── Mallpaket (Template Packages) ──
  {
    name: "list_template_packages",
    description:
      "Lista alla mallpaket (samlingar av mallar för t.ex. öppning/stängning/granskningar).",
    inputSchema: {
      type: "object",
      properties: {
        store_id: { type: "string" },
        limit: { type: "number" },
      },
    },
    handler: async (supabase, ctx, args) => listTemplatePackages(supabase, ctx, args as never),
  },
  {
    name: "get_template_package",
    description: "Hämta ett mallpaket och se vilka mallar som ingår.",
    inputSchema: {
      type: "object",
      properties: { package_id: { type: "string" } },
      required: ["package_id"],
    },
    handler: async (supabase, ctx, args) =>
      getTemplatePackage(supabase, ctx, args.package_id as string),
  },
  {
    name: "create_template_package",
    description: "Skapa ett nytt mallpaket med kopplade checklistmallar.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        store_id: { type: "string" },
        created_by: { type: "string" },
        template_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array av mall-UUIDs som ingår i paketet.",
        },
      },
      required: ["name"],
    },
    handler: async (supabase, ctx, args) => createTemplatePackage(supabase, ctx, args as never),
  },
  {
    name: "update_template_package",
    description:
      "Redigera ett befintligt mallpaket (ändra namn, beskrivning eller ingående mallar).",
    inputSchema: {
      type: "object",
      properties: {
        package_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        store_id: { type: "string" },
        template_ids: { type: "array", items: { type: "string" } },
      },
      required: ["package_id"],
    },
    handler: async (supabase, ctx, args) => updateTemplatePackage(supabase, ctx, args as never),
  },

  // ── Existing Tools ──
  {
    name: "list_delivery_plans",
    description:
      "Läs leveransplan(er) med tillhörande leveranser för en butik, valfritt filtrerat på vecka/år.",
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
        store_id: {
          type: "string",
          description: "Avgör vilken butiks siteId som används i länken.",
        },
        material_number: { type: "string" },
        ean: { type: "string" },
        bnr: { type: "string" },
        query: { type: "string", description: "Fritextsökning." },
        category_id: { type: "number", description: "Mitt Coop-kategori-id." },
        status_code: {
          type: "number",
          description: "Mitt Coop-statuskod (t.ex. 3=Aktiv, 6=Har utgått).",
        },
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
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = serviceRoleClient();

  let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    rpc = await req.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

  // Nytt autentiseringsflöde via auth.ts utan manuell supabase-klient
  const ctx = await authenticateRequest(req);
  if (!ctx) {
    if (isNotification) return new Response(null, { status: 202, headers: corsHeaders });
    return respond(
      rpcError(rpc.id, -32001, "Ogiltig eller saknad Authorization: Bearer <token>."),
      401,
    );
  }

  if (rpc.method === "tools/list") {
    return respond(
      rpcResult(rpc.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }),
    );
  }

  if (rpc.method === "tools/call") {
    const toolName = rpc.params?.name as string | undefined;
    const args = (rpc.params?.arguments as Record<string, unknown>) ?? {};
    const tool = TOOLS.find((t) => t.name === toolName);
    if (!tool)
      return respond(
        rpcResult(rpc.id, {
          content: [{ type: "text", text: `Okänt verktyg: ${toolName}` }],
          isError: true,
        }),
      );

    try {
      const result = await tool.handler(supabase, ctx, args);
      return respond(
        rpcResult(rpc.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }),
      );
    } catch (err) {
      const message =
        err instanceof ScopeError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Internt fel.";
      return respond(
        rpcResult(rpc.id, { content: [{ type: "text", text: message }], isError: true }),
      );
    }
  }

  if (isNotification) return new Response(null, { status: 202, headers: corsHeaders });
  return respond(rpcError(rpc.id, -32601, `Okänd metod: ${rpc.method}`), 400);
});
