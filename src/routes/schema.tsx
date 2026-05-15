import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Upload,
  Users,
  Clock,
  CircleAlert as AlertCircle,
  CircleCheck as CheckCircle2,
  X,
  UserPlus,
  LayoutGrid,
  List,
  Timer,
  Truck,
  FileText,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase, type AppUser } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/schema")({
  component: SchemaPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type XmlShift = {
  shiftName: string;
  startTime: string;
  stopTime: string;
  color: string;
  grossMinutes: number;
  netMinutes: number;
  deviationCause: string;
  totalCost: number;
};

type XmlDay = {
  dayNr: number;
  scheduleDate: string;
  isAbsenceDay: boolean;
  shifts: XmlShift[];
};

type ParsedEmployee = {
  employeeNr: string;
  employeeName: string;
  employeeGroup: string;
  days: XmlDay[];
};

type ParsedSchedule = {
  weekNumber: number;
  year: number;
  weekStartDate: string;
  storeName: string;
  employees: ParsedEmployee[];
};

type ImportRow = {
  id: string;
  store_id: string;
  week_start_date: string;
  week_number: number;
  year: number;
  filename: string;
  imported_at: string;
  raw_employee_count: number;
};

type EmployeeMapping = {
  employee_nr: string;
  app_user_id: string | null;
};

type ScheduleEmployee = {
  id: string;
  import_id: string;
  employee_nr: string;
  employee_name: string;
  employee_group: string;
};

type ScheduleShift = {
  id: string;
  schedule_employee_id: string;
  day_date: string;
  start_time: string | null;
  stop_time: string | null;
  shift_name: string;
  color: string;
  gross_minutes: number;
  net_minutes: number;
  deviation_cause: string;
  is_absence_day: boolean;
};

type DeliveryPlan = {
  id: string;
  store_id: string;
  week_number: number;
  year: number;
  filename: string;
  imported_at: string;
};

type DeliveryEntry = {
  id: string;
  plan_id: string;
  delivery_day: string;
  delivery_time: string;
  order_day: string;
  stop_time: string;
  flow_name: string;
  supplier: string;
  delivery_date: string | null;
};

// ─── Shift colour mapping (from image reference) ──────────────────────────────

const SHIFT_COLORS: Record<string, { bg: string; label: string }> = {
  kassa:         { bg: "#b5c9a1", label: "Kassa" },
  "kassa reserv": { bg: "#b5c9a1", label: "Kassa Reserv" },
  "kassa reserv 1": { bg: "#b5c9a1", label: "Kassa Reserv 1" },
  förbutik:      { bg: "#c8d4b0", label: "Förbutik" },
  teamplock:     { bg: "#7d6547", label: "Teamplock" },
  butikskök:     { bg: "#4a7c4e", label: "Butikskök" },
  butik:         { bg: "#b5c9a1", label: "Butik" },
  lager:         { bg: "#9aab85", label: "Lager" },
  städning:      { bg: "#aec6b0", label: "Städning" },
  standard:      { bg: "#b0b0b0", label: "Standard" },
};

function shiftColor(name: string, xmlColor: string): string {
  const key = name.toLowerCase().trim();
  for (const k of Object.keys(SHIFT_COLORS)) {
    if (key.includes(k)) return SHIFT_COLORS[k].bg;
  }
  // Fall back to XML color if it's not the default green
  if (xmlColor && xmlColor !== "#4CAF50") return xmlColor;
  return SHIFT_COLORS["kassa"].bg;
}

// ─── Delivery flow colors ─────────────────────────────────────────────────────

const FLOW_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "färskt":   { bg: "#d4edda", text: "#155724", label: "Färskt" },
  "torrt":    { bg: "#fff3cd", text: "#856404", label: "Torrt" },
  "fryst":    { bg: "#cce5ff", text: "#004085", label: "Fryst" },
  "standard": { bg: "#f0f0f0", text: "#555555", label: "Standard" },
};

function flowColor(name: string): { bg: string; text: string } {
  const key = name.toLowerCase().trim();
  return FLOW_COLORS[key] ?? { bg: "#e8e8e8", text: "#444444" };
}

// ─── EmployeeGroup → role mapping ────────────────────────────────────────────

function groupToRole(group: string): "admin" | "manager" | "employee" {
  const g = group.toLowerCase();
  if (g.includes("ledarna")) return "manager";
  if (g.includes("handels tjm") || g.includes("handels") || g.includes("tjm")) return "manager";
  return "employee";
}

// ─── XML parsing ──────────────────────────────────────────────────────────────

function getText(el: Element, selector: string): string {
  return el.querySelector(selector)?.textContent?.trim() ?? "";
}

