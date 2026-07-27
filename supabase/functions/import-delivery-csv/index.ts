// Edge Function: import-delivery-csv
//
// URL-callable version of the "Leveransplan (CSV)" import in schema.tsx, for
// automation tools like Power Automate. Bypasses the normal browser/session
// flow entirely — auth is via a shared secret header, and writes go through
// the Supabase service role key.
//
// Call:
//   POST https://<project-ref>.supabase.co/functions/v1/import-delivery-csv
//   Headers:
//     Content-Type: application/json
//     x-import-secret: <IMPORT_WEBHOOK_SECRET>
//   Body (JSON):
//     {
//       "store_id": "uuid",              // required
//       "week_number": 31,               // required, 1-53
//       "year": 2026,                    // required
//       "filename": "leveransplan.csv",  // optional, stored for reference
//       "label": "Standard",             // optional, "Standard" = default template for the week
//       "csv": "raw file contents...",   // required — either csv (plain text) ...
//       "csv_base64": "..."              // ... or csv_base64 (base64-encoded), not both
//     }
//
// Response: { success: true, plan_id, week_number, year, deliveries_imported, is_special_week, holiday_name }
//        or { error: "..." } with a 4xx/5xx status.
//
// Set the shared secret once via:
//   supabase secrets set IMPORT_WEBHOOK_SECRET=<a long random string>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-import-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Ported verbatim from src/routes/schema.tsx (parseCsvDelivery) ────────────

const DAY_TO_INDEX: Record<string, number> = {
  måndag: 0, tisdag: 1, onsdag: 2, torsdag: 3, fredag: 4, lördag: 5, söndag: 6,
};

type ParsedDelivery = {
  deliveryDay: string;
  deliveryTime: string;
  orderDay: string;
  stopTime: string;
  flowName: string;
  supplier: string;
};

