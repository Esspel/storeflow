import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiKeyContext, canAccessStore, hasScope } from "./auth.ts";

export class ScopeError extends Error {
  status: number;
  constructor(message: string, status = 403) { super(message); this.status = status; }
}

function requireScope(ctx: ApiKeyContext, scope: string) {
  if (!hasScope(ctx, scope)) throw new ScopeError(`Nyckeln saknar scope '${scope}'.`);
}
function requireStore(ctx: ApiKeyContext, storeId: string | null | undefined) {
  if (!canAccessStore(ctx, storeId)) throw new ScopeError("Nyckeln har inte åtkomst till denna butik.", 403);
}

// ─── Templates (mallar) ─────────────────────────────────────────────────────

export async function listTemplates(
  supabase: SupabaseClient, ctx: ApiKeyContext,
  filters: { store_id?: string; category?: string; status?: string; limit?: number } = {},
) {
  requireScope(ctx, "templates:read");
  if (filters.store_id) requireStore(ctx, filters.store_id);

  let query = supabase.from("checklist_templates")
    .select("id, title, description, category, priority, status, recurrence_rule, sap_article_id, is_global, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);

  if (filters.store_id) {
    const { data: assigned } = await supabase.from("template_stores").select("template_id").eq("store_id", filters.store_id);
    const ids = (assigned ?? []).map((r: { template_id: string }) => r.template_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  } else if (ctx.storeId) {
    // Key is store-scoped and no explicit store_id filter was given — scope automatically
    const { data: assigned } = await supabase.from("template_stores").select("template_id").eq("store_id", ctx.storeId);
    const ids = (assigned ?? []).map((r: { template_id: string }) => r.template_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) throw new ScopeError(error.message, 500);
  return data;
}

export async function getTemplate(supabase: SupabaseClient, ctx: ApiKeyContext, templateId: string) {
  requireScope(ctx, "templates:read");
  const { data: template, error } = await supabase.from("checklist_templates").select("*").eq("id", templateId).maybeSingle();
  if (error) throw new ScopeError(error.message, 500);
  if (!template) throw new ScopeError("Mallen hittades inte.", 404);

  if (ctx.storeId) {
    const { data: assignment } = await supabase.from("template_stores").select("store_id").eq("template_id", templateId).eq("store_id", ctx.storeId).maybeSingle();
    if (!assignment && !template.is_global) throw new ScopeError("Nyckeln har inte åtkomst till denna mall.", 403);
  }

  const { data: items } = await supabase.from("checklist_template_items")
    .select("id, label, requires_photo, sort_order").eq("template_id", templateId).order("sort_order");
  const { data: stores } = await supabase.from("template_stores").select("store_id").eq("template_id", templateId);

  return { ...template, items: items ?? [], store_ids: (stores ?? []).map((s: { store_id: string }) => s.store_id) };
}

export type CreateTemplateInput = {
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  recurrence_rule?: string | null;
  due_date_offset?: number | null;
  sap_article_id?: string | null;
  store_ids: string[];
  items: { label: string; requires_photo?: boolean }[];
  created_by?: string | null;
};

export async function createTemplate(supabase: SupabaseClient, ctx: ApiKeyContext, input: CreateTemplateInput) {
  requireScope(ctx, "templates:write");
  if (!input.title?.trim()) throw new ScopeError("title krävs.", 400);
  if (!input.store_ids || input.store_ids.length === 0) throw new ScopeError("store_ids krävs (minst en butik).", 400);
  for (const sid of input.store_ids) requireStore(ctx, sid);

  const { data: template, error } = await supabase.from("checklist_templates").insert({
    title: input.title.trim(),
    description: input.description ?? "",
    category: input.category ?? "",
    priority: input.priority ?? "Medel",
    recurrence_rule: input.recurrence_rule ?? null,
    due_date_offset: input.due_date_offset ?? null,
    sap_article_id: input.sap_article_id ?? null,
    created_by: input.created_by ?? null,
  }).select().single();
  if (error || !template) throw new ScopeError(error?.message ?? "Kunde inte skapa mall.", 500);

  if (input.items && input.items.length > 0) {
    const rows = input.items.map((it, i) => ({
      template_id: template.id, label: it.label, requires_photo: !!it.requires_photo, sort_order: i,
    }));
    const { error: itemsErr } = await supabase.from("checklist_template_items").insert(rows);
    if (itemsErr) throw new ScopeError(`Mall skapad men steg misslyckades: ${itemsErr.message}`, 500);
  }

  const storeRows = input.store_ids.map((store_id) => ({ template_id: template.id, store_id }));
  const { error: storesErr } = await supabase.from("template_stores").insert(storeRows);
  if (storesErr) throw new ScopeError(`Mall skapad men butikskoppling misslyckades: ${storesErr.message}`, 500);

  return await getTemplate(supabase, ctx, template.id);
}

// ─── Delivery plans (leveransplaner) ───────────────────────────────────────

export async function listDeliveryPlan(
  supabase: SupabaseClient, ctx: ApiKeyContext,
  params: { store_id: string; week_number?: number; year?: number },
) {
  requireScope(ctx, "deliveries:read");
  requireStore(ctx, params.store_id);

  let query = supabase.from("delivery_plans").select("*").eq("store_id", params.store_id)
    .order("year", { ascending: false }).order("week_number", { ascending: false });
  if (params.week_number) query = query.eq("week_number", params.week_number);
  if (params.year) query = query.eq("year", params.year);
  const { data: plans, error } = await query.limit(20);
  if (error) throw new ScopeError(error.message, 500);
  if (!plans || plans.length === 0) return [];

  const planIds = plans.map((p: { id: string }) => p.id);
  const { data: entries } = await supabase.from("delivery_entries").select("*").in("plan_id", planIds);
  return plans.map((plan: { id: string }) => ({
    ...plan,
    deliveries: (entries ?? []).filter((e: { plan_id: string }) => e.plan_id === plan.id),
  }));
}

// ─── Schedule (scheman) ─────────────────────────────────────────────────────

export async function listSchedule(
  supabase: SupabaseClient, ctx: ApiKeyContext,
  params: { store_id: string; week_number: number; year: number },
) {
  requireScope(ctx, "schedule:read");
  requireStore(ctx, params.store_id);

  const { data: imp } = await supabase.from("schedule_imports").select("*")
    .eq("store_id", params.store_id).eq("week_number", params.week_number).eq("year", params.year).maybeSingle();
  if (!imp) return { week_number: params.week_number, year: params.year, imported: false, employees: [] };

  const { data: employees } = await supabase.from("schedule_employees").select("*").eq("import_id", imp.id);
  const { data: shifts } = await supabase.from("schedule_shifts").select("*").eq("import_id", imp.id);

  return {
    week_number: params.week_number, year: params.year, imported: true, week_start_date: imp.week_start_date,
    employees: (employees ?? []).map((e: { id: string }) => ({
      ...e, shifts: (shifts ?? []).filter((s: { schedule_employee_id: string }) => s.schedule_employee_id === e.id),
    })),
  };
}

// ─── Product search (Mitt Coop-sortiment deep links) ───────────────────────
// We don't have API access to Coop's private product catalog — this builds the
// same deep-link URLs the app itself generates (src/lib/supabase.ts), so an
// agent (or a human) can open the right page directly.

export type ProductSearchInput = {
  store_id?: string;
  material_number?: string;   // known SAP article id -> direct article page
  ean?: string;
  bnr?: string;
  query?: string;             // free-text search
  category_id?: number;       // Mitt Coop category id
  status_code?: number;       // Mitt Coop status code
};

export async function searchProduct(supabase: SupabaseClient, ctx: ApiKeyContext, input: ProductSearchInput) {
  requireScope(ctx, "products:search");
  const storeId = input.store_id ?? ctx.storeId ?? undefined;
  if (storeId) requireStore(ctx, storeId);

  let siteId: string | null = null;
  if (storeId) {
    const { data: store } = await supabase.from("stores").select("sap_site_id").eq("id", storeId).maybeSingle();
    siteId = store?.sap_site_id ?? null;
  }

  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  if (input.category_id) params.set("categoryIds", String(input.category_id));
  if (input.status_code) params.set("statusCodes", String(input.status_code));

  if (input.material_number?.trim()) {
    const url = `https://mittcoop.coop.se/sortiment/articles/${input.material_number.trim()}${params.toString() ? `?${params.toString()}` : ""}`;
    return { mode: "article", url, material_number: input.material_number.trim() };
  }

  const searchTerm = input.ean?.trim() || input.bnr?.trim() || input.query?.trim();
  if (searchTerm) params.set("search", searchTerm);

  if (!searchTerm && !input.category_id && !input.status_code) {
    throw new ScopeError("Ange minst material_number, ean, bnr, query, category_id eller status_code.", 400);
  }

  const url = `https://mittcoop.coop.se/sortiment/artiklar${params.toString() ? `?${params.toString()}` : ""}`;
  return { mode: "search", url, search_term: searchTerm ?? null, category_id: input.category_id ?? null, status_code: input.status_code ?? null };
}
