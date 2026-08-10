import { supabase } from "@/lib/supabase";

type DeduplicableTask = {
  id: string;
  parent_task_id: string | null;
  recurrence_rule: string | null;
};

export function dedupRecurringSeries<T extends DeduplicableTask>(tasks: T[]): T[] {
  const allParentIds = new Set(
    tasks.filter((t) => t.parent_task_id).map((t) => t.parent_task_id!)
  );
  const parentIdsUsed = new Set<string>();
  return tasks.filter((t) => {
    if (t.parent_task_id) {
      if (parentIdsUsed.has(t.parent_task_id)) return false;
      parentIdsUsed.add(t.parent_task_id);
      return true;
    }
    if (t.recurrence_rule && allParentIds.has(t.id)) return false;
    return true;
  });
}

// --- Shared recurring-task spawn helpers ---

const TZ = "Europe/Stockholm";
const dtfParts = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
});

export function midnightStockholm(d: Date): Date {
  const parts = Object.fromEntries(
    dtfParts.formatToParts(d).filter(p => p.type !== "literal").map(p => [p.type, p.value])
  );
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
}

export function localDateStr(d: Date): string {
  const parts = Object.fromEntries(
    dtfParts.formatToParts(d).filter(p => p.type !== "literal").map(p => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const MAX_SPAWN_INSTANCES = 90;

// --- Händelsehorisont: hur långt framåt återkommande uppgifter genereras ---
export const RECURRENCE_HORIZON_KEY = "sf-recurrence-horizon";
export const DEFAULT_RECURRENCE_HORIZON_DAYS = 30;
export const MAX_RECURRENCE_HORIZON_DAYS = 90;

export function getRecurrenceHorizonDays(): number {
  try {
    const n = parseInt(localStorage.getItem(RECURRENCE_HORIZON_KEY) ?? "", 10);
    if (isNaN(n)) return DEFAULT_RECURRENCE_HORIZON_DAYS;
    return Math.min(MAX_RECURRENCE_HORIZON_DAYS, Math.max(0, n));
  } catch {
    return DEFAULT_RECURRENCE_HORIZON_DAYS;
  }
}

export function buildPeriodStarts(
  originDue: Date,
  rule: string,
  weekdays: number[] | null,
  startDate: Date | null,
  endDate: Date | null,
  ceil: Date,
): Date[] {
  const effectiveCeil = endDate
    ? (midnightStockholm(new Date(endDate)) < ceil ? midnightStockholm(new Date(endDate)) : ceil)
    : ceil;
  let floor: Date;
  if (startDate) {
    floor = midnightStockholm(new Date(startDate));
  } else {
    floor = midnightStockholm(new Date(originDue));
    floor.setDate(floor.getDate() + 1);
  }
  const results: Date[] = [];
  if (rule === "weekly" && weekdays && weekdays.length > 0) {
    const cur = new Date(floor);
    while (cur <= effectiveCeil && results.length < MAX_SPAWN_INSTANCES) {
      const jsDay = cur.getDay();
      const ourDay = jsDay === 0 ? 6 : jsDay - 1;
      if (weekdays.includes(ourDay)) results.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return results;
  }
  const advance = (d: Date): Date => {
    const n = new Date(d);
    if (rule === "daily") { n.setDate(n.getDate() + 1); }
    else if (rule === "every_other_day") { n.setDate(n.getDate() + 2); }
    else if (rule === "weekly") { n.setDate(n.getDate() + 7); }
    else if (rule === "biweekly") { n.setDate(n.getDate() + 14); }
    else if (rule === "monthly") {
      const origDay = originDue.getDate();
      n.setMonth(n.getMonth() + 1);
      const daysInMonth = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
      n.setDate(Math.min(origDay, daysInMonth));
    } else if (rule === "quarterly") {
      n.setMonth(n.getMonth() + 3);
    } else if (rule === "yearly") { n.setFullYear(n.getFullYear() + 1); }
    else { n.setDate(n.getDate() + 1); }
    n.setHours(0, 0, 0, 0);
    return n;
  };
  let cur = midnightStockholm(new Date(originDue));
  cur = advance(cur);
  while (cur < floor) cur = advance(cur);
  while (cur <= effectiveCeil && results.length < MAX_SPAWN_INSTANCES) {
    results.push(new Date(cur));
    cur = advance(new Date(cur));
  }
  return results;
}

/**
 * Beräknar due_date för en återkommande förekomst vars förälder inte har ett
 * eget due_date (fältet används inte för upprepande uppgifter). För sådana
 * uppgifter ska due_date beräknas från periodstarten och due_date_time.
 */
export function dueFromPeriodStart(
  periodStart: Date,
  dueDateTime: string | null | undefined,
): Date {
  const d = new Date(periodStart.getTime());
  if (dueDateTime && dueDateTime.includes(":")) {
    const [h, m] = dueDateTime.split(":").map(Number);
    d.setHours(isNaN(h) ? 23 : h, isNaN(m) ? 59 : m, 0, 0);
  } else {
    d.setHours(23, 59, 0, 0);
  }
  return d;
}

// Minimal shape needed to spawn children — matches what bulkCreateTasks knows after inserting
export type SpawnableParent = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string | null;
  store_id: string | null;
  due_date: string | null;
  due_date_time?: string | null;
  recurrence_rule: string | null;
  recurrence_days: number[] | null;
  recurrence_start?: string | null;
  recurrence_end?: string | null;
  created_by?: string | null;
  assigned_to?: string | null;
  created_at: string;
  // Steps and questions to copy into children
  steps?: { label: string; sort_order: number; requires_photo: boolean; link_url?: string | null; condition_question_id?: string | null; condition_answer?: string | null }[];
  questions?: { id: string; label: string; question_type?: string | null; is_required: boolean; sort_order: number; link_url?: string | null }[];
  assignees?: { user_id?: string | null; group_id?: string | null }[];
};

/**
 * Kopierar en förälders frågor, steg och tilldelningar till ett barn.
 * Frågor skapas först eftersom stegens condition_question_id måste mappas
 * till de nya fråge-id:n.
 */
export async function copyChildAssociations(
  childId: string,
  parent: Pick<SpawnableParent, "steps" | "questions" | "assignees">,
): Promise<void> {
  const parentQuestions = parent.questions ?? [];
  const qIdMap = new Map<string, string>();
  if (parentQuestions.length > 0) {
    const { data: insertedQs } = await supabase.from("task_questions").insert(
      parentQuestions.map(q => ({
        task_id: childId,
        label: q.label,
        question_type: q.question_type ?? "text",
        is_required: q.is_required,
        sort_order: q.sort_order,
        link_url: q.link_url ?? null,
      }))
    ).select("id, sort_order");
    if (insertedQs) {
      insertedQs.forEach((iq: { id: string; sort_order: number }) => {
        const pq = parentQuestions.find(q => q.sort_order === iq.sort_order);
        if (pq?.id) qIdMap.set(pq.id, iq.id);
      });
    }
  }

  const steps = (parent.steps ?? []).map(s => ({
    task_id: childId,
    label: s.label,
    sort_order: s.sort_order,
    requires_photo: s.requires_photo,
    is_done: false,
    link_url: s.link_url ?? null,
    condition_question_id: s.condition_question_id ? (qIdMap.get(s.condition_question_id) ?? null) : null,
    condition_answer: s.condition_answer ?? null,
  }));
  if (steps.length > 0) await supabase.from("task_steps").insert(steps);

  const assignees = (parent.assignees ?? []).map(a => ({ task_id: childId, user_id: a.user_id ?? null, group_id: a.group_id ?? null }));
  if (assignees.length > 0) await supabase.from("task_assignees").insert(assignees);
}

export async function spawnChildrenForParent(
  parent: SpawnableParent,
  nowMs: number,
  horizonDays: number = DEFAULT_RECURRENCE_HORIZON_DAYS,
): Promise<void> {
  if (!parent.recurrence_rule) return;

  const originDate = parent.recurrence_start
    ? midnightStockholm(new Date(parent.recurrence_start))
    : parent.due_date
      ? midnightStockholm(new Date(parent.due_date))
      : midnightStockholm(new Date(parent.created_at));

  const maxCeil = (() => { const d = new Date(nowMs); d.setDate(d.getDate() + horizonDays); return midnightStockholm(d); })();
  const ceilDate = parent.recurrence_end
    ? (() => { const e = midnightStockholm(new Date(parent.recurrence_end)); return e < maxCeil ? e : maxCeil; })()
    : maxCeil;

  const allPsKeys = new Set<string>();
  const allPeriods: Date[] = [];

  const originKey = localDateStr(originDate);
  if (originDate <= ceilDate) { allPsKeys.add(originKey); allPeriods.push(originDate); }

  const periodStarts = buildPeriodStarts(
    originDate,
    parent.recurrence_rule,
    parent.recurrence_days ?? null,
    parent.recurrence_start ? new Date(parent.recurrence_start) : null,
    parent.recurrence_end ? new Date(parent.recurrence_end) : null,
    ceilDate,
  );
  for (const ps of periodStarts) {
    const k = localDateStr(ps);
    if (!allPsKeys.has(k)) { allPsKeys.add(k); allPeriods.push(ps); }
  }

  for (const ps of allPeriods) {
    const psKey = localDateStr(ps);
    const childDue = dueFromPeriodStart(ps, parent.due_date_time);
    const { data: child } = await supabase.from("tasks").insert({
      title: parent.title,
      description: parent.description,
      category: parent.category,
      priority: parent.priority,
      store_id: parent.store_id,
      due_date: childDue ? childDue.toISOString() : null,
      due_date_time: parent.due_date_time ?? null,
      recurrence_rule: parent.recurrence_rule,
      recurrence_days: parent.recurrence_days,
      recurrence_period_start: psKey,
      parent_task_id: parent.id,
      created_by: parent.created_by ?? null,
      assigned_to: parent.assigned_to ?? null,
      status: "todo",
    }).select("id").maybeSingle();

    if (!child?.id) continue;

    // Copy steps, questions and assignees to the child (questions first for condition remapping)
    await copyChildAssociations(child.id, parent);
  }

  if (allPeriods.length > 0) {
    await supabase.from("tasks").update({ last_spawned_at: new Date(nowMs).toISOString() }).eq("id", parent.id);
  }
}