function parseTime(raw: string): string {
  const match = raw.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function parseXml(xmlText: string): ParsedSchedule | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const root = doc.documentElement;
  if (!root || root.nodeName !== "SOE_TimeEmployeeSchedule") return null;

  const storeName =
    getText(root, "ReportHeader Company") ||
    getText(root, "Store StoreName") ||
    getText(root, "StoreName") || "";

  const weekEl = root.querySelector("Week");
  const weekNrText = weekEl ? (getText(weekEl, "ScheduleWeekNr") || weekEl.getAttribute("WeekNr") || "") : "";
  const weekNumber = parseInt(weekNrText, 10) || 0;
  const yearText = weekEl ? (getText(weekEl, "Year") || weekEl.getAttribute("Year") || "") : "";
  const year = parseInt(yearText, 10) || new Date().getFullYear();
  let weekStartDate = "";

  const employees: ParsedEmployee[] = Array.from(root.querySelectorAll("Employee")).map((empEl) => {
    const employeeNr = getText(empEl, "EmployeeNr") || empEl.getAttribute("EmployeeNr") || "";
    const employeeName = getText(empEl, "EmployeeName") || empEl.getAttribute("EmployeeName") || "";
    const employeeGroup = getText(empEl, "EmployeeGroup") || empEl.getAttribute("EmployeeGroup") || "";

    const days: XmlDay[] = Array.from(empEl.querySelectorAll("Day")).map((dayEl) => {
      const dayNr = parseInt(getText(dayEl, "DayNr") || dayEl.getAttribute("DayNr") || "0", 10);
      const scheduleDateRaw = getText(dayEl, "ScheduleDate") || dayEl.getAttribute("ScheduleDate") || "";
      const scheduleDate = scheduleDateRaw.slice(0, 10);
      const absenceRaw = getText(dayEl, "IsAbsenceDay") || dayEl.getAttribute("IsAbsenceDay") || "0";
      const isAbsenceDay = absenceRaw === "1" || absenceRaw.toLowerCase() === "true";
      if (dayNr === 1 && scheduleDate && !weekStartDate) weekStartDate = scheduleDate;
      const shifts: XmlShift[] = Array.from(dayEl.querySelectorAll("Shifts")).map((sEl) => {
        const sName = getText(sEl, "ShiftName");
        const xmlCol = getText(sEl, "Color") ? `#${getText(sEl, "Color")}` : "#4CAF50";
        return {
          shiftName: sName,
          startTime: parseTime(getText(sEl, "ShiftStartTime")),
          stopTime: parseTime(getText(sEl, "ShiftStopTime")),
          color: shiftColor(sName, xmlCol),
          grossMinutes: parseInt(getText(sEl, "ShiftGrossTimeMinutes") || "0", 10),
          netMinutes: parseInt(getText(sEl, "ShiftNetTimeMinutes") || "0", 10),
          deviationCause: getText(sEl, "ShiftTimeDeviationCauseName"),
          totalCost: parseFloat((getText(sEl, "ShiftTotalCost") || "0").replace(",", ".")),
        };
      });
      return { dayNr, scheduleDate, isAbsenceDay, shifts };
    });
    return { employeeNr, employeeName, employeeGroup, days };
  });

  return { weekNumber, year, weekStartDate, storeName, employees };
}

// ─── PDF Delivery plan parser ─────────────────────────────────────────────────

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

function parsePdfText(text: string): ParsedDelivery[] {
  const results: ParsedDelivery[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // Find rows: each row has a day name as the first token
  const dayNames = new Set(Object.keys(DAY_TO_INDEX));

  let i = 0;
  while (i < lines.length) {
    const firstWord = lines[i].split(/\s+/)[0]?.toLowerCase();
    if (dayNames.has(firstWord)) {
      // Try to parse a delivery row from one or two lines
      // Pattern: "Måndag 13:50 Söndag 11:35 Standard ARLA FOODS..." (single line)
      // or split across two lines
      const combined = lines[i] + " " + (lines[i + 1] ?? "");
      const timeRe = /(\d{2}:\d{2})/g;
      const times = [...combined.matchAll(timeRe)].map((m) => m[1]);
      if (times.length >= 2) {
        const parts = combined.split(/\s+/);
        const deliveryDay = parts[0] ?? "";
        const deliveryTime = times[0] ?? "";
        // Find order day (second day name)
        let orderDayIdx = -1;
        for (let j = 1; j < parts.length; j++) {
          if (dayNames.has(parts[j]?.toLowerCase())) {
            orderDayIdx = j;
            break;
          }
        }
        const orderDay = orderDayIdx >= 0 ? parts[orderDayIdx] : "";
        const stopTime = times[1] ?? "";
        // Everything after stopTime is flowName + supplier
        const afterStop = combined.slice(combined.indexOf(stopTime) + stopTime.length).trim();
        const flowWords = afterStop.split(/\s+/);
        // Flow name is typically one word: Färskt, Torrt, Fryst, Standard
        const flowName = flowWords[0] ?? "";
        const supplier = flowWords.slice(1).join(" ");

        if (deliveryDay && deliveryTime) {
          results.push({ deliveryDay, deliveryTime, orderDay, stopTime, flowName, supplier });
        }
      }
    }
    i++;
  }
  return results;
}

function deliveryDateForDay(dayName: string, weekStartDate: string): string | null {
  if (!weekStartDate) return null;
  const idx = DAY_TO_INDEX[dayName.toLowerCase()];
  if (idx === undefined) return null;
  const base = new Date(weekStartDate);
  base.setDate(base.getDate() + idx);
  return base.toISOString().slice(0, 10);
}

// ─── Time utils ───────────────────────────────────────────────────────────────

const TIMELINE_START = 6;
const TIMELINE_END = 23;
const TOTAL_HOURS = TIMELINE_END - TIMELINE_START;

function timeToPercent(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (((h - TIMELINE_START) * 60 + m) / (TOTAL_HOURS * 60)) * 100;
}

function shiftWidthPercent(start: string, stop: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = stop.split(":").map(Number);
  let s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 24 * 60;
  return ((e - s) / (TOTAL_HOURS * 60)) * 100;
}

function nowPercent(): number {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < TIMELINE_START || h >= TIMELINE_END) return -1;
  return (((h - TIMELINE_START) * 60 + m) / (TOTAL_HOURS * 60)) * 100;
}

function minsToHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
const DAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return true;
  const n = parseInt(clean, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

// ─── Component ────────────────────────────────────────────────────────────────

function SchemaPage() {
  const { user, activeStore } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [imports, setImports] = useState<ImportRow[]>([]);
  const [activeImport, setActiveImport] = useState<ImportRow | null>(null);
  const [scheduleEmployees, setScheduleEmployees] = useState<ScheduleEmployee[]>([]);
  const [scheduleShifts, setScheduleShifts] = useState<ScheduleShift[]>([]);
  const [mappings, setMappings] = useState<EmployeeMapping[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  });
  const [viewMode, setViewMode] = useState<"day" | "week">("day");

  // Delivery
  const [deliveryPlans, setDeliveryPlans] = useState<DeliveryPlan[]>([]);
  const [deliveryEntries, setDeliveryEntries] = useState<DeliveryEntry[]>([]);
  const [showDeliveries, setShowDeliveries] = useState(true);

  const [parsed, setParsed] = useState<ParsedSchedule | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [savingImport, setSavingImport] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const storeId = activeStore?.id ?? user?.store_id ?? null;
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!storeId) return;
    loadImports();
    loadAppUsers();
    loadMappings();
    loadDeliveryPlans();
  }, [storeId]);

  useEffect(() => {
    if (!activeImport) return;
    loadScheduleData(activeImport.id);
  }, [activeImport]);

  async function loadImports() {
    if (!storeId) return;
    const { data } = await supabase.from("schedule_imports").select("*").eq("store_id", storeId).order("week_start_date", { ascending: false });
    const rows = (data ?? []) as ImportRow[];
    setImports(rows);
    if (rows.length > 0 && !activeImport) setActiveImport(rows[0]);
  }

  async function loadAppUsers() {
    if (!storeId) return;
    const { data } = await supabase.from("app_users").select("id, username, display_name, role, store_id, active_store_id, is_active, last_login, created_at").eq("store_id", storeId).eq("is_active", true).order("display_name");
    setAppUsers((data ?? []) as AppUser[]);
  }

  async function loadMappings() {
    if (!storeId) return;
    const { data } = await supabase.from("employee_mappings").select("employee_nr, app_user_id").eq("store_id", storeId);
    setMappings((data ?? []) as EmployeeMapping[]);
  }

  async function loadScheduleData(importId: string) {
    const [empRes, shiftRes] = await Promise.all([
      supabase.from("schedule_employees").select("*").eq("import_id", importId).order("employee_name"),
      supabase.from("schedule_shifts").select("*").eq("import_id", importId),
    ]);
    setScheduleEmployees((empRes.data ?? []) as ScheduleEmployee[]);
    setScheduleShifts((shiftRes.data ?? []) as ScheduleShift[]);
  }

  async function loadDeliveryPlans() {
    if (!storeId) return;
    const { data: plans } = await supabase.from("delivery_plans").select("*").eq("store_id", storeId).order("year", { ascending: false }).order("week_number", { ascending: false });
    const planList = (plans ?? []) as DeliveryPlan[];
    setDeliveryPlans(planList);
    if (planList.length > 0) {
      const ids = planList.map((p) => p.id);
      const { data: entries } = await supabase.from("delivery_entries").select("*").in("plan_id", ids);
      setDeliveryEntries((entries ?? []) as DeliveryEntry[]);
    }
  }

  // XML import
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseXml(ev.target?.result as string);
      if (!result || result.employees.length === 0) {
        toast.error("Kunde inte läsa XML-filen. Kontrollera att det är en SoftOne GO-export.");
        return;
      }
      setParsed({ ...result, storeName: result.storeName || activeStore?.name || "" });
      setMappingOpen(true);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  // PDF import
  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (!storeId || !user) return;

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const text = await extractPdfText(arrayBuffer);
        const entries = parsePdfText(text);
        if (entries.length === 0) {
          toast.error(`Inga leveranser hittades i ${file.name}`);
          continue;
        }

        // Detect week/year from activeImport or current week
        const weekStart = activeImport?.week_start_date ?? todayStr;
        const weekNumber = activeImport?.week_number ?? getISOWeek(new Date());
        const year = activeImport?.year ?? new Date().getFullYear();

        const { data: plan, error: planErr } = await supabase.from("delivery_plans").insert({
          store_id: storeId,
          week_number: weekNumber,
          year,
          imported_by: user.id,
          filename: file.name,
        }).select().single();

        if (planErr || !plan) {
          toast.error(`Fel vid sparande av leveransplan: ${planErr?.message}`);
          continue;
        }

        const planId = (plan as DeliveryPlan).id;
        const rows = entries.map((e) => ({
          plan_id: planId,
          delivery_day: e.deliveryDay,
          delivery_time: e.deliveryTime,
          order_day: e.orderDay,
          stop_time: e.stopTime,
          flow_name: e.flowName,
          supplier: e.supplier,
          delivery_date: deliveryDateForDay(e.deliveryDay, weekStart),
        }));

        await supabase.from("delivery_entries").insert(rows);
        toast.success(`Leveransplan från ${file.name} importerad (${rows.length} leveranser)`);
      } catch (err) {
        toast.error(`Fel vid läsning av ${file.name}`);
        console.error(err);
      }
    }

    e.target.value = "";
    await loadDeliveryPlans();
  }

  function getMappedUserId(employeeNr: string) {
    return mappings.find((m) => m.employee_nr === employeeNr)?.app_user_id ?? null;
  }

  function setMapping(employeeNr: string, appUserId: string | null) {
    setMappings((prev) => {
      const idx = prev.findIndex((m) => m.employee_nr === employeeNr);
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], app_user_id: appUserId }; return n; }
      return [...prev, { employee_nr: employeeNr, app_user_id: appUserId }];
    });
  }

  async function saveMappings() {
    if (!storeId || !user) return;
    for (const m of mappings) {
      await supabase.from("employee_mappings").upsert(
        { store_id: storeId, employee_nr: m.employee_nr, app_user_id: m.app_user_id || null, created_by: user.id, updated_at: new Date().toISOString() },
        { onConflict: "store_id,employee_nr" }
      );
    }
  }

  async function confirmImport() {
    if (!parsed || !storeId || !user) return;
    setSavingImport(true);
    try {
      await saveMappings();

      // Bulk update app_users role + store based on EmployeeGroup
      for (const emp of parsed.employees) {
        const mappedUserId = getMappedUserId(emp.employeeNr);
        if (mappedUserId && emp.employeeGroup) {
          const role = groupToRole(emp.employeeGroup);
          await supabase.from("app_users").update({ role, employee_group: emp.employeeGroup, store_id: storeId }).eq("id", mappedUserId);
        }
      }

      const { data: importData, error: importErr } = await supabase
        .from("schedule_imports")
        .insert({ store_id: storeId, week_start_date: parsed.weekStartDate, week_number: parsed.weekNumber, year: parsed.year, imported_by: user.id, filename: `vecka_${parsed.weekNumber}_${parsed.year}.xml`, raw_employee_count: parsed.employees.length })
        .select().single();
      if (importErr || !importData) throw new Error(importErr?.message ?? "Import failed");
      const importId = (importData as ImportRow).id;

      for (const emp of parsed.employees) {
        const { data: empData, error: empErr } = await supabase.from("schedule_employees").insert({ import_id: importId, employee_nr: emp.employeeNr, employee_name: emp.employeeName, employee_group: emp.employeeGroup }).select().single();
        if (empErr || !empData) continue;
        const empId = (empData as ScheduleEmployee).id;
        const rows = emp.days.flatMap((day) => {
          if (day.shifts.length > 0) return day.shifts.map((s) => ({ schedule_employee_id: empId, import_id: importId, day_date: day.scheduleDate, start_time: s.startTime || null, stop_time: s.stopTime || null, shift_name: s.shiftName, color: s.color, gross_minutes: s.grossMinutes, net_minutes: s.netMinutes, deviation_cause: s.deviationCause, is_absence_day: day.isAbsenceDay }));
          if (day.isAbsenceDay) return [{ schedule_employee_id: empId, import_id: importId, day_date: day.scheduleDate, start_time: null, stop_time: null, shift_name: "", color: "#e0e0e0", gross_minutes: 0, net_minutes: 0, deviation_cause: "", is_absence_day: true }];
          return [];
        });
        if (rows.length > 0) await supabase.from("schedule_shifts").insert(rows);
      }

      toast.success(`Schema för vecka ${parsed.weekNumber} importerat! Roll & butik uppdaterades för kopplade användare.`);
      setMappingOpen(false);
      setParsed(null);
      await loadImports();
      setActiveImport(importData as ImportRow);
    } catch (err) {
      toast.error("Något gick fel vid importen. Försök igen.");
      console.error(err);
    } finally {
      setSavingImport(false);
    }
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const weekDates = activeImport ? Array.from({ length: 7 }, (_, i) => addDays(activeImport.week_start_date, i)) : [];
  const currentDate = weekDates[selectedDayIndex] ?? null;
  const currentNowPercent = currentDate === todayStr ? nowPercent() : -1;

  const employeeRows = scheduleEmployees
    .filter((emp) => scheduleShifts.some((s) => s.schedule_employee_id === emp.id))
    .map((emp) => {
      const allShifts = scheduleShifts.filter((s) => s.schedule_employee_id === emp.id);
      const dayShifts = allShifts.filter((s) => s.day_date === currentDate);
      const workShifts = dayShifts.filter((s) => !s.is_absence_day && s.start_time);
      const absenceShift = dayShifts.find((s) => s.is_absence_day);
      const mapping = mappings.find((m) => m.employee_nr === emp.employee_nr);
      const appUser = mapping?.app_user_id ? appUsers.find((u) => u.id === mapping.app_user_id) : null;
      const weekMinutes = allShifts.filter((s) => !s.is_absence_day).reduce((sum, s) => sum + (s.gross_minutes || 0), 0);
      const initials = (appUser?.display_name ?? emp.employee_name).split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
      return { emp, dayShifts, workShifts, absenceShift, appUser, weekMinutes, initials };
    });

  const workingToday = employeeRows.filter((r) => r.workShifts.length > 0).length;
  const absentToday = employeeRows.filter((r) => r.workShifts.length === 0 && r.absenceShift).length;
  const totalStaff = employeeRows.length;
  const totalWeekHours = employeeRows.reduce((sum, r) => sum + r.weekMinutes, 0);

  // Deliveries for current day
  const todayDeliveries = deliveryEntries.filter((d) => d.delivery_date === currentDate);

  const hourMarkers = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => TIMELINE_START + i);

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Page header */}
      <div className="border-b border-border/60 bg-card px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Schema</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {activeImport ? `Vecka ${activeImport.week_number}, ${activeImport.year} · ${activeImport.raw_employee_count} medarbetare` : "Importera schema från SoftOne GO"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {imports.length > 1 && (
              <Select value={activeImport?.id ?? ""} onValueChange={(v) => { const imp = imports.find((i) => i.id === v); if (imp) setActiveImport(imp); }}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Välj vecka" /></SelectTrigger>
                <SelectContent>
                  {imports.map((imp) => (<SelectItem key={imp.id} value={imp.id}>Vecka {imp.week_number}, {imp.year}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            {activeImport && (
              <Button size="sm" variant={showDeliveries ? "default" : "outline"} onClick={() => setShowDeliveries((v) => !v)} className="gap-1.5">
                <Truck className="h-4 w-4" />
                {deliveryPlans.length > 0 ? `Leveranser (${deliveryPlans.length})` : "Leveranser"}
              </Button>
            )}
            {isAdmin && imports.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setMappingOpen(true)} className="gap-1.5">
                <Users className="h-4 w-4" />
                Personal
              </Button>
            )}
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => pdfRef.current?.click()}>
                  <FileText className="h-4 w-4" />
                  Leveransplan PDF
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Schema XML
                </Button>
              </>
            )}
            {!isAdmin && (
              <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Enbart visning
              </div>
            )}
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={handleFileChange} />
            <input ref={pdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={handlePdfChange} />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {activeImport && (
        <div className="grid grid-cols-2 gap-3 border-b border-border/40 bg-card/50 px-6 py-3 sm:grid-cols-4">
          <StatPill icon={<Users className="h-4 w-4" />} label="Arbetar idag" value={String(workingToday)} tone="primary" />
          <StatPill icon={<Calendar className="h-4 w-4" />} label="Totalt i veckan" value={String(totalStaff)} tone="default" />
          <StatPill icon={<Timer className="h-4 w-4" />} label="Veckotimmar" value={minsToHours(totalWeekHours)} tone="default" />
          <StatPill icon={<Clock className="h-4 w-4" />} label="Frånvaro idag" value={String(absentToday)} tone={absentToday > 0 ? "warning" : "default"} />
        </div>
      )}

      {/* Shift colour legend */}
      {activeImport && (
        <div className="flex flex-wrap gap-2 border-b border-border/30 bg-card/30 px-6 py-2">
          {Object.entries(SHIFT_COLORS).filter(([k]) => !k.includes("reserv") && k !== "standard").map(([key, val]) => (
            <div key={key} className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: val.bg, border: "1px solid rgba(0,0,0,0.15)" }} />
              <span className="text-[10px] text-muted-foreground">{val.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: FLOW_COLORS["färskt"].bg, border: `1px solid ${FLOW_COLORS["färskt"].text}40` }} />
            <span className="text-[10px] text-muted-foreground">Leverans Färskt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: FLOW_COLORS["torrt"].bg, border: `1px solid ${FLOW_COLORS["torrt"].text}40` }} />
            <span className="text-[10px] text-muted-foreground">Leverans Torrt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: FLOW_COLORS["fryst"].bg, border: `1px solid ${FLOW_COLORS["fryst"].text}40` }} />
            <span className="text-[10px] text-muted-foreground">Leverans Fryst</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {imports.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-soft">
            <Calendar className="h-10 w-10 text-primary" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground">Inget schema importerat</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {isAdmin ? "Exportera ett schema från SoftOne GO som XML och importera det för att se skiftöversikten." : "Schema importeras av administratören."}
            </p>
          </div>
          {isAdmin && (
            <Button className="gap-2" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Välj XML-fil
            </Button>
          )}
        </div>
      )}

      {/* Main content */}
      {activeImport && weekDates.length > 0 && (
        <div className="flex flex-1 flex-col px-6 py-4">
          {/* Day picker + view toggle */}
          <div className="mb-4 flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedDayIndex((i) => Math.max(0, i - 1))} disabled={selectedDayIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-1 gap-1.5 overflow-x-auto">
              {weekDates.map((date, idx) => {
                const isToday = date === todayStr;
                const count = scheduleEmployees.filter((emp) => scheduleShifts.some((s) => s.schedule_employee_id === emp.id && s.day_date === date && !s.is_absence_day && s.start_time)).length;
                const delivCount = deliveryEntries.filter((d) => d.delivery_date === date).length;
                const isSelected = selectedDayIndex === idx;
                return (
                  <button key={date} onClick={() => setSelectedDayIndex(idx)}
                    className={["relative flex min-w-[68px] flex-col items-center rounded-xl px-2 py-2.5 text-center transition-all",
                      isSelected ? "bg-primary text-primary-foreground shadow-[var(--shadow-md)]" : isToday ? "bg-primary-soft text-primary border border-primary/30" : "bg-card text-foreground hover:bg-muted border border-border/60"].join(" ")}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-widest">{DAY_SHORT[idx]}</span>
                    <span className="mt-0.5 text-sm font-bold">{fmtDate(date).split(" ")[0]}</span>
                    <span className={["mt-0.5 text-[10px]", isSelected ? "text-primary-foreground/70" : "text-muted-foreground"].join(" ")}>
                      {count > 0 ? `${count}p` : "–"}
                    </span>
                    {delivCount > 0 && (
                      <span className={["text-[9px] font-medium", isSelected ? "text-primary-foreground/60" : "text-info"].join(" ")}>
                        {delivCount}lev
                      </span>
                    )}
                    {isToday && !isSelected && <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedDayIndex((i) => Math.min(6, i + 1))} disabled={selectedDayIndex === 6}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-2 flex shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/40">
              <button onClick={() => setViewMode("day")} className={["flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "day" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}>
                <List className="h-3.5 w-3.5" />Dag
              </button>
              <button onClick={() => setViewMode("week")} className={["flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "week" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}>
                <LayoutGrid className="h-3.5 w-3.5" />Vecka
              </button>
            </div>
          </div>

          {/* Day heading */}
          <div className="mb-3">
            <h2 className="text-base font-semibold text-foreground">
              {viewMode === "day" ? DAY_NAMES[selectedDayIndex] : "Veckovy"}
              {viewMode === "day" && weekDates[selectedDayIndex] && <span className="ml-2 font-normal text-muted-foreground">{fmtDate(weekDates[selectedDayIndex])}</span>}
            </h2>
            {viewMode === "day" && (
              <p className="text-xs text-muted-foreground">
                {workingToday} arbetar · {absentToday > 0 ? `${absentToday} frånvaro · ` : ""}{totalStaff - workingToday - absentToday} lediga
                {todayDeliveries.length > 0 && ` · ${todayDeliveries.length} leveranser`}
              </p>
            )}
          </div>

          {/* Deliveries row for day view */}
          {viewMode === "day" && showDeliveries && todayDeliveries.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {todayDeliveries.map((d) => {
                const c = flowColor(d.flow_name);
                return (
                  <div key={d.id} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium" style={{ backgroundColor: c.bg, color: c.text, borderColor: c.text + "30" }}>
                    <Truck className="h-3 w-3" />
                    <span>{d.delivery_time} — {d.flow_name}</span>
                    {d.supplier && <span className="opacity-60 text-[10px]">· {d.supplier.split(" ").slice(0, 3).join(" ")}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Day timeline view */}
          {viewMode === "day" && (
            <div className="flex-1 overflow-auto rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
              <div className="sticky top-0 z-10 flex bg-card/95 backdrop-blur-sm border-b border-border/60">
                <div className="w-48 shrink-0 border-r border-border/40 px-4 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Medarbetare</span>
                </div>
                <div className="relative flex-1" style={{ minWidth: `${TOTAL_HOURS * 60}px` }}>
                  <div className="flex h-full">
                    {hourMarkers.map((h) => (
                      <div key={h} className="flex-1 border-r border-border/30 px-1 py-2.5 last:border-r-0">
                        <span className="text-[11px] font-mono text-muted-foreground/60">{String(h).padStart(2, "0")}:00</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Delivery markers row */}
              {showDeliveries && todayDeliveries.length > 0 && (
                <div className="flex border-b border-border/20 bg-muted/10">
                  <div className="flex w-48 shrink-0 items-center border-r border-border/30 px-4 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Leveranser
                    </span>
                  </div>
                  <div className="relative flex-1 py-1" style={{ minWidth: `${TOTAL_HOURS * 60}px` }}>
                    <div className="absolute inset-0 flex pointer-events-none">
                      {hourMarkers.map((h) => <div key={h} className="flex-1 border-r border-border/15 last:border-r-0" />)}
                    </div>
                    {todayDeliveries.map((d) => {
                      const left = timeToPercent(d.delivery_time);
                      if (left < 0 || left > 100) return null;
                      const c = flowColor(d.flow_name);
                      return (
                        <div key={d.id} className="absolute top-0.5 bottom-0.5 flex items-center rounded px-1.5 text-[10px] font-semibold cursor-default select-none" style={{ left: `${Math.max(0, left)}%`, width: "auto", minWidth: "48px", maxWidth: "10%", backgroundColor: c.bg, color: c.text, borderLeft: `2px solid ${c.text}` }}
                          title={`${d.flow_name} ${d.delivery_time} — ${d.supplier}`}>
                          {d.delivery_time}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {employeeRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <Clock className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Inga pass schemalagda denna dag</p>
                </div>
              ) : (
                employeeRows.map(({ emp, workShifts, absenceShift, appUser, weekMinutes, initials }) => (
                  <div key={emp.id} className="group flex border-b border-border/20 last:border-b-0 hover:bg-muted/20 transition-colors">
                    <div className="flex w-48 shrink-0 items-center gap-2.5 border-r border-border/30 px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ background: appUser ? "oklch(0.5 0.16 148)" : "oklch(0.88 0.02 145)", color: appUser ? "white" : "oklch(0.4 0.05 145)" }}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground leading-tight">{appUser?.display_name ?? emp.employee_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{weekMinutes > 0 ? minsToHours(weekMinutes) + " / v" : emp.employee_group || "–"}</p>
                      </div>
                    </div>
                    <div className="relative flex-1 py-2.5" style={{ minWidth: `${TOTAL_HOURS * 60}px` }}>
                      <div className="absolute inset-0 flex pointer-events-none">
                        {hourMarkers.map((h) => <div key={h} className="flex-1 border-r border-border/15 last:border-r-0" />)}
                      </div>
                      {currentNowPercent >= 0 && (
                        <div className="absolute top-0 bottom-0 z-10 w-px bg-destructive/70 pointer-events-none" style={{ left: `${currentNowPercent}%` }} />
                      )}
                      {workShifts.length === 0 ? (
                        <div className="flex h-full items-center px-3">
                          <span className="text-[11px] italic text-muted-foreground/40">{absenceShift?.deviation_cause || "Ledig"}</span>
                        </div>
                      ) : (
                        workShifts.map((shift) => {
                          const left = timeToPercent(shift.start_time!);
                          const width = shiftWidthPercent(shift.start_time!, shift.stop_time!);
                          const col = shiftColor(shift.shift_name, shift.color);
                          const light = isLightColor(col);
                          return (
                            <div key={shift.id}
                              className="absolute top-1.5 bottom-1.5 flex items-center overflow-hidden rounded-lg px-2.5 text-[11px] font-semibold shadow-sm cursor-default select-none transition-opacity hover:opacity-90"
                              style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(width, 1.5)}%`, minWidth: "36px", backgroundColor: col, color: light ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.92)", borderLeft: `2px solid ${light ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.3)"}` }}
                              title={`${shift.shift_name || emp.employee_name}: ${shift.start_time} – ${shift.stop_time}\n${minsToHours(shift.gross_minutes)}`}>
                              <span className="truncate leading-tight">
                                {shift.shift_name ? <>{shift.shift_name}<br /><span className="opacity-70">{shift.start_time}–{shift.stop_time}</span></> : `${shift.start_time}–${shift.stop_time}`}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Week overview */}
          {viewMode === "week" && (
            <div className="overflow-auto rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
              <div className="sticky top-0 z-10 grid bg-card/95 backdrop-blur-sm border-b border-border/60" style={{ gridTemplateColumns: "12rem repeat(7, 1fr)" }}>
                <div className="border-r border-border/40 px-4 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Medarbetare</span>
                </div>
                {weekDates.map((date, idx) => {
                  const isToday = date === todayStr;
                  const delivCount = deliveryEntries.filter((d) => d.delivery_date === date).length;
                  return (
                    <div key={date} className={["border-r border-border/30 last:border-r-0 px-2 py-2.5 text-center cursor-pointer hover:bg-muted/30 transition-colors", isToday ? "bg-primary-soft/40" : ""].join(" ")} onClick={() => { setSelectedDayIndex(idx); setViewMode("day"); }}>
                      <p className={["text-[10px] font-semibold uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground"].join(" ")}>{DAY_SHORT[idx]}</p>
                      <p className={["text-sm font-bold", isToday ? "text-primary" : "text-foreground"].join(" ")}>{fmtDate(date).split(" ")[0]}</p>
                      {delivCount > 0 && <p className="text-[9px] text-info font-medium">{delivCount} lev</p>}
                    </div>
                  );
                })}
              </div>

              {employeeRows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12">
                  <Clock className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Inga schemalagda pass</p>
                </div>
              ) : (
                employeeRows.map(({ emp, appUser, weekMinutes, initials }) => (
                  <div key={emp.id} className="grid border-b border-border/20 last:border-b-0 hover:bg-muted/10 transition-colors" style={{ gridTemplateColumns: "12rem repeat(7, 1fr)" }}>
                    <div className="flex items-center gap-2.5 border-r border-border/30 px-4 py-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ background: appUser ? "oklch(0.5 0.16 148)" : "oklch(0.88 0.02 145)", color: appUser ? "white" : "oklch(0.4 0.05 145)" }}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">{appUser?.display_name ?? emp.employee_name}</p>
                        <p className="text-[10px] text-muted-foreground">{weekMinutes > 0 ? minsToHours(weekMinutes) : "–"}</p>
                      </div>
                    </div>
                    {weekDates.map((date, idx) => {
                      const dayShifts = scheduleShifts.filter((s) => s.schedule_employee_id === emp.id && s.day_date === date);
                      const work = dayShifts.filter((s) => !s.is_absence_day && s.start_time);
                      const absence = dayShifts.find((s) => s.is_absence_day);
                      const isToday = date === todayStr;
                      return (
                        <div key={idx} className={["border-r border-border/20 last:border-r-0 px-1.5 py-2 flex flex-col justify-center gap-0.5 cursor-pointer hover:bg-muted/20 transition-colors", isToday ? "bg-primary-soft/20" : ""].join(" ")} onClick={() => { setSelectedDayIndex(idx); setViewMode("day"); }}>
                          {work.length === 0 && !absence && <span className="text-center text-[10px] text-muted-foreground/30">–</span>}
                          {absence && work.length === 0 && <span className="rounded px-1 py-0.5 text-center text-[10px] font-medium text-warning-foreground bg-warning/15 truncate">{absence.deviation_cause || "Frånvaro"}</span>}
                          {work.map((s) => {
                            const col = shiftColor(s.shift_name, s.color);
                            return (
                              <div key={s.id} className="rounded px-1 py-0.5 text-center text-[10px] font-semibold truncate"
                                style={{ backgroundColor: col + "55", borderLeft: `2px solid ${col}`, color: isLightColor(col) ? "oklch(0.25 0.05 145)" : "oklch(0.15 0.05 145)" }}>
                                {s.start_time}–{s.stop_time}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}

              {/* Deliveries row in week view */}
              {showDeliveries && deliveryEntries.length > 0 && (
                <div className="grid border-t border-border/40 bg-muted/10" style={{ gridTemplateColumns: "12rem repeat(7, 1fr)" }}>
                  <div className="border-r border-border/40 px-4 py-2 flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Leveranser</span>
                  </div>
                  {weekDates.map((date, idx) => {
                    const dayDeliveries = deliveryEntries.filter((d) => d.delivery_date === date);
                    const isToday = date === todayStr;
                    return (
                      <div key={idx} className={["border-r border-border/20 last:border-r-0 px-1.5 py-1.5 flex flex-col gap-0.5", isToday ? "bg-primary-soft/10" : ""].join(" ")}>
                        {dayDeliveries.map((d) => {
                          const c = flowColor(d.flow_name);
                          return (
                            <div key={d.id} className="rounded px-1 py-0.5 text-[9px] font-semibold truncate" style={{ backgroundColor: c.bg, color: c.text, borderLeft: `2px solid ${c.text}` }}>
                              {d.delivery_time} {d.flow_name}
                            </div>
                          );
                        })}
                        {dayDeliveries.length === 0 && <span className="text-center text-[10px] text-muted-foreground/20">–</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Totals footer */}
              <div className="grid border-t border-border/60 bg-muted/20" style={{ gridTemplateColumns: "12rem repeat(7, 1fr)" }}>
                <div className="border-r border-border/40 px-4 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Totalt per dag</span>
                </div>
                {weekDates.map((date, idx) => {
                  const count = scheduleEmployees.filter((emp) => scheduleShifts.some((s) => s.schedule_employee_id === emp.id && s.day_date === date && !s.is_absence_day && s.start_time)).length;
                  const mins = scheduleShifts.filter((s) => s.day_date === date && !s.is_absence_day).reduce((sum, s) => sum + (s.gross_minutes || 0), 0);
                  const isToday = date === todayStr;
                  return (
                    <div key={idx} className={["border-r border-border/20 last:border-r-0 px-2 py-2 text-center", isToday ? "bg-primary-soft/20" : ""].join(" ")}>
                      <p className={["text-xs font-bold", isToday ? "text-primary" : "text-foreground"].join(" ")}>{count}p</p>
                      <p className="text-[10px] text-muted-foreground">{mins > 0 ? minsToHours(mins) : "–"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import + mapping dialog */}
      <Dialog open={mappingOpen} onOpenChange={(o) => { if (!savingImport) { setMappingOpen(o); if (!o) setParsed(null); } }}>
        <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-hidden p-0 gap-0">
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-foreground">{parsed ? "Importera schema & matcha personal" : "Personalmatching"}</h2>
              {parsed && <p className="text-xs text-muted-foreground">{parsed.storeName && `${parsed.storeName} · `}Vecka {parsed.weekNumber}, {parsed.year} · {parsed.employees.length} anställda</p>}
            </div>
            <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" onClick={() => { if (!savingImport) { setMappingOpen(false); setParsed(null); } }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
            {parsed && (
              <div className="p-5">
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-success/30 bg-success/8 p-4">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">XML inläst</p>
                    <p className="text-muted-foreground">{parsed.storeName && `${parsed.storeName} · `}Vecka {parsed.weekNumber}, {parsed.year} · {parsed.employees.length} anställda</p>
                  </div>
                </div>
                <div className="mb-4 rounded-lg border border-info/30 bg-info/8 px-4 py-2.5 text-xs text-info">
                  Roll och butik uppdateras automatiskt för kopplade användare baserat på EmployeeGroup i XML-filen (Ledarna/Handels = Chef, Butik Timlön = Anställd).
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">Koppla SoftOne-anställda till användare</p>
                <p className="mb-4 text-xs text-muted-foreground">Matchningarna sparas automatiskt vid nästa import.</p>
                <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden">
                  {parsed.employees.map((emp) => (
                    <MappingRow key={emp.employeeNr} employeeNr={emp.employeeNr} employeeName={emp.employeeName} employeeGroup={emp.employeeGroup} appUsers={appUsers} mappedUserId={getMappedUserId(emp.employeeNr)} storeId={storeId} onMap={(uid) => setMapping(emp.employeeNr, uid)} onUserCreated={(u) => { setAppUsers((p) => [...p, u]); setMapping(emp.employeeNr, u.id); }} />
                  ))}
                </div>
              </div>
            )}
            {!parsed && imports.length > 0 && (
              <div className="p-5">
                <p className="mb-4 text-sm text-muted-foreground">Koppla SoftOne-anställda till användare i systemet.</p>
                <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden">
                  {Array.from(new Map(scheduleEmployees.map((e) => [e.employee_nr, e])).values()).map((emp) => (
                    <MappingRow key={emp.employee_nr} employeeNr={emp.employee_nr} employeeName={emp.employee_name} employeeGroup={emp.employee_group} appUsers={appUsers} mappedUserId={getMappedUserId(emp.employee_nr)} storeId={storeId} onMap={(uid) => setMapping(emp.employee_nr, uid)} onUserCreated={(u) => { setAppUsers((p) => [...p, u]); setMapping(emp.employee_nr, u.id); }} />
                  ))}
                </div>
              </div>
            )}
            {!parsed && imports.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
                <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-center text-sm text-muted-foreground">Importera ett schema först.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => { if (!savingImport) { setMappingOpen(false); setParsed(null); } }} disabled={savingImport}>{parsed ? "Avbryt" : "Stäng"}</Button>
            {!parsed && imports.length > 0 && (
              <Button size="sm" onClick={async () => { await saveMappings(); await loadMappings(); setMappingOpen(false); toast.success("Matchningar sparade!"); }}>Spara matchningar</Button>
            )}
            {parsed && <Button size="sm" onClick={confirmImport} disabled={savingImport}>{savingImport ? "Importerar…" : "Importera schema"}</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── PDF text extraction (no external deps) ──────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  // Simple PDF text extraction: find all text between BT and ET markers
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);

  const lines: string[] = [];
  const btEtRe = /BT([\s\S]*?)ET/g;
  let m;
  while ((m = btEtRe.exec(raw)) !== null) {
    const block = m[1];
    // Extract strings from (text) or <hex> tokens
    const strRe = /\(([^)]*)\)|<([0-9a-fA-F]+)>/g;
    let sm;
    const parts: string[] = [];
    while ((sm = strRe.exec(block)) !== null) {
      if (sm[1] !== undefined) {
        parts.push(sm[1].replace(/\\n/g, "\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")"));
      } else if (sm[2]) {
        // Hex decode
        const hex = sm[2];
        let s = "";
        for (let i = 0; i < hex.length; i += 2) {
          s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        }
        parts.push(s);
      }
    }
    if (parts.length > 0) lines.push(parts.join(" "));
  }
  return lines.join("\n");
}

function getISOWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary" | "default" | "warning" }) {
  const colors = { primary: "text-primary bg-primary-soft", default: "text-muted-foreground bg-muted", warning: "text-warning-foreground bg-warning/15" };
  return (
    <div className="flex items-center gap-2.5">
      <div className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", colors[tone]].join(" ")}>{icon}</div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── MappingRow ───────────────────────────────────────────────────────────────

function MappingRow({ employeeNr, employeeName, employeeGroup, appUsers, mappedUserId, storeId, onMap, onUserCreated }: {
  employeeNr: string; employeeName: string; employeeGroup: string;
  appUsers: AppUser[]; mappedUserId: string | null; storeId: string | null;
  onMap: (uid: string | null) => void; onUserCreated: (user: AppUser) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState(employeeName.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, ""));
  const [newPassword, setNewPassword] = useState("Welcome1!");
  const [createError, setCreateError] = useState("");

  const role = groupToRole(employeeGroup);
  const roleLabel = role === "manager" ? "Chef" : "Anställd";
  const roleBg = role === "manager" ? "bg-info/15 text-info" : "bg-muted text-muted-foreground";

  async function handleCreate() {
    if (!storeId) return;
    setCreateError("");
    if (newUsername.length < 3) { setCreateError("Minst 3 tecken i användarnamnet."); return; }
    if (newPassword.length < 6) { setCreateError("Minst 6 tecken i lösenordet."); return; }
    setCreating(true);
    try {
      const { data: existing } = await supabase.from("app_users").select("id").eq("username", newUsername.toLowerCase().trim()).maybeSingle();
      if (existing) { setCreateError("Användarnamnet är redan taget."); return; }
      const { data: hash } = await supabase.rpc("hash_password", { plain_password: newPassword });
      const { data: created, error } = await supabase.from("app_users").insert({ username: newUsername.toLowerCase().trim(), password_hash: hash, display_name: employeeName, role, employee_group: employeeGroup, store_id: storeId, is_active: true })
        .select("id, username, display_name, role, store_id, active_store_id, is_active, last_login, created_at").single();
      if (error || !created) { setCreateError(error?.message ?? "Något gick fel."); return; }
      onUserCreated(created as AppUser);
      setShowCreate(false);
      toast.success(`Användare ${employeeName} skapad som ${roleLabel}!`);
    } finally { setCreating(false); }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {employeeName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{employeeName}</p>
            {employeeGroup && <span className={["rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0", roleBg].join(" ")}>{roleLabel}</span>}
          </div>
          <p className="truncate text-xs text-muted-foreground">#{employeeNr}{employeeGroup ? ` · ${employeeGroup}` : ""}</p>
        </div>
        <Select value={mappedUserId ?? "__none__"} onValueChange={(v) => { if (v === "__create__") { setShowCreate((s) => !s); return; } onMap(v === "__none__" ? null : v); }}>
          <SelectTrigger className="h-8 w-48 shrink-0 text-xs"><SelectValue placeholder="Välj användare…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__"><span className="text-muted-foreground">Ingen koppling</span></SelectItem>
            {appUsers.map((u) => (<SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>))}
            <SelectItem value="__create__"><span className="flex items-center gap-1.5 text-primary"><UserPlus className="h-3 w-3" />Skapa ny användare</span></SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showCreate && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="mb-2.5 text-xs font-medium text-foreground">Skapa <span className="text-primary">{roleLabel}</span> för {employeeName}</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[11px] text-muted-foreground">Användarnamn</Label><Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="mt-1 h-7 text-xs" /></div>
            <div><Label className="text-[11px] text-muted-foreground">Lösenord</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 h-7 text-xs" /></div>
          </div>
          {createError && <p className="mt-1.5 text-[11px] text-destructive">{createError}</p>}
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" className="h-7 px-3 text-xs" onClick={handleCreate} disabled={creating}>{creating ? "Skapar…" : "Skapa"}</Button>
            <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => { setShowCreate(false); setCreateError(""); }}>Avbryt</Button>
          </div>
        </div>
      )}
    </div>
  );
}