function parseCsvDelivery(text: string): ParsedDelivery[] {
  const results: ParsedDelivery[] = [];
  const dayNames = new Set(Object.keys(DAY_TO_INDEX));
  const lines = text.replace(/^\uFEFF/, "").split(/[\r\n]+/).filter(Boolean);
  for (const line of lines) {
    const fields: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { fields.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    fields.push(cur.trim());
    if (fields.length < 6) continue;
    const [deliveryDay, deliveryTime, orderDay, stopTime, flowName, supplier] = fields;
    if (!dayNames.has(deliveryDay.toLowerCase())) continue;
    if (!/^\d{2}:\d{2}$/.test(deliveryTime)) continue;
    results.push({ deliveryDay, deliveryTime, orderDay, stopTime, flowName, supplier });
  }
  return results;
}

function deliveryDateForDay(dayName: string, weekStartDate: string): string | null {
  if (!weekStartDate) return null;
  const idx = DAY_TO_INDEX[dayName.toLowerCase()];
  if (idx === undefined) return null;
  const [y, m, d] = weekStartDate.split("-").map(Number);
  const base = new Date(y, m - 1, d + idx);
  const yr = base.getFullYear();
  const mo = String(base.getMonth() + 1).padStart(2, "0");
  const dy = String(base.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

function getWeekStartDate(week: number, year: number): string {
  const jan4 = new Date(year, 0, 4);
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const start = new Date(mondayOfWeek1);
  start.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Swedish holidays (ported from src/lib/swedish-holidays.ts) ───────────────

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function addDaysToDate(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function midsummerEve(year: number): Date { const d = new Date(year, 5, 19); while (d.getDay() !== 5) d.setDate(d.getDate() + 1); return d; }
function allSaintsDay(year: number): Date { const d = new Date(year, 9, 31); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); return d; }

function getSwedishHolidays(year: number): { date: Date; name: string }[] {
  const easter = easterSunday(year);
  const mid = midsummerEve(year);
  const allSaints = allSaintsDay(year);
  return [
    [new Date(year, 0, 1), "Nyårsdagen"], [new Date(year, 0, 6), "Trettondedag jul"],
    [new Date(year, 4, 1), "Första maj"], [new Date(year, 5, 6), "Sveriges nationaldag"],
    [new Date(year, 11, 24), "Julafton"], [new Date(year, 11, 25), "Juldagen"],
    [new Date(year, 11, 26), "Annandag jul"], [new Date(year, 11, 31), "Nyårsafton"],
    [addDaysToDate(easter, -3), "Skärtorsdagen"], [addDaysToDate(easter, -2), "Långfredagen"],
    [addDaysToDate(easter, -1), "Påskafton"], [easter, "Påskdagen"],
    [addDaysToDate(easter, 1), "Annandag påsk"], [addDaysToDate(easter, 39), "Kristi himmelsfärdsdag"],
    [addDaysToDate(easter, 49), "Pingstdagen"], [mid, "Midsommarafton"],
    [addDaysToDate(mid, 1), "Midsommardagen"], [allSaints, "Alla helgons dag"],
  ].map(([date, name]) => ({ date: date as Date, name: name as string }));
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getSpecialWeekHoliday(year: number, weekNumber: number): string | null {
  for (const h of getSwedishHolidays(year)) {
    const wy = h.date.getFullYear();
    const wn = isoWeekNumber(h.date);
    if ((wy === year || wy === year - 1 || wy === year + 1) && wn === weekNumber) return h.name;
  }
  return null;
}

function decodeBase64Content(input: string): string {
  let cleaned = input.trim();
  if (cleaned.startsWith("data:")) {
    const commaIdx = cleaned.indexOf(",");
    if (commaIdx !== -1) {
      cleaned = cleaned.slice(commaIdx + 1);
    }
  }
  cleaned = cleaned.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (cleaned.length % 4 !== 0) {
    cleaned += "=";
  }
  try {
    const binaryString = atob(cleaned);
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return input.trim().replace(/^\uFEFF/, "");
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Endast POST stöds." }, 405);

  const expectedSecret = Deno.env.get("IMPORT_WEBHOOK_SECRET");
  if (!expectedSecret) return json({ error: "IMPORT_WEBHOOK_SECRET är inte konfigurerad på servern." }, 500);
  const givenSecret = req.headers.get("x-import-secret");
  if (!givenSecret || givenSecret !== expectedSecret) return json({ error: "Ogiltig eller saknad x-import-secret." }, 401);

  let body: {
    store_id?: string; week_number?: number; year?: number;
    filename?: string; label?: string; csv?: string; csv_base64?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ogiltig JSON i request-body." }, 400);
  }

  const { store_id, week_number, year, filename, label } = body;
  if (!store_id) return json({ error: "store_id saknas." }, 400);
  if (!week_number || week_number < 1 || week_number > 53) return json({ error: "week_number måste vara 1-53." }, 400);
  if (!year) return json({ error: "year saknas." }, 400);
  if (!body.csv && !body.csv_base64) return json({ error: "csv eller csv_base64 måste anges." }, 400);

  let csvText: string;
  if (body.csv_base64) {
    csvText = decodeBase64Content(body.csv_base64);
  } else if (body.csv) {
    const trimmed = body.csv.trim();
    if (trimmed.startsWith("data:") || (!trimmed.includes(",") && !trimmed.includes("\n") && trimmed.length > 20)) {
      csvText = decodeBase64Content(trimmed);
    } else {
      csvText = trimmed.replace(/^\uFEFF/, "");
    }
  } else {
    return json({ error: "csv eller csv_base64 måste anges." }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: store } = await supabase.from("stores").select("id").eq("id", store_id).maybeSingle();
  if (!store) return json({ error: `Ingen butik hittades med store_id ${store_id}.` }, 404);

  const entries = parseCsvDelivery(csvText);
  if (entries.length === 0) {
    return json({ error: "Inga leveranser kunde tolkas från CSV-innehållet. Kontrollera formatet (dag,leveranstid,orderdag,stopptid,flöde,leverantör)." }, 422);
  }

  const userLabel = label ?? "Standard";
  const weekStart = getWeekStartDate(week_number, year);
  const holidayName = getSpecialWeekHoliday(year, week_number);
  const isSpecialWeek = holidayName !== null;

  const { data: oldPlans } = await supabase
    .from("delivery_plans").select("id")
    .eq("store_id", store_id).eq("week_number", week_number).eq("year", year);
  const wasOverwrite = !!oldPlans && oldPlans.length > 0;
  if (wasOverwrite) {
    const oldPlanIds = oldPlans!.map((p: { id: string }) => p.id);
    await supabase.from("delivery_entries").delete().in("plan_id", oldPlanIds);
    await supabase.from("delivery_plans").delete().in("id", oldPlanIds);
  }

  const { data: plan, error: planErr } = await supabase.from("delivery_plans").insert({
    store_id, week_number, year, imported_by: null, filename: filename ?? "power-automate-import.csv",
    is_special_week: isSpecialWeek || userLabel !== "Standard", holiday_name: holidayName,
    is_default_template: userLabel === "Standard" && !isSpecialWeek,
    notes: userLabel !== "Standard" ? userLabel : (holidayName ?? null),
  }).select().single();
  if (planErr || !plan) return json({ error: `Fel vid sparande av leveransplan: ${planErr?.message}` }, 500);

  const rows = entries.map((e) => ({
    plan_id: plan.id, delivery_day: e.deliveryDay, delivery_time: e.deliveryTime,
    order_day: e.orderDay, stop_time: e.stopTime, flow_name: e.flowName, supplier: e.supplier,
    delivery_date: deliveryDateForDay(e.deliveryDay, weekStart),
  }));
  const { error: entriesErr } = await supabase.from("delivery_entries").insert(rows);
  if (entriesErr) return json({ error: `Fel vid sparande av leveranser: ${entriesErr.message}` }, 500);

  return json({
    success: true,
    plan_id: plan.id,
    week_number, year,
    deliveries_imported: rows.length,
    was_overwrite: wasOverwrite,
    is_special_week: isSpecialWeek,
    holiday_name: holidayName,
  });
});
