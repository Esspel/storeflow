import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiKeyContext, canAccessStore, hasScope } from "./auth.ts";

export class ScopeError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

function requireScope(ctx: ApiKeyContext, scope: string) {
  if (!hasScope(ctx, scope)) throw new ScopeError(`Nyckeln saknar scope '${scope}'.`);
}
function requireStore(ctx: ApiKeyContext, storeId: string | null | undefined) {
  if (!canAccessStore(ctx, storeId))
    throw new ScopeError("Nyckeln har inte åtkomst till denna butik.", 403);
}

// Sanitize HTML from user input to prevent XSS when stored data is rendered.
// Uses a simple escape approach since DOMPurify is not a dependency.
function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── Templates (mallar) ─────────────────────────────────────────────────────

export async function listTemplates(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  filters: { store_id?: string; category?: string; status?: string; limit?: number } = {},
) {
  requireScope(ctx, "templates:read");
  if (filters.store_id) requireStore(ctx, filters.store_id);

  let query = supabase
    .from("checklist_templates")
    .select(
      "id, title, description, category, priority, status, recurrence_rule, sap_article_id, is_global, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);

  if (filters.store_id) {
    const { data: assigned } = await supabase
      .from("template_stores")
      .select("template_id")
      .eq("store_id", filters.store_id);
    const ids = (assigned ?? []).map((r: { template_id: string }) => r.template_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  } else if (ctx.storeId) {
    // Key is store-scoped and no explicit store_id filter was given — scope automatically
    const { data: assigned } = await supabase
      .from("template_stores")
      .select("template_id")
      .eq("store_id", ctx.storeId);
    const ids = (assigned ?? []).map((r: { template_id: string }) => r.template_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) throw new ScopeError(error.message, 500);
  return data;
}

export async function getTemplate(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  templateId: string,
) {
  requireScope(ctx, "templates:read");
  const { data: template, error } = await supabase
    .from("checklist_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new ScopeError(error.message, 500);
  if (!template) throw new ScopeError("Mallen hittades inte.", 404);

  if (ctx.storeId) {
    const { data: assignment } = await supabase
      .from("template_stores")
      .select("store_id")
      .eq("template_id", templateId)
      .eq("store_id", ctx.storeId)
      .maybeSingle();
    if (!assignment && !template.is_global)
      throw new ScopeError("Nyckeln har inte åtkomst till denna mall.", 403);
  }

  const { data: items } = await supabase
    .from("checklist_template_items")
    .select("id, label, requires_photo, sort_order")
    .eq("template_id", templateId)
    .order("sort_order");
  const { data: stores } = await supabase
    .from("template_stores")
    .select("store_id")
    .eq("template_id", templateId);

  return {
    ...template,
    items: items ?? [],
    store_ids: (stores ?? []).map((s: { store_id: string }) => s.store_id),
  };
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

export async function createTemplate(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: CreateTemplateInput,
) {
  requireScope(ctx, "templates:write");
  if (!input.title?.trim()) throw new ScopeError("title krävs.", 400);
  if (!input.store_ids || input.store_ids.length === 0)
    throw new ScopeError("store_ids krävs (minst en butik).", 400);
  for (const sid of input.store_ids) requireStore(ctx, sid);

  const { data: template, error } = await supabase
    .from("checklist_templates")
    .insert({
      title: input.title.trim(),
      description: input.description ?? "",
      category: input.category ?? "",
      priority: input.priority ?? "Medel",
      recurrence_rule: input.recurrence_rule ?? null,
      due_date_offset: input.due_date_offset ?? null,
      sap_article_id: input.sap_article_id ?? null,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error || !template) throw new ScopeError(error?.message ?? "Kunde inte skapa mall.", 500);

  if (input.items && input.items.length > 0) {
    const rows = input.items.map((it, i) => ({
      template_id: template.id,
      label: it.label,
      requires_photo: !!it.requires_photo,
      sort_order: i,
    }));
    const { error: itemsErr } = await supabase.from("checklist_template_items").insert(rows);
    if (itemsErr)
      throw new ScopeError(`Mall skapad men steg misslyckades: ${itemsErr.message}`, 500);
  }

  const storeRows = input.store_ids.map((store_id) => ({ template_id: template.id, store_id }));
  const { error: storesErr } = await supabase.from("template_stores").insert(storeRows);
  if (storesErr)
    throw new ScopeError(`Mall skapad men butikskoppling misslyckades: ${storesErr.message}`, 500);

  return await getTemplate(supabase, ctx, template.id);
}

export type UpdateTemplateInput = {
  template_id: string;
  title?: string;
  description?: string;
  category?: string;
  priority?: string;
  status?: string;
  recurrence_rule?: string | null;
  due_date_offset?: number | null;
  sap_article_id?: string | null;
  store_ids?: string[];
  items?: { id?: string; label: string; requires_photo?: boolean; sort_order?: number }[];
};

export async function updateTemplate(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: UpdateTemplateInput,
) {
  requireScope(ctx, "templates:write");
  if (!input.template_id) throw new ScopeError("template_id krävs.", 400);

  const existing = await getTemplate(supabase, ctx, input.template_id);
  if (!existing) throw new ScopeError("Mallen hittades inte.", 404);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description;
  if (input.category !== undefined) updates.category = input.category;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.status !== undefined) updates.status = input.status;
  if (input.recurrence_rule !== undefined) updates.recurrence_rule = input.recurrence_rule;
  if (input.due_date_offset !== undefined) updates.due_date_offset = input.due_date_offset;
  if (input.sap_article_id !== undefined) updates.sap_article_id = input.sap_article_id;

  const { error: updateErr } = await supabase
    .from("checklist_templates")
    .update(updates)
    .eq("id", input.template_id);
  if (updateErr) throw new ScopeError(`Misslyckades att uppdatera mall: ${updateErr.message}`, 500);

  if (Array.isArray(input.store_ids)) {
    for (const sid of input.store_ids) requireStore(ctx, sid);
    await supabase.from("template_stores").delete().eq("template_id", input.template_id);
    if (input.store_ids.length > 0) {
      const storeRows = input.store_ids.map((store_id) => ({
        template_id: input.template_id,
        store_id,
      }));
      const { error: sErr } = await supabase.from("template_stores").insert(storeRows);
      if (sErr)
        throw new ScopeError(
          `Uppdaterade mall men butikskoppling misslyckades: ${sErr.message}`,
          500,
        );
    }
  }

  if (Array.isArray(input.items)) {
    await supabase.from("checklist_template_items").delete().eq("template_id", input.template_id);
    if (input.items.length > 0) {
      const rows = input.items.map((it, i) => ({
        template_id: input.template_id,
        label: it.label,
        requires_photo: !!it.requires_photo,
        sort_order: it.sort_order ?? i,
      }));
      const { error: iErr } = await supabase.from("checklist_template_items").insert(rows);
      if (iErr)
        throw new ScopeError(`Uppdaterade mall men steg misslyckades: ${iErr.message}`, 500);
    }
  }

  return await getTemplate(supabase, ctx, input.template_id);
}

// ─── Uppgifter (Tasks) ──────────────────────────────────────────────────────

export async function listTasks(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  filters: {
    store_id?: string;
    status?: string;
    category?: string;
    assigned_to?: string;
    due_date?: string;
    limit?: number;
  } = {},
) {
  requireScope(ctx, "tasks:read");
  if (filters.store_id) requireStore(ctx, filters.store_id);

  let query = supabase
    .from("tasks")
    .select(
      "id, title, description, category, priority, status, store_id, assigned_to, created_by, due_date, due_date_time, completed_at, sap_article_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));

  if (filters.store_id) {
    query = query.eq("store_id", filters.store_id);
  } else if (ctx.storeId) {
    query = query.eq("store_id", ctx.storeId);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.assigned_to) query = query.eq("assigned_to", filters.assigned_to);
  if (filters.due_date) query = query.eq("due_date", filters.due_date);

  const { data, error } = await query;
  if (error) throw new ScopeError(error.message, 500);
  return data;
}

export async function getTask(supabase: SupabaseClient, ctx: ApiKeyContext, taskId: string) {
  requireScope(ctx, "tasks:read");
  const { data: task, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new ScopeError(error.message, 500);
  if (!task) throw new ScopeError("Uppgiften hittades inte.", 404);

  if (task.store_id) requireStore(ctx, task.store_id);

  const { data: steps } = await supabase
    .from("task_steps")
    .select("id, label, is_done, requires_photo, sort_order")
    .eq("task_id", taskId)
    .order("sort_order");

  const { data: questions } = await supabase
    .from("task_questions")
    .select("id, label, answer, question_type, is_required, sort_order")
    .eq("task_id", taskId)
    .order("sort_order");

  return { ...task, steps: steps ?? [], questions: questions ?? [] };
}

export type CreateTaskInput = {
  title: string;
  description?: string;
  category?: string;
  priority?: "Låg" | "Medel" | "Hög" | "Kritisk";
  status?: "todo" | "progress" | "done" | "late" | "cancelled";
  store_id?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  due_date?: string | null;
  due_date_time?: string | null;
  recurring?: string | null;
  recurrence_rule?: string | null;
  sap_article_id?: string | null;
  steps?: { label: string; requires_photo?: boolean }[];
  questions?: { label: string; question_type?: "text" | "yes_no"; is_required?: boolean }[];
};

export async function createTask(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: CreateTaskInput,
) {
  requireScope(ctx, "tasks:write");
  if (!input.title?.trim()) throw new ScopeError("title krävs.", 400);

  const targetStoreId = input.store_id ?? ctx.storeId;
  if (targetStoreId) requireStore(ctx, targetStoreId);

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title.trim(),
      description: input.description ?? "",
      category: input.category ?? "Allmänt",
      priority: input.priority ?? "Medel",
      status: input.status ?? "todo",
      store_id: targetStoreId ?? null,
      assigned_to: input.assigned_to ?? null,
      created_by: input.created_by ?? null,
      due_date: input.due_date ?? null,
      due_date_time: input.due_date_time ?? null,
      recurring: input.recurring ?? null,
      recurrence_rule: input.recurrence_rule ?? null,
      sap_article_id: input.sap_article_id ?? null,
    })
    .select()
    .single();

  if (error || !task) throw new ScopeError(error?.message ?? "Kunde inte skapa uppgift.", 500);

  if (input.steps && input.steps.length > 0) {
    const stepRows = input.steps.map((st, i) => ({
      task_id: task.id,
      label: st.label,
      requires_photo: !!st.requires_photo,
      sort_order: i,
    }));
    const { error: stepErr } = await supabase.from("task_steps").insert(stepRows);
    if (stepErr)
      throw new ScopeError(`Uppgift skapad men steg misslyckades: ${stepErr.message}`, 500);
  }

  if (input.questions && input.questions.length > 0) {
    const qRows = input.questions.map((q, i) => ({
      task_id: task.id,
      label: q.label,
      question_type: q.question_type ?? "text",
      is_required: !!q.is_required,
      sort_order: i,
    }));
    const { error: qErr } = await supabase.from("task_questions").insert(qRows);
    if (qErr) throw new ScopeError(`Uppgift skapad men frågor misslyckades: ${qErr.message}`, 500);
  }

  return await getTask(supabase, ctx, task.id);
}

export type UpdateTaskInput = {
  task_id: string;
  title?: string;
  description?: string;
  category?: string;
  priority?: "Låg" | "Medel" | "Hög" | "Kritisk";
  status?: "todo" | "progress" | "done" | "late" | "cancelled";
  assigned_to?: string | null;
  due_date?: string | null;
  due_date_time?: string | null;
  completed_at?: string | null;
  steps?: { id?: string; label?: string; is_done?: boolean; requires_photo?: boolean }[];
};

export async function updateTask(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: UpdateTaskInput,
) {
  requireScope(ctx, "tasks:write");
  if (!input.task_id) throw new ScopeError("task_id krävs.", 400);

  const existing = await getTask(supabase, ctx, input.task_id);
  if (!existing) throw new ScopeError("Uppgiften hittades inte.", 404);

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description;
  if (input.category !== undefined) updates.category = input.category;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === "done" && !input.completed_at && !existing.completed_at) {
      updates.completed_at = new Date().toISOString();
    }
  }
  if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to;
  if (input.due_date !== undefined) updates.due_date = input.due_date;
  if (input.due_date_time !== undefined) updates.due_date_time = input.due_date_time;
  if (input.completed_at !== undefined) updates.completed_at = input.completed_at;

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", input.task_id);
    if (updateErr)
      throw new ScopeError(`Misslyckades att uppdatera uppgift: ${updateErr.message}`, 500);
  }

  if (Array.isArray(input.steps)) {
    for (const st of input.steps) {
      if (st.id) {
        const stepUpdates: Record<string, unknown> = {};
        if (st.is_done !== undefined) stepUpdates.is_done = st.is_done;
        if (st.label !== undefined) stepUpdates.label = st.label;
        if (st.requires_photo !== undefined) stepUpdates.requires_photo = st.requires_photo;
        if (Object.keys(stepUpdates).length > 0) {
          await supabase
            .from("task_steps")
            .update(stepUpdates)
            .eq("id", st.id)
            .eq("task_id", input.task_id);
        }
      }
    }
  }

  return await getTask(supabase, ctx, input.task_id);
}

// ─── Kundönskemål (Customer Requests) ───────────────────────────────────────

export async function listCustomerRequests(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  filters: {
    store_id?: string;
    status?: string;
    priority?: string;
    query?: string;
    limit?: number;
  } = {},
) {
  requireScope(ctx, "customer_requests:read");
  if (filters.store_id) requireStore(ctx, filters.store_id);

  let query = supabase
    .from("customer_requests")
    .select(
      "id, store_id, product_name, article_number, notes, internal_notes, staff_comment, source, requested_by, status, priority, mitt_coop_category_id, mitt_coop_status_code, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));

  if (filters.store_id) {
    query = query.eq("store_id", filters.store_id);
  } else if (ctx.storeId) {
    query = query.eq("store_id", ctx.storeId);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.query) {
    query = query.or(
      `product_name.ilike.%${filters.query}%,notes.ilike.%${filters.query}%,article_number.ilike.%${filters.query}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new ScopeError(error.message, 500);
  return data;
}

export async function getCustomerRequest(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  requestId: string,
) {
  requireScope(ctx, "customer_requests:read");
  const { data: request, error } = await supabase
    .from("customer_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new ScopeError(error.message, 500);
  if (!request) throw new ScopeError("Kundönskemålet hittades inte.", 404);

  if (request.store_id) requireStore(ctx, request.store_id);
  return request;
}

export type CreateCustomerRequestInput = {
  store_id: string;
  product_name: string;
  article_number?: string | null;
  notes?: string | null;
  priority?: "low" | "normal" | "high";
  status?: "open" | "ordered" | "declined" | "fulfilled";
  requested_by?: string | null;
  source?: string | null;
  mitt_coop_category_id?: number | null;
  mitt_coop_status_code?: number | null;
};

export async function createCustomerRequest(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: CreateCustomerRequestInput,
) {
  requireScope(ctx, "customer_requests:write");
  if (!input.store_id) throw new ScopeError("store_id krävs.", 400);
  if (!input.product_name?.trim()) throw new ScopeError("product_name krävs.", 400);
  requireStore(ctx, input.store_id);

  const sanitizedNotes = input.notes ? htmlEscape(input.notes) : null;

  const { data: request, error } = await supabase
    .from("customer_requests")
    .insert({
      store_id: input.store_id,
      product_name: input.product_name.trim(),
      article_number: input.article_number ?? null,
      notes: sanitizedNotes,
      priority: input.priority ?? "normal",
      status: input.status ?? "open",
      requested_by: input.requested_by ?? null,
      source: input.source ?? "mcp",
      mitt_coop_category_id: input.mitt_coop_category_id ?? null,
      mitt_coop_status_code: input.mitt_coop_status_code ?? null,
    })
    .select()
    .single();

  if (error || !request)
    throw new ScopeError(error?.message ?? "Kunde inte skapa kundönskemål.", 500);
  return request;
}

export type UpdateCustomerRequestInput = {
  request_id: string;
  status?: "open" | "ordered" | "declined" | "fulfilled";
  staff_comment?: string | null;
  internal_notes?: string | null;
  priority?: "low" | "normal" | "high";
  product_name?: string;
  article_number?: string | null;
  notes?: string | null;
};

export async function updateCustomerRequest(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: UpdateCustomerRequestInput,
) {
  requireScope(ctx, "customer_requests:write");
  if (!input.request_id) throw new ScopeError("request_id krävs.", 400);

  const existing = await getCustomerRequest(supabase, ctx, input.request_id);
  if (!existing) throw new ScopeError("Kundönskemålet hittades inte.", 404);

  const updates: Record<string, unknown> = {};
  if (input.status !== undefined) updates.status = input.status;
  if (input.staff_comment !== undefined) updates.staff_comment = input.staff_comment ? htmlEscape(input.staff_comment) : null;
  if (input.internal_notes !== undefined) updates.internal_notes = input.internal_notes;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.product_name !== undefined) updates.product_name = input.product_name.trim();
  if (input.article_number !== undefined) updates.article_number = input.article_number;
  if (input.notes !== undefined) updates.notes = input.notes ? htmlEscape(input.notes) : null;

  const { error } = await supabase
    .from("customer_requests")
    .update(updates)
    .eq("id", input.request_id);
  if (error) throw new ScopeError(`Misslyckades att uppdatera kundönskemål: ${error.message}`, 500);

  return await getCustomerRequest(supabase, ctx, input.request_id);
}

// ─── Kundrundor (Customer Rounds) ───────────────────────────────────────────

export async function listCustomerRounds(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  filters: { store_id?: string; status?: string; limit?: number } = {},
) {
  requireScope(ctx, "customer_rounds:read");
  if (filters.store_id) requireStore(ctx, filters.store_id);

  let query = supabase
    .from("kundrunda_sessions")
    .select(
      "id, store_id, conducted_by, started_at, completed_at, status, total_score, max_score, version, created_at",
    )
    .order("started_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 100));

  if (filters.store_id) {
    query = query.eq("store_id", filters.store_id);
  } else if (ctx.storeId) {
    query = query.eq("store_id", ctx.storeId);
  }

  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new ScopeError(error.message, 500);
  return data;
}

export async function getCustomerRound(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  sessionId: string,
) {
  requireScope(ctx, "customer_rounds:read");
  const { data: session, error } = await supabase
    .from("kundrunda_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new ScopeError(error.message, 500);
  if (!session) throw new ScopeError("Kundrundan hittades inte.", 404);

  if (session.store_id) requireStore(ctx, session.store_id);

  const { data: responses } = await supabase
    .from("kundrunda_responses")
    .select(
      "id, session_id, checkpoint_id, zone_id, result, defect_description, action_taken, responsible_user_id, sap_article_id, created_task_id, incident_id, created_at",
    )
    .eq("session_id", sessionId);

  return { ...session, responses: responses ?? [] };
}

// ─── Avvikelser (Deviations / Incidents) ───────────────────────────────────

export async function listDeviations(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  filters: {
    store_id?: string;
    status?: string;
    priority?: string;
    category?: string;
    query?: string;
    limit?: number;
  } = {},
) {
  requireScope(ctx, "deviations:read");
  if (filters.store_id) requireStore(ctx, filters.store_id);

  let query = supabase
    .from("incidents")
    .select(
      "id, ref_number, title, description, category, store_id, reported_by, assigned_to, responsible_user_id, priority, status, sla_deadline, resolved_at, has_photo, sap_article_id, source, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));

  if (filters.store_id) {
    query = query.eq("store_id", filters.store_id);
  } else if (ctx.storeId) {
    query = query.eq("store_id", ctx.storeId);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.query) {
    query = query.or(
      `title.ilike.%${filters.query}%,description.ilike.%${filters.query}%,ref_number.ilike.%${filters.query}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new ScopeError(error.message, 500);
  return data;
}

export async function getDeviation(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  deviationId: string,
) {
  requireScope(ctx, "deviations:read");
  const { data: incident, error } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", deviationId)
    .maybeSingle();
  if (error) throw new ScopeError(error.message, 500);
  if (!incident) throw new ScopeError("Avvikelsen hittades inte.", 404);

  if (incident.store_id) requireStore(ctx, incident.store_id);

  const { data: comments } = await supabase
    .from("incident_comments")
    .select("id, author_id, content, created_at")
    .eq("incident_id", deviationId)
    .order("created_at");

  return { ...incident, comments: comments ?? [] };
}

export type CreateDeviationInput = {
  title: string;
  description?: string;
  category?: string;
  store_id?: string | null;
  reported_by?: string | null;
  assigned_to?: string | null;
  responsible_user_id?: string | null;
  priority?: "Låg" | "Medel" | "Hög" | "Kritisk";
  status?: "open" | "in_progress" | "escalated" | "resolved" | "closed";
  sap_article_id?: string | null;
  source?: string | null;
};

export async function createDeviation(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: CreateDeviationInput,
) {
  requireScope(ctx, "deviations:write");
  if (!input.title?.trim()) throw new ScopeError("title krävs.", 400);

  const targetStoreId = input.store_id ?? ctx.storeId;
  if (targetStoreId) requireStore(ctx, targetStoreId);

  const refNumber = `INC-${Date.now().toString().slice(-6)}`;
  const { data: incident, error } = await supabase
    .from("incidents")
    .insert({
      ref_number: refNumber,
      title: input.title.trim(),
      description: input.description ?? "",
      category: input.category ?? "Övrigt",
      store_id: targetStoreId ?? null,
      reported_by: input.reported_by ?? null,
      assigned_to: input.assigned_to ?? null,
      responsible_user_id: input.responsible_user_id ?? null,
      priority: input.priority ?? "Medel",
      status: input.status ?? "open",
      sap_article_id: input.sap_article_id ?? null,
      source: input.source ?? "mcp",
    })
    .select()
    .single();

  if (error || !incident)
    throw new ScopeError(error?.message ?? "Kunde inte skapa avvikelse.", 500);
  return incident;
}

export type UpdateDeviationInput = {
  deviation_id: string;
  title?: string;
  description?: string;
  priority?: "Låg" | "Medel" | "Hög" | "Kritisk";
  status?: "open" | "in_progress" | "escalated" | "resolved" | "closed";
  assigned_to?: string | null;
  responsible_user_id?: string | null;
  resolved_at?: string | null;
};

export async function updateDeviation(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: UpdateDeviationInput,
) {
  requireScope(ctx, "deviations:write");
  if (!input.deviation_id) throw new ScopeError("deviation_id krävs.", 400);

  const existing = await getDeviation(supabase, ctx, input.deviation_id);
  if (!existing) throw new ScopeError("Avvikelsen hittades inte.", 404);

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.status !== undefined) {
    updates.status = input.status;
    if (
      (input.status === "resolved" || input.status === "closed") &&
      !input.resolved_at &&
      !existing.resolved_at
    ) {
      updates.resolved_at = new Date().toISOString();
    }
  }
  if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to;
  if (input.responsible_user_id !== undefined)
    updates.responsible_user_id = input.responsible_user_id;
  if (input.resolved_at !== undefined) updates.resolved_at = input.resolved_at;

  const { error } = await supabase.from("incidents").update(updates).eq("id", input.deviation_id);
  if (error) throw new ScopeError(`Misslyckades att uppdatera avvikelse: ${error.message}`, 500);

  return await getDeviation(supabase, ctx, input.deviation_id);
}

// ─── Butiksregister (Store Registry / Stores) ───────────────────────────────

export async function listStores(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  filters: { is_active?: boolean; region?: string; query?: string; limit?: number } = {},
) {
  requireScope(ctx, "stores:read");

  let query = supabase.from("stores").select("*").order("name");

  if (ctx.storeId) {
    query = query.eq("id", ctx.storeId);
  } else {
    if (filters.is_active !== undefined) query = query.eq("is_active", filters.is_active);
    if (filters.region) query = query.eq("region", filters.region);
    if (filters.query) {
      query = query.or(
        `name.ilike.%${filters.query}%,city.ilike.%${filters.query}%,butiks_nr.ilike.%${filters.query}%,koncept.ilike.%${filters.query}%`,
      );
    }
    query = query.limit(Math.min(filters.limit ?? 100, 200));
  }

  const { data, error } = await query;
  if (error) throw new ScopeError(error.message, 500);
  return data;
}

export async function getStore(supabase: SupabaseClient, ctx: ApiKeyContext, storeId: string) {
  requireScope(ctx, "stores:read");
  requireStore(ctx, storeId);

  const { data: store, error } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw new ScopeError(error.message, 500);
  if (!store) throw new ScopeError("Butiken hittades inte.", 404);

  return store;
}

// ─── Mallpaket (Template Packages) ──────────────────────────────────────────

export async function listTemplatePackages(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  filters: { store_id?: string; limit?: number } = {},
) {
  requireScope(ctx, "template_packages:read");
  if (filters.store_id) requireStore(ctx, filters.store_id);

  let query = supabase
    .from("template_packages")
    .select("id, name, description, store_id, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 100));

  if (filters.store_id) {
    query = query.eq("store_id", filters.store_id);
  } else if (ctx.storeId) {
    query = query.eq("store_id", ctx.storeId);
  }

  const { data, error } = await query;
  if (error) throw new ScopeError(error.message, 500);
  return data;
}

export async function getTemplatePackage(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  packageId: string,
) {
  requireScope(ctx, "template_packages:read");
  const { data: pkg, error } = await supabase
    .from("template_packages")
    .select("*")
    .eq("id", packageId)
    .maybeSingle();
  if (error) throw new ScopeError(error.message, 500);
  if (!pkg) throw new ScopeError("Mallpaketet hittades inte.", 404);

  if (pkg.store_id) requireStore(ctx, pkg.store_id);

  const { data: items } = await supabase
    .from("template_package_items")
    .select("id, package_id, template_id, sort_order")
    .eq("package_id", packageId)
    .order("sort_order");

  return { ...pkg, items: items ?? [] };
}

export type CreateTemplatePackageInput = {
  name: string;
  description?: string;
  store_id?: string | null;
  created_by?: string | null;
  template_ids: string[];
};

export async function createTemplatePackage(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: CreateTemplatePackageInput,
) {
  requireScope(ctx, "template_packages:write");
  if (!input.name?.trim()) throw new ScopeError("name krävs.", 400);

  const targetStoreId = input.store_id ?? ctx.storeId;
  if (targetStoreId) requireStore(ctx, targetStoreId);

  const { data: pkg, error } = await supabase
    .from("template_packages")
    .insert({
      name: input.name.trim(),
      description: input.description ?? "",
      store_id: targetStoreId ?? null,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();

  if (error || !pkg) throw new ScopeError(error?.message ?? "Kunde inte skapa mallpaket.", 500);

  if (input.template_ids && input.template_ids.length > 0) {
    const itemRows = input.template_ids.map((template_id, i) => ({
      package_id: pkg.id,
      template_id,
      sort_order: i,
    }));
    const { error: itemErr } = await supabase.from("template_package_items").insert(itemRows);
    if (itemErr)
      throw new ScopeError(
        `Mallpaket skapat men mallkopplingar misslyckades: ${itemErr.message}`,
        500,
      );
  }

  return await getTemplatePackage(supabase, ctx, pkg.id);
}

export type UpdateTemplatePackageInput = {
  package_id: string;
  name?: string;
  description?: string;
  store_id?: string | null;
  template_ids?: string[];
};

export async function updateTemplatePackage(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: UpdateTemplatePackageInput,
) {
  requireScope(ctx, "template_packages:write");
  if (!input.package_id) throw new ScopeError("package_id krävs.", 400);

  const existing = await getTemplatePackage(supabase, ctx, input.package_id);
  if (!existing) throw new ScopeError("Mallpaketet hittades inte.", 404);

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description;
  if (input.store_id !== undefined) updates.store_id = input.store_id;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("template_packages")
      .update(updates)
      .eq("id", input.package_id);
    if (error) throw new ScopeError(`Misslyckades att uppdatera mallpaket: ${error.message}`, 500);
  }

  if (Array.isArray(input.template_ids)) {
    await supabase.from("template_package_items").delete().eq("package_id", input.package_id);
    if (input.template_ids.length > 0) {
      const itemRows = input.template_ids.map((template_id, i) => ({
        package_id: input.package_id,
        template_id,
        sort_order: i,
      }));
      const { error: itemErr } = await supabase.from("template_package_items").insert(itemRows);
      if (itemErr)
        throw new ScopeError(
          `Uppdaterade mallpaket men mallkopplingar misslyckades: ${itemErr.message}`,
          500,
        );
    }
  }

  return await getTemplatePackage(supabase, ctx, input.package_id);
}

// ─── Delivery plans (leveransplaner) ───────────────────────────────────────

export async function listDeliveryPlan(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  params: { store_id: string; week_number?: number; year?: number },
) {
  requireScope(ctx, "deliveries:read");
  requireStore(ctx, params.store_id);

  let query = supabase
    .from("delivery_plans")
    .select("*")
    .eq("store_id", params.store_id)
    .order("year", { ascending: false })
    .order("week_number", { ascending: false });
  if (params.week_number) query = query.eq("week_number", params.week_number);
  if (params.year) query = query.eq("year", params.year);
  const { data: plans, error } = await query.limit(20);
  if (error) throw new ScopeError(error.message, 500);
  if (!plans || plans.length === 0) return [];

  const planIds = plans.map((p: { id: string }) => p.id);
  const { data: entries } = await supabase
    .from("delivery_entries")
    .select("*")
    .in("plan_id", planIds);
  return plans.map((plan: { id: string }) => ({
    ...plan,
    deliveries: (entries ?? []).filter((e: { plan_id: string }) => e.plan_id === plan.id),
  }));
}

// ─── Schedule (scheman) ─────────────────────────────────────────────────────

export async function listSchedule(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  params: { store_id: string; week_number: number; year: number },
) {
  requireScope(ctx, "schedule:read");
  requireStore(ctx, params.store_id);

  const { data: imp } = await supabase
    .from("schedule_imports")
    .select("*")
    .eq("store_id", params.store_id)
    .eq("week_number", params.week_number)
    .eq("year", params.year)
    .maybeSingle();
  if (!imp)
    return { week_number: params.week_number, year: params.year, imported: false, employees: [] };

  const { data: employees } = await supabase
    .from("schedule_employees")
    .select("*")
    .eq("import_id", imp.id);
  const { data: shifts } = await supabase
    .from("schedule_shifts")
    .select("*")
    .eq("import_id", imp.id);

  return {
    week_number: params.week_number,
    year: params.year,
    imported: true,
    week_start_date: imp.week_start_date,
    employees: (employees ?? []).map((e: { id: string }) => ({
      ...e,
      shifts: (shifts ?? []).filter(
        (s: { schedule_employee_id: string }) => s.schedule_employee_id === e.id,
      ),
    })),
  };
}

// ─── Product search (Mitt Coop-sortiment deep links) ───────────────────────

export type ProductSearchInput = {
  store_id?: string;
  material_number?: string;
  ean?: string;
  bnr?: string;
  query?: string;
  category_id?: number;
  status_code?: number;
};

export async function searchProduct(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: ProductSearchInput,
) {
  requireScope(ctx, "products:search");
  const storeId = input.store_id ?? ctx.storeId ?? undefined;
  if (storeId) requireStore(ctx, storeId);

  let siteId: string | null = null;
  if (storeId) {
    const { data: store } = await supabase
      .from("stores")
      .select("sap_site_id")
      .eq("id", storeId)
      .maybeSingle();
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
    throw new ScopeError(
      "Ange minst material_number, ean, bnr, query, category_id eller status_code.",
      400,
    );
  }

  const url = `https://mittcoop.coop.se/sortiment/artiklar${params.toString() ? `?${params.toString()}` : ""}`;
  return {
    mode: "search",
    url,
    search_term: searchTerm ?? null,
    category_id: input.category_id ?? null,
    status_code: input.status_code ?? null,
  };
}

// ─── Shelf Life Tools (Hållbarhetsdatum) ─────────────────────────────────────

export type SetShelfLifeInput = {
  sap_article_id: string;
  shelf_lifetime_days: number;
  expiry_date: string;
  arrival_date: string;
  compensation_price_ore?: number;
};

export async function setShelfLifeHandler(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: SetShelfLifeInput,
) {
  requireScope(ctx, "products:write");

  const { sap_article_id, shelf_lifetime_days, expiry_date, arrival_date, compensation_price_ore } =
    input;

  if (!sap_article_id) throw new ScopeError("sap_article_id is required", 400);
  if (shelf_lifetime_days == null || expiry_date == null || arrival_date == null) {
    throw new ScopeError("shelf_lifetime_days, expiry_date, and arrival_date are required", 400);
  }

  const expiry = new Date(expiry_date);
  const arrival = new Date(arrival_date);

  if (expiry <= arrival) {
    throw new ScopeError("expiry_date must be after arrival_date", 400);
  }

  // Uppdatera eller skapa post
  const { data: existing, error: existingError } = await supabase
    .from("product_shelf_life")
    .select("id")
    .eq("sap_article_id", sap_article_id)
    .single();

  if (existing) {
    // Uppdatera befintlig post
    const { error: updateError } = await supabase
      .from("product_shelf_life")
      .update({
        shelf_lifetime_days,
        expiry_date: expiry,
        arrival_date: arrival,
        compensation_price_ore: compensation_price_ore ?? 2,
        updated_at: new Date().toISOString(),
      })
      .eq("sap_article_id", sap_article_id)
      .eq("id", existing.id);

    if (updateError) throw updateError;
  } else {
    // Skapa ny post
    const { error: insertError } = await supabase.from("product_shelf_life").insert({
      sap_article_id,
      shelf_lifetime_days,
      expiry_date: expiry,
      arrival_date: arrival,
      compensation_price_ore: compensation_price_ore ?? 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertError) throw insertError;
  }

  return { success: true };
}

export async function calculateShelfLifeRulesHandler(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: { sap_article_id: string },
) {
  requireScope(ctx, "products:read");

  const { sap_article_id } = input;

  if (!sap_article_id) throw new ScopeError("sap_article_id is required", 400);

  // Hämta shelf life data
  const { data: shelfLife, error: fetchError } = await supabase
    .from("product_shelf_life")
    .select("shelf_lifetime_days, expiry_date, arrival_date")
    .eq("sap_article_id", sap_article_id)
    .single();

  if (fetchError) {
    throw new ScopeError("Failed to fetch shelf life data", 404);
  }

  const { shelf_lifetime_days, expiry_date, arrival_date } = shelfLife;

  // Beräkna kvarvarande dagar
  const arrivalDate = new Date(arrival_date);
  const expiryDate = new Date(expiry_date);
  const daysRemaining = Math.floor((expiryDate - arrivalDate) / (1000 * 60 * 60 * 24));

  // Beräkna minsta kravda hållbarhet
  let minRequiredDays;
  if (shelf_lifetime_days <= 548) {
    // 18 månader ≈ 548 dagar
    minRequiredDays = Math.ceil(shelf_lifetime_days * 0.5);
  } else {
    minRequiredDays = 274; // 9 månader
  }

  const isFlagged = daysRemaining < minRequiredDays;

  return {
    shelf_lifetime_days,
    expiry_date,
    arrival_date,
    days_remaining: daysRemaining,
    min_required_days: minRequiredDays,
    is_flagged: isFlagged,
  };
}

export async function getShelfLifeForProductsHandler(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: { sap_article_ids: string[] },
) {
  requireScope(ctx, "products:read");

  const { sap_article_ids } = input;
  if (!sap_article_ids || sap_article_ids.length === 0) {
    throw new ScopeError("sap_article_ids is required", 400);
  }

  const { data, error } = await supabase
    .from("product_shelf_life")
    .select(
      "sap_article_id, shelf_lifetime_days, expiry_date, arrival_date, compensation_price_ore",
    )
    .in("sap_article_id", sap_article_ids);

  if (error) throw error;

  // Beräkna status för varje produkt
  const result = (data || []).map(
    (record: {
      sap_article_id: string;
      shelf_lifetime_days: number;
      expiry_date: string;
      arrival_date: string;
      compensation_price_ore: number;
    }) => {
      const arrival = new Date(record.arrival_date);
      const expiry = new Date(record.expiry_date);
      const daysRemaining = Math.floor(
        (expiry.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24),
      );

      let minRequired: number;
      if (record.shelf_lifetime_days <= 548) {
        minRequired = Math.ceil(record.shelf_lifetime_days * 0.5);
      } else {
        minRequired = 274;
      }

      const isFlagged = daysRemaining < minRequired;

      return {
        sap_article_id: record.sap_article_id,
        shelf_lifetime_days: record.shelf_lifetime_days,
        expiry_date: record.expiry_date,
        arrival_date: record.arrival_date,
        days_remaining: daysRemaining,
        min_required_days: minRequired,
        is_flagged: isFlagged,
        compensation_price_ore: record.compensation_price_ore,
      };
    },
  );

  return result;
}

export async function generateShelfLifeZipHandler(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: { store_id?: string },
) {
  requireScope(ctx, "products:read");
  if (input.store_id) requireStore(ctx, input.store_id);

  // Hämta alla produkter med shelf life data
  const { data: shelfLifeData, error: fetchError } = await supabase
    .from("product_shelf_life")
    .select(
      "sap_article_id, shelf_lifetime_days, expiry_date, arrival_date, compensation_price_ore",
    )
    .order("arrival_date", { ascending: false });

  if (fetchError) throw fetchError;

  // Hämta produktspecifik info (namn, EAN, BNR) från products-tabellen
  const sapArticleIds = shelfLifeData.map((p) => p.sap_article_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, ean, bnr, sap_article_id, store_id")
    .in("sap_article_id", sapArticleIds);

  // Bygg en map för snabb uppslagning
  const productMap = new Map<string, (typeof products)[0]>();
  products?.forEach((p) => productMap.set(p.sap_article_id, p));

  // Flagga produkter som omfattas av regelverket
  const flaggedProducts: any[] = [];

  for (const shelfLife of shelfLifeData) {
    const product = productMap.get(shelfLife.sap_article_id);
    if (!product) continue; // Hoppa om produkt inte finns i butiken

    const { shelf_lifetime_days, expiry_date, arrival_date } = shelfLife;

    const arrivalDate = new Date(arrival_date);
    const expiryDate = new Date(expiry_date);
    const daysRemaining = Math.floor((expiryDate - arrivalDate) / (1000 * 60 * 60 * 24));

    let minRequiredDays;
    if (shelf_lifetime_days <= 548) {
      minRequiredDays = Math.ceil(shelf_lifetime_days * 0.5);
    } else {
      minRequiredDays = 274;
    }

    const isFlagged = daysRemaining < minRequiredDays;

    if (isFlagged) {
      flaggedProducts.push({
        sap_article_id: shelfLife.sap_article_id,
        product_name: product.name,
        ean: product.ean,
        bnr: product.bnr,
        expiry_date: expiry_date,
        arrival_date: arrival_date,
        shelf_lifetime_days,
        days_remaining: daysRemaining,
        min_required_days: minRequiredDays,
        compensation_price_ore: shelfLife.compensation_price_ore,
        reason:
          daysRemaining < minRequiredDays
            ? `Kvarvarande ${daysRemaining} dagar < minsta ${minRequiredDays} dagar (total hållbarhet ${shelf_lifetime_days} dagar)`
            : "",
      });
    }
  }

  // Skapa CSV-innehåll för zip-filen
  const csvHeaders = [
    "BNR",
    "EAN",
    "SAP-produktnr",
    "Produktnamn",
    "Utgangsdatum",
    "Leveransdatum",
    "Total hållbarhet (dagar)",
    "Kvarvarande dagar",
    "Minsta krävda dagar",
    "Ersättningspris (öre)",
    "Orsak",
  ];

  const csvRows = flaggedProducts.map((p) => [
    p.bnr || "",
    p.ean || "",
    p.sap_article_id,
    p.product_name,
    new Date(p.expiry_date).toISOString().split("T")[0],
    new Date(p.arrival_date).toISOString().split("T")[0],
    p.shelf_lifetime_days,
    p.days_remaining,
    p.min_required_days,
    p.compensation_price_ore,
    p.reason,
  ]);

  const csvContent = [csvHeaders.join(";"), ...csvRows.map((row) => row.join(";"))].join("\n");

  // Lägg till BOM för Excel-kompatibilitet
  const csvWithBom = "﻿" + csvContent;

  // Returnera som base64-kodad sträng (zip-generering skulle kunna göras här med en zip-bibliotek)
  // Förnu returnerar vi CSV-data som kan användas för att skapa zip-fil klientsidan
  return {
    flagged_count: flaggedProducts.length,
    total_checked: shelfLifeData.length,
    csv_data: csvWithBom,
  };
}

/**
 * Gruppar flaggade produkter efter leveransnummer och temperaturzon
 * Används för zip-filorganisation: en fil per leverans+zon
 */
export async function groupShelfLifeByDeliveryHandler(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: { store_id: string },
) {
  requireScope(ctx, "products:read");
  requireStore(ctx, input.store_id);

  // Hämta alla produkter med shelf life data för butiken
  const { data: shelfLifeData, error: fetchError } = await supabase
    .from("product_shelf_life")
    .select(
      "sap_article_id, shelf_lifetime_days, expiry_date, arrival_date, compensation_price_ore, delivery_number, temperature_zone",
    )
    .eq("store_id", input.store_id)
    .order("arrival_date", { ascending: false });

  if (fetchError) throw fetchError;

  // Hämta produktspecifik info
  const sapArticleIds = shelfLifeData.map((p) => p.sap_article_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, ean, bnr, sap_article_id, store_id")
    .in("sap_article_id", sapArticleIds);

  const productMap = new Map<string, (typeof products)[0]>();
  products?.forEach((p) => productMap.set(p.sap_article_id, p));

  // Flagga produkter som omfattas av regelverket
  const flaggedProducts: any[] = [];

  for (const shelfLife of shelfLifeData) {
    const product = productMap.get(shelfLife.sap_article_id);
    if (!product) continue;

    const { shelf_lifetime_days, expiry_date, arrival_date } = shelfLife;

    const arrivalDate = new Date(arrival_date);
    const expiryDate = new Date(expiry_date);
    const daysRemaining = Math.floor((expiryDate - arrivalDate) / (1000 * 60 * 60 * 24));

    let minRequiredDays;
    if (shelf_lifetime_days <= 548) {
      minRequiredDays = Math.ceil(shelf_lifetime_days * 0.5);
    } else {
      minRequiredDays = 274;
    }

    const isFlagged = daysRemaining < minRequiredDays;

    if (isFlagged) {
      flaggedProducts.push({
        sap_article_id: shelfLife.sap_article_id,
        product_name: product.name,
        ean: product.ean,
        bnr: product.bnr,
        expiry_date: expiry_date,
        arrival_date: arrival_date,
        shelf_lifetime_days,
        days_remaining: daysRemaining,
        min_required_days: minRequiredDays,
        compensation_price_ore: shelfLife.compensation_price_ore,
        delivery_number: shelfLife.delivery_number || "OKÄND",
        temperature_zone: shelfLife.temperature_zone || "torr",
        reason: `Kvarvarande ${daysRemaining} dagar < minsta ${minRequiredDays} dagar (total hållbarhet ${shelf_lifetime_days} dagar)`,
      });
    }
  }

  // Gruppera efter leveransnummer + temperaturzon
  const grouped = new Map<string, any[]>();
  for (const p of flaggedProducts) {
    const key = `${p.delivery_number}_${p.temperature_zone}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  // Bygg CSV för varje grupp
  const csvHeaders = [
    "BNR",
    "EAN",
    "SAP-produktnr",
    "Produktnamn",
    "Utgangsdatum",
    "Leveransdatum",
    "Total hållbarhet (dagar)",
    "Kvarvarande dagar",
    "Minsta krävda dagar",
    "Ersättningspris (öre)",
    "Orsak",
    "Leveransnummer",
    "Temperaturzon",
  ];

  const groups: Record<string, { csv: string; count: number }> = {};

  for (const [key, products] of grouped.entries()) {
    const csvRows = products.map((p) => [
      p.bnr || "",
      p.ean || "",
      p.sap_article_id,
      p.product_name,
      p.expiry_date,
      p.arrival_date,
      p.shelf_lifetime_days.toString(),
      p.days_remaining.toString(),
      p.min_required_days.toString(),
      p.compensation_price_ore.toString(),
      p.reason,
      p.delivery_number,
      p.temperature_zone,
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const csvWithBom = "﻿" + csvContent;
    groups[key] = {
      csv: csvWithBom,
      count: products.length,
    };
  }

  return {
    groups,
    total_flagged: flaggedProducts.length,
  };
}

/**
 * Hämtar reklamationsstatistik för produktkatalog
 */
export async function getProductReclamationStatsHandler(
  supabase: SupabaseClient,
  ctx: ApiKeyContext,
  input: { store_id?: string; sap_article_id?: string },
) {
  requireScope(ctx, "products:read");
  if (input.store_id) requireStore(ctx, input.store_id);

  // Bygg query för reklamationshistorik
  let reclamationQuery = supabase
    .from("product_reclamation_history")
    .select("sap_article_id, count(*)", { count: "exact" });

  if (input.store_id) {
    reclamationQuery = reclamationQuery.eq("store_id", input.store_id);
  }
  if (input.sap_article_id) {
    reclamationQuery = reclamationQuery.eq("sap_article_id", input.sap_article_id);
  }

  // Gruppera efter sap_article_id
  const { data: reclamationData, error: reclamationError } = await reclamationQuery;
  if (reclamationError) throw reclamationError;

  // Bygg query för leveranshistorik
  let deliveryQuery = supabase
    .from("product_delivery_log")
    .select("sap_article_id, count(*)", { count: "exact" });

  if (input.store_id) {
    deliveryQuery = deliveryQuery.eq("store_id", input.store_id);
  }
  if (input.sap_article_id) {
    deliveryQuery = deliveryQuery.eq("sap_article_id", input.sap_article_id);
  }

  const { data: deliveryData, error: deliveryError } = await deliveryQuery;
  if (deliveryError) throw deliveryError;

  // Hämta senaste reklamation per produkt
  const { data: lastReclamationData } = await supabase
    .from("product_reclamation_history")
    .select("sap_article_id, reclaimed_at, reason")
    .order("reclaimed_at", { ascending: false })
    .limit(1000);

  // Hämta senaste leverans per produkt
  const { data: lastDeliveryData } = await supabase
    .from("product_delivery_log")
    .select("sap_article_id, delivered_at")
    .order("delivered_at", { ascending: false })
    .limit(1000);

  // Bygg mappar för snabb uppslagning
  const reclamationCounts = new Map<string, number>();
  reclamationData?.forEach((r: any) => {
    reclamationCounts.set(r.sap_article_id, r.count);
  });

  const deliveryCounts = new Map<string, number>();
  deliveryData?.forEach((d: any) => {
    deliveryCounts.set(d.sap_article_id, d.count);
  });

  const lastReclamations = new Map<string, { date: string; reason: string }>();
  lastReclamationData?.forEach((r: any) => {
    if (!lastReclamations.has(r.sap_article_id)) {
      lastReclamations.set(r.sap_article_id, { date: r.reclaimed_at, reason: r.reason });
    }
  });

  const lastDeliveries = new Map<string, string>();
  lastDeliveryData?.forEach((d: any) => {
    if (!lastDeliveries.has(d.sap_article_id)) {
      lastDeliveries.set(d.sap_article_id, d.delivered_at);
    }
  });

  // Hämta produktinfo för att få namn/EAN/BNR
  const allSapIds = new Set([...reclamationCounts.keys(), ...deliveryCounts.keys()]);

  const productsMap = new Map<string, { name: string; ean: string; bnr: string }>();
  if (allSapIds.size > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("name, ean, bnr, sap_article_id")
      .in("sap_article_id", Array.from(allSapIds));

    products?.forEach((p) => {
      productsMap.set(p.sap_article_id, { name: p.name, ean: p.ean, bnr: p.bnr });
    });
  }

  // Bygg resultat
  const results = Array.from(allSapIds).map((sap_article_id) => {
    const productInfo = productsMap.get(sap_article_id) || { name: "", ean: "", bnr: "" };
    return {
      sap_article_id,
      name: productInfo.name,
      ean: productInfo.ean,
      bnr: productInfo.bnr,
      reclamation_count: reclamationCounts.get(sap_article_id) || 0,
      delivery_count: deliveryCounts.get(sap_article_id) || 0,
      last_reclamation: lastReclamations.get(sap_article_id)?.date || null,
      last_reclamation_reason: lastReclamations.get(sap_article_id)?.reason || null,
      last_delivery: lastDeliveries.get(sap_article_id) || null,
    };
  });

  return results;
}
