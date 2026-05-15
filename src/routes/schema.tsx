import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Upload, Users, Clock, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, X, UserPlus, LayoutGrid, List, Timer, Truck, FileText, Lock, FilePlus as FilePlus2, FileCode as FileCode2, ArrowLeftRight } from "lucide-react";

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
import { supabase, type AppUser, type Task } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/schema")({
  component: SchemaPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type BreakWindow = { start: string; minutes: number };

type XmlShift = {
  shiftName: string;
  startTime: string;
  stopTime: string;
  color: string;
  grossMinutes: number;
  netMinutes: number;
  breakMinutes: number;
  breakWindows: BreakWindow[];
  deviationCause: string;
  totalCost: number;
  isLended: boolean;
  shiftLink: string;
  isBorrowed: boolean;
};

type XmlDay = {
  dayNr: number;
  scheduleDate: string;
  isAbsenceDay: boolean;
  isSemester: boolean;
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
  break_minutes: number;
  break_windows: BreakWindow[];
  deviation_cause: string;
  is_absence_day: boolean;
  is_lended: boolean;
  is_borrowed: boolean;
  is_shadow_shift: boolean;
  shift_link: string;
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

// Represents one employee from XML after auto-matching
type MatchedEmployee = {
  employeeNr: string;
  employeeName: string;
  employeeGroup: string;
  matchType: "existing" | "new";
  appUserId: string | null; // set for "existing" or after creation
  newUsername: string;
  newPassword: string;
};

// ─── Shift colour mapping ─────────────────────────────────────────────────────

const SHIFT_COLORS: Record<string, { bg: string; label: string }> = {
  kassa:            { bg: "#b5c9a1", label: "Kassa" },
  "kassa reserv":   { bg: "#b5c9a1", label: "Kassa Reserv" },
  "kassa reserv 1": { bg: "#b5c9a1", label: "Kassa Reserv 1" },
  förbutik:         { bg: "#f0c87a", label: "Förbutik" },
  teamplock:        { bg: "#7d6547", label: "Teamplock" },
  butikskök:        { bg: "#4a7c4e", label: "Butikskök" },
  butik:            { bg: "#b5c9a1", label: "Butik" },
  lager:            { bg: "#9aab85", label: "Lager" },
  städning:         { bg: "#aec6b0", label: "Städning" },
  standard:         { bg: "#b0b0b0", label: "Standard" },
};

// Dynamic colors for unknown shift types — persisted in localStorage
const DYNAMIC_SHIFT_COLORS_KEY = "sf_dynamic_shift_colors";
function getDynamicShiftColors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(DYNAMIC_SHIFT_COLORS_KEY) ?? "{}"); } catch { return {}; }
}
function saveDynamicShiftColor(key: string, color: string) {
  const d = getDynamicShiftColors();
  d[key] = color;
  localStorage.setItem(DYNAMIC_SHIFT_COLORS_KEY, JSON.stringify(d));
}
// Deterministic palette for new shift types (distinct, readable)
const UNKNOWN_SHIFT_PALETTE = [
  "#e8a87c", "#a78bca", "#7ec8c8", "#e88a8a", "#8abce8", "#c8c87e",
  "#e8c88a", "#8ae8b4", "#c88ab4", "#8ab4e8", "#e8e48a", "#b4e88a",
];
function assignUnknownShiftColor(key: string): string {
  const existing = getDynamicShiftColors();
  if (existing[key]) return existing[key];
  const idx = Object.keys(existing).length % UNKNOWN_SHIFT_PALETTE.length;
  const color = UNKNOWN_SHIFT_PALETTE[idx];
  saveDynamicShiftColor(key, color);
  return color;
}

const IGNORE_COLORS = new Set(["#4caf50", "#4CAF50", "#ffffff", "#FFFFFF", "#000000", "#FFFFFFFF"]);

function shiftColor(name: string, xmlColor: string): string {
  // XML color takes priority — it's explicitly set per shift in SoftOne
  if (xmlColor && !IGNORE_COLORS.has(xmlColor) && /^#[0-9a-fA-F]{6}$/.test(xmlColor)) return xmlColor;
  const key = name.toLowerCase().trim();
  for (const k of Object.keys(SHIFT_COLORS)) {
    if (key.includes(k)) return SHIFT_COLORS[k].bg;
  }
  const dynamic = getDynamicShiftColors();
  for (const k of Object.keys(dynamic)) {
    if (key.includes(k)) return dynamic[k];
  }
  if (key) return assignUnknownShiftColor(key);
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

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function nameToUsername(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ".").replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9.]/g, "");
}

// ─── XML parsing ──────────────────────────────────────────────────────────────

function getText(el: Element, selector: string): string {
  return el.querySelector(selector)?.textContent?.trim() ?? "";
}

function parseTime(raw: string): string {
  const match = raw.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function getAttrOrText(el: Element, tag: string): string {
  return el.getAttribute(tag) || getText(el, tag);
}

function parseXml(xmlText: string): ParsedSchedule | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const root = doc.documentElement;
  if (!root || root.nodeName !== "SOE_TimeEmployeeSchedule") return null;

  const storeName =
    getAttrOrText(root, "Company") ||
    getText(root, "ReportHeader Company") ||
    getText(root, "Store StoreName") ||
    getText(root, "StoreName") || "";

  const weekEl = root.querySelector("Week");
  const weekNrText = weekEl ? (getAttrOrText(weekEl, "ScheduleWeekNr") || weekEl.getAttribute("WeekNr") || "") : "";
  const weekNumber = parseInt(weekNrText, 10) || 0;
  const yearText = weekEl ? (getAttrOrText(weekEl, "Year") || "") : "";
  const year = parseInt(yearText, 10) || new Date().getFullYear();

  // Try to extract week start from ReportHeader DateInterval (format: "YYYY-MM-DD-YYYY-MM-DD")
  const dateIntervalRaw = getText(root, "ReportHeader DateInterval") || getAttrOrText(root, "DateInterval");
  const dateIntervalMatch = dateIntervalRaw.match(/(\d{4}-\d{2}-\d{2})/);
  let weekStartDate = dateIntervalMatch ? dateIntervalMatch[1] : "";

  const employees: ParsedEmployee[] = Array.from(root.querySelectorAll("Employee")).map((empEl) => {
    const employeeNr = getAttrOrText(empEl, "EmployeeNr");
    const employeeName = getAttrOrText(empEl, "EmployeeName");
    const employeeGroup = getAttrOrText(empEl, "EmployeeGroup");

    const days: XmlDay[] = Array.from(empEl.querySelectorAll("Day")).map((dayEl) => {
      const dayNr = parseInt(getAttrOrText(dayEl, "DayNr") || "0", 10);
      const scheduleDateRaw = getAttrOrText(dayEl, "ScheduleDate");
      const scheduleDate = scheduleDateRaw.slice(0, 10);
      const absenceRaw = getAttrOrText(dayEl, "IsAbsenceDay") || "0";
      const isAbsenceDay = absenceRaw === "1" || absenceRaw.toLowerCase() === "true";
      const absenceName = getAttrOrText(dayEl, "AbsencePayrollProductName");
      if (dayNr === 1 && scheduleDate && !weekStartDate) weekStartDate = scheduleDate;

      // Day-level lended-out detection: ShiftLink (GUID) + ScheduleTotalCost = 0 + NOT absence
      const dayShiftLink = getAttrOrText(dayEl, "ShiftLink") || "";
      const dayScheduleCost = parseFloat((getAttrOrText(dayEl, "ScheduleTotalCost") || "-1").replace(",", "."));
      const isDayLendedOut = !isAbsenceDay && dayShiftLink.length > 8 && dayScheduleCost === 0;

      // Day-level break windows (ScheduleBreak1Start..ScheduleBreak4Start)
      const dayBreakWindows: BreakWindow[] = [];
      for (let bIdx = 1; bIdx <= 4; bIdx++) {
        const bStartRaw = getAttrOrText(dayEl, `ScheduleBreak${bIdx}Start`);
        const bMins = parseInt(getAttrOrText(dayEl, `ScheduleBreak${bIdx}Minutes`) || "0", 10);
        if (bStartRaw && bMins > 0) {
          dayBreakWindows.push({ start: parseTime(bStartRaw), minutes: bMins });
        }
      }
      const dayBreakTotal = parseInt(getAttrOrText(dayEl, "ScheduleBreakTime") || "0", 10);

      // Shifts are Shift1..Shift15 as direct child elements or attributes
      const shifts: XmlShift[] = [];
      for (let sIdx = 1; sIdx <= 15; sIdx++) {
        const prefix = `Shift${sIdx}`;
        // Try child element first, then attribute on dayEl
        const sName = getAttrOrText(dayEl, `${prefix}Name`);
        if (!sName) break;
        const sStartRaw = getAttrOrText(dayEl, `${prefix}StartTime`);
        const sStopRaw = getAttrOrText(dayEl, `${prefix}StopTime`);
        if (!sStartRaw && !sStopRaw) break;
        const colRaw = getAttrOrText(dayEl, `${prefix}Color`);
        // Color may be 6-char hex without #
        const xmlCol = colRaw ? (colRaw.startsWith("#") ? colRaw : `#${colRaw}`) : "";
        const netMins = parseInt(getAttrOrText(dayEl, `${prefix}NetTimeMinutes`) || "0", 10);
        const deviationCause = getAttrOrText(dayEl, `${prefix}TimeDeviationCauseName`) || absenceName;
        shifts.push({
          shiftName: sName,
          startTime: parseTime(sStartRaw),
          stopTime: parseTime(sStopRaw),
          color: xmlCol && xmlCol !== "#000000" && xmlCol !== "#FFFFFF" && xmlCol !== "#ffffff" ? xmlCol : shiftColor(sName, xmlCol),
          grossMinutes: netMins + (sIdx === 1 ? dayBreakTotal : 0),
          netMinutes: netMins,
          breakMinutes: sIdx === 1 ? dayBreakTotal : 0,
          breakWindows: sIdx === 1 ? dayBreakWindows : [],
          deviationCause,
          totalCost: dayScheduleCost,
          // Lended OUT: day-level ShiftLink present + ScheduleTotalCost=0 + not absence
          isLended: isDayLendedOut,
          shiftLink: dayShiftLink,
          isBorrowed: false,
        });
      }

      // Fallback: try <Shifts> child elements (older format)
      if (shifts.length === 0) {
        Array.from(dayEl.querySelectorAll("Shifts")).forEach((sEl) => {
          const sName = getText(sEl, "ShiftName") || getAttrOrText(sEl, "ShiftName");
          const colRaw = getText(sEl, "Color") || getAttrOrText(sEl, "Color");
          const xmlCol = colRaw ? (colRaw.startsWith("#") ? colRaw : `#${colRaw}`) : "#4CAF50";
          const grossMinutes = parseInt(getText(sEl, "ShiftGrossTimeMinutes") || "0", 10);
          const xmlNet = parseInt(getText(sEl, "ShiftNetTimeMinutes") || "0", 10);
          const netMinutes = xmlNet > 0 ? xmlNet : Math.max(0, grossMinutes - dayBreakTotal);
          shifts.push({
            shiftName: sName,
            startTime: parseTime(getText(sEl, "ShiftStartTime")),
            stopTime: parseTime(getText(sEl, "ShiftStopTime")),
            color: xmlCol && xmlCol !== "#4CAF50" ? xmlCol : shiftColor(sName, xmlCol),
            grossMinutes,
            netMinutes,
            breakMinutes: dayBreakTotal,
            breakWindows: dayBreakWindows,
            deviationCause: absenceName || getText(sEl, "ShiftTimeDeviationCauseName"),
            totalCost: dayScheduleCost,
            isLended: isDayLendedOut,
            shiftLink: dayShiftLink,
            isBorrowed: false,
          });
        });
      }

      const anyShiftSemester = shifts.some((s) =>
        s.deviationCause.toLowerCase().includes("semester") || s.deviationCause.toLowerCase().includes("holiday")
      );
      const isSemester = isAbsenceDay && (
        absenceName.toLowerCase().includes("semester") ||
        absenceName.toLowerCase().includes("holiday") ||
        anyShiftSemester
      );
      return { dayNr, scheduleDate, isAbsenceDay, isSemester, shifts };
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

function parseCsvDelivery(text: string): ParsedDelivery[] {
  const results: ParsedDelivery[] = [];
  const dayNames = new Set(Object.keys(DAY_TO_INDEX));
  // Strip BOM and split lines
  const lines = text.replace(/^\uFEFF/, "").split(/[\r\n]+/).filter(Boolean);
  for (const line of lines) {
    // Parse CSV fields (quoted or unquoted)
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
  // Parse YYYY-MM-DD as local date to avoid UTC offset shifting the date
  const [y, m, d] = weekStartDate.split("-").map(Number);
  const base = new Date(y, m - 1, d + idx);
  const yr = base.getFullYear();
  const mo = String(base.getMonth() + 1).padStart(2, "0");
  const dy = String(base.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
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
  const [y, m, d] = dateStr.split("-").map(Number);
  const result = new Date(y, m - 1, d + n);
  const yr = result.getFullYear();
  const mo = String(result.getMonth() + 1).padStart(2, "0");
  const dy = String(result.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

// Convert any ISO timestamp to local YYYY-MM-DD so UTC-offset dates match the schedule day
function toLocalDateStr(isoStr: string): string {
  const d = new Date(isoStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const [matchedEmployees, setMatchedEmployees] = useState<MatchedEmployee[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDragOver, setImportDragOver] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importProcessing, setImportProcessing] = useState(false);
  const [pdfPreviews, setPdfPreviews] = useState<Record<string, ParsedDelivery[]>>({});
  const [csvWeekNumber, setCsvWeekNumber] = useState<number>(() => getISOWeek(new Date()));
  const [csvYear, setCsvYear] = useState<number>(() => new Date().getFullYear());
  const [scheduleTasks, setScheduleTasks] = useState<Task[]>([]);
  const [scheduleTaskAssignees, setScheduleTaskAssignees] = useState<{ task_id: string; user_id: string | null }[]>([]);

  const importInputRef = useRef<HTMLInputElement>(null);
  const storeId = activeStore?.id ?? user?.store_id ?? null;
  const todayStr = new Date().toISOString().slice(0, 10);

  async function addImportFiles(newFiles: File[]) {
    const merged = [...importFiles, ...newFiles].filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i);
    setImportFiles(merged);
    // Parse CSVs immediately for preview
    for (const f of newFiles) {
      if (!f.name.toLowerCase().endsWith(".csv") || pdfPreviews[f.name] !== undefined) continue;
      try {
        const text = await f.text();
        const entries = parseCsvDelivery(text);
        setPdfPreviews((p) => ({ ...p, [f.name]: entries }));
      } catch {
        setPdfPreviews((p) => ({ ...p, [f.name]: [] }));
      }
    }
  }

  function removeImportFile(name: string) {
    setImportFiles((p) => p.filter((f) => f.name !== name));
    setPdfPreviews((p) => { const n = { ...p }; delete n[name]; return n; });
  }

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

  useEffect(() => {
    if (!storeId || !activeImport) return;
    // Fetch one day before and after the week to catch tasks stored in UTC that shift ±1 day in local time
    const queryStart = addDays(activeImport.week_start_date, -1);
    const queryEnd = addDays(activeImport.week_start_date, 7);
    supabase
      .from("tasks")
      .select("id, title, due_date, assigned_to, status, priority")
      .eq("store_id", storeId)
      .not("status", "eq", "done")
      .not("status", "eq", "cancelled")
      .gte("due_date", queryStart)
      .lte("due_date", queryEnd)
      .then(async ({ data }) => {
        const tasks = (data ?? []) as Task[];
        setScheduleTasks(tasks);
        if (tasks.length > 0) {
          const { data: assignees } = await supabase
            .from("task_assignees")
            .select("task_id, user_id")
            .in("task_id", tasks.map(t => t.id));
          setScheduleTaskAssignees((assignees ?? []) as { task_id: string; user_id: string | null }[]);
        } else {
          setScheduleTaskAssignees([]);
        }
      });
  }, [storeId, activeImport]);

  async function loadImports() {
    if (!storeId) return;
    const { data } = await supabase.from("schedule_imports").select("*").eq("store_id", storeId).order("week_start_date", { ascending: false });
    const rows = (data ?? []) as ImportRow[];
    setImports(rows);
    if (rows.length > 0 && !activeImport) {
      const todayWeekStart = getWeekStartDate(getCurrentISOWeek(), new Date().getFullYear());
      const current = rows.find((r) => r.week_start_date === todayWeekStart) ?? rows[0];
      setActiveImport(current);
    }
  }

  async function loadAppUsers() {
    if (!storeId) return;
    const { data } = await supabase.from("app_users").select("id, username, display_name, role, employee_group, store_id, active_store_id, is_active, last_login, created_at").eq("store_id", storeId).eq("is_active", true).order("display_name");
    setAppUsers((data ?? []) as AppUser[]);
    // Also load all users globally for cross-store name matching
    const { data: all } = await supabase.from("app_users").select("id, username, display_name, role, employee_group, store_id, active_store_id, is_active, last_login, created_at").eq("is_active", true).order("display_name");
    setAllUsers((all ?? []) as AppUser[]);
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

  // Unified import handler — detects by file extension
  async function processImportFiles(files: File[]) {
    if (!storeId || !user || files.length === 0) return;
    setImportProcessing(true);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext === "xml") {
          const text = await file.text();
          const result = parseXml(text);
          if (!result || result.employees.length === 0) {
            toast.error(`Kunde inte läsa XML-filen: ${file.name}. Kontrollera att det är en SoftOne GO-export.`);
            continue;
          }
          const schedule = { ...result, storeName: result.storeName || activeStore?.name || "" };
          // Auto-match employees by display_name (normalized)
          const usedUserIds = new Set<string>();
          const matched: MatchedEmployee[] = result.employees.map((emp) => {
            const savedMapping = mappings.find((m) => m.employee_nr === emp.employeeNr);
            if (savedMapping?.app_user_id) {
              usedUserIds.add(savedMapping.app_user_id);
              return { employeeNr: emp.employeeNr, employeeName: emp.employeeName, employeeGroup: emp.employeeGroup, matchType: "existing" as const, appUserId: savedMapping.app_user_id, newUsername: "", newPassword: "" };
            }
            // Try name match across all users
            const normEmp = normalizeName(emp.employeeName);
            const byName = allUsers.find((u) => !usedUserIds.has(u.id) && normalizeName(u.display_name) === normEmp);
            if (byName) {
              usedUserIds.add(byName.id);
              return { employeeNr: emp.employeeNr, employeeName: emp.employeeName, employeeGroup: emp.employeeGroup, matchType: "existing" as const, appUserId: byName.id, newUsername: "", newPassword: "" };
            }
            return { employeeNr: emp.employeeNr, employeeName: emp.employeeName, employeeGroup: emp.employeeGroup, matchType: "new" as const, appUserId: null, newUsername: nameToUsername(emp.employeeName), newPassword: "Welcome1!" };
          });
          setParsed(schedule);
          setMatchedEmployees(matched);
          setImportDialogOpen(false);
          setImportFiles([]);
          setPdfPreviews({});
          setMappingOpen(true);
          return; // XML opens mapping dialog; only handle first XML
        } else if (ext === "csv") {
          try {
            // Re-use already-parsed preview if available
            let entries = pdfPreviews[file.name];
            if (entries === undefined) {
              const text = await file.text();
              entries = parseCsvDelivery(text);
            }
            if (entries.length === 0) {
              toast.error(`Inga leveranser hittades i ${file.name}`);
              continue;
            }
            const weekNumber = csvWeekNumber;
            const year = csvYear;
            const weekStart = getWeekStartDate(weekNumber, year);
            const { data: plan, error: planErr } = await supabase.from("delivery_plans").insert({
              store_id: storeId, week_number: weekNumber, year, imported_by: user.id, filename: file.name,
            }).select().single();
            if (planErr || !plan) { toast.error(`Fel vid sparande av leveransplan: ${planErr?.message}`); continue; }
            const planId = (plan as DeliveryPlan).id;
            const rows = entries.map((e) => ({
              plan_id: planId, delivery_day: e.deliveryDay, delivery_time: e.deliveryTime,
              order_day: e.orderDay, stop_time: e.stopTime, flow_name: e.flowName, supplier: e.supplier,
              delivery_date: deliveryDateForDay(e.deliveryDay, weekStart),
            }));
            await supabase.from("delivery_entries").insert(rows);
            toast.success(`Leveransplan från ${file.name} importerad (${rows.length} leveranser)`);
          } catch (err) {
            toast.error(`Fel vid läsning av ${file.name}`);
            console.error(err);
          }
        } else {
          toast.error(`Okänt filformat: ${file.name}. Ladda upp .xml (schema) eller .csv (leveransplan).`);
        }
      }
      setImportDialogOpen(false);
      setImportFiles([]);
      setPdfPreviews({});
      await loadDeliveryPlans();
    } finally {
      setImportProcessing(false);
    }
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
      // Resolve final mappings: create new users where needed
      const finalMappings: EmployeeMapping[] = [];
      const newlyCreated: AppUser[] = [];

      for (const me of matchedEmployees) {
        if (me.matchType === "existing" && me.appUserId) {
          finalMappings.push({ employee_nr: me.employeeNr, app_user_id: me.appUserId });
          // Ensure this user is connected to the current store
          await supabase.from("user_stores").upsert({ user_id: me.appUserId, store_id: storeId, is_primary: false }, { onConflict: "user_id,store_id" });
          // Update role + group from XML — never downgrade an existing admin
          const existingUser = allUsers.find((u) => u.id === me.appUserId);
          if (me.employeeGroup && existingUser?.role !== "admin") {
            const role = groupToRole(me.employeeGroup);
            await supabase.from("app_users").update({ role, employee_group: me.employeeGroup }).eq("id", me.appUserId);
          }
        } else if (me.matchType === "new") {
          // Create user
          const username = me.newUsername || nameToUsername(me.employeeName);
          const password = me.newPassword || "Welcome1!";
          if (!username) continue;
          // Check if username taken, append suffix if so
          let finalUsername = username;
          const { data: existing } = await supabase.from("app_users").select("id").eq("username", finalUsername).maybeSingle();
          if (existing) finalUsername = `${username}_${me.employeeNr.slice(-4)}`;
          const { data: hash } = await supabase.rpc("hash_password", { plain_password: password });
          const role = groupToRole(me.employeeGroup);
          const { data: created, error: createErr } = await supabase.from("app_users").insert({
            username: finalUsername, password_hash: hash, display_name: me.employeeName,
            role, employee_group: me.employeeGroup, store_id: storeId, is_active: true,
          }).select("id, username, display_name, role, employee_group, store_id, active_store_id, is_active, last_login, created_at").single();
          if (createErr || !created) {
            toast.error(`Kunde inte skapa användare för ${me.employeeName}: ${createErr?.message}`);
            continue;
          }
          const newUser = created as AppUser;
          newlyCreated.push(newUser);
          // Connect to store via user_stores
          await supabase.from("user_stores").insert({ user_id: newUser.id, store_id: storeId, is_primary: true });
          finalMappings.push({ employee_nr: me.employeeNr, app_user_id: newUser.id });
        }
      }

      // Persist mappings
      for (const m of finalMappings) {
        const { error: mapErr } = await supabase.from("employee_mappings").upsert(
          { store_id: storeId, employee_nr: m.employee_nr, app_user_id: m.app_user_id || null, created_by: user.id, updated_at: new Date().toISOString() },
          { onConflict: "store_id,employee_nr" }
        );
        if (mapErr) console.error("employee_mappings upsert error:", mapErr);
      }
      setMappings(finalMappings);

      // Create schedule import record
      const { data: importData, error: importErr } = await supabase
        .from("schedule_imports")
        .insert({ store_id: storeId, week_start_date: parsed.weekStartDate, week_number: parsed.weekNumber, year: parsed.year, imported_by: user.id, filename: `vecka_${parsed.weekNumber}_${parsed.year}.xml`, raw_employee_count: parsed.employees.length })
        .select().single();
      if (importErr || !importData) throw new Error(`schedule_imports: ${importErr?.message ?? "Import failed"}`);
      const importId = (importData as ImportRow).id;

      for (const emp of parsed.employees) {
        const { data: empData, error: empErr } = await supabase.from("schedule_employees").insert({ import_id: importId, employee_nr: emp.employeeNr, employee_name: emp.employeeName, employee_group: emp.employeeGroup }).select().single();
        if (empErr || !empData) continue;
        const empId = (empData as ScheduleEmployee).id;
        const rows = emp.days.flatMap((day) => {
          const isAbsence = day.isAbsenceDay || day.isSemester;
          if (day.shifts.length > 0) {
            // Absence takes priority: shifts become shadow shifts (metadata only, no worked time)
            return day.shifts.map((s) => ({
              schedule_employee_id: empId,
              import_id: importId,
              day_date: day.scheduleDate,
              start_time: s.startTime || null,
              stop_time: s.stopTime || null,
              shift_name: s.shiftName,
              color: isAbsence ? (day.isSemester ? "#fca5a5" : "#e0e0e0") : s.color,
              // Absence day: no counted minutes regardless of what XML shift says
              gross_minutes: isAbsence ? 0 : s.grossMinutes,
              net_minutes: isAbsence ? 0 : s.netMinutes,
              break_minutes: isAbsence ? 0 : s.breakMinutes,
              break_windows: isAbsence ? [] : s.breakWindows,
              deviation_cause: s.deviationCause || (day.isSemester ? "Semester" : ""),
              is_absence_day: isAbsence,
              is_lended: s.isLended,
              is_borrowed: s.isBorrowed,
              shift_link: s.shiftLink,
              is_shadow_shift: isAbsence && !!(s.startTime || s.shiftName),
            }));
          }
          if (isAbsence) {
            return [{
              schedule_employee_id: empId,
              import_id: importId,
              day_date: day.scheduleDate,
              start_time: null,
              stop_time: null,
              shift_name: day.isSemester ? "Semester" : "",
              color: day.isSemester ? "#fca5a5" : "#e0e0e0",
              gross_minutes: 0,
              net_minutes: 0,
              break_minutes: 0,
              break_windows: [],
              deviation_cause: day.isSemester ? "Semester" : "",
              is_absence_day: true,
              is_lended: false,
              is_borrowed: false,
              shift_link: "",
              is_shadow_shift: false,
            }];
          }
          return [];
        });
        if (rows.length > 0) await supabase.from("schedule_shifts").insert(rows);
      }

      const createdCount = newlyCreated.length;
      const matchedCount = finalMappings.length - createdCount;
      toast.success(`Schema vecka ${parsed.weekNumber} importerat. ${matchedCount} matchade · ${createdCount > 0 ? `${createdCount} nya konton skapade` : "inga nya konton"}.`);
      if (newlyCreated.length > 0) setAppUsers((p) => [...p, ...newlyCreated]);
      setMappingOpen(false);
      setParsed(null);
      setMatchedEmployees([]);
      await loadImports();
      setActiveImport(importData as ImportRow);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Import misslyckades: ${msg}`);
      console.error("confirmImport error:", err);
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
      const shadowShifts = dayShifts.filter((s) => s.is_absence_day && s.is_shadow_shift && s.start_time);
      const absenceShift = dayShifts.find((s) => s.is_absence_day);
      const mapping = mappings.find((m) => m.employee_nr === emp.employee_nr);
      const appUser = mapping?.app_user_id ? appUsers.find((u) => u.id === mapping.app_user_id) : null;
      const weekMinutes = allShifts.filter((s) => !s.is_absence_day && s.start_time).reduce((sum, s) => sum + (s.net_minutes > 0 ? s.net_minutes : Math.max(0, s.gross_minutes - s.break_minutes)), 0);
      const initials = (appUser?.display_name ?? emp.employee_name).split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
      const dayTasks = appUser
        ? scheduleTasks.filter((t) => {
            if (!t.due_date || toLocalDateStr(t.due_date) !== currentDate) return false;
            if (t.assigned_to === appUser.id) return true;
            return scheduleTaskAssignees.some(a => a.task_id === t.id && a.user_id === appUser.id);
          })
        : [];
      return { emp, dayShifts, workShifts, shadowShifts, absenceShift, appUser, weekMinutes, initials, dayTasks };
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
              <Button size="sm" className="gap-1.5" onClick={() => { setImportFiles([]); setPdfPreviews({}); if (activeImport) { setCsvWeekNumber(activeImport.week_number + 1 > 53 ? 1 : activeImport.week_number + 1); setCsvYear(activeImport.year); } setImportDialogOpen(true); }}>
                <Upload className="h-4 w-4" />
                Importera
              </Button>
            )}
            {!isAdmin && (
              <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Enbart visning
              </div>
            )}
            <input ref={importInputRef} type="file" accept=".xml,.csv" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) addImportFiles(files); e.target.value = ""; }} />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {activeImport && (
        <div className="grid grid-cols-2 gap-3 border-b border-border/40 bg-card/50 px-6 py-3 sm:grid-cols-4">
          <StatPill icon={<Users className="h-4 w-4" />} label="Arbetar idag" value={String(workingToday)} tone="primary" />
          <StatPill icon={<Calendar className="h-4 w-4" />} label="Totalt i veckan" value={String(totalStaff)} tone="default" />
          <StatPill icon={<Clock className="h-4 w-4" />} label="Frånvaro idag" value={String(absentToday)} tone={absentToday > 0 ? "warning" : "default"} />
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
            <Button className="gap-2" onClick={() => { setImportFiles([]); setPdfPreviews({}); if (activeImport) { setCsvWeekNumber(activeImport.week_number + 1 > 53 ? 1 : activeImport.week_number + 1); setCsvYear(activeImport.year); } setImportDialogOpen(true); }}>
              <Upload className="h-4 w-4" />
              Importera schema
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
                employeeRows.map(({ emp, workShifts, shadowShifts, absenceShift, appUser, weekMinutes, initials, dayTasks }) => {
                  const isSemesterDay = absenceShift?.deviation_cause?.toLowerCase().includes("semester") || absenceShift?.shift_name?.toLowerCase() === "semester";
                  return (
                  <div key={emp.id} className={["group flex border-b border-border/20 last:border-b-0 transition-colors", isSemesterDay ? "bg-red-50/60 hover:bg-red-50/80 dark:bg-red-950/20" : "hover:bg-muted/20"].join(" ")} style={{ minHeight: dayTasks.length > 0 ? "56px" : undefined }}>
                    <div className={["flex w-48 shrink-0 items-center gap-2.5 border-r px-4 py-3", isSemesterDay ? "border-red-200/60 dark:border-red-800/40" : "border-border/30"].join(" ")}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ background: isSemesterDay ? "#fca5a5" : appUser ? "oklch(0.5 0.16 148)" : "oklch(0.88 0.02 145)", color: isSemesterDay ? "#7f1d1d" : appUser ? "white" : "oklch(0.4 0.05 145)" }}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground leading-tight">{appUser?.display_name ?? emp.employee_name}</p>
                        {isSemesterDay && <p className="truncate text-[10px] text-red-500 font-medium">Semester</p>}
                      </div>
                    </div>
                    <div className="relative flex-1 py-2.5" style={{ minWidth: `${TOTAL_HOURS * 60}px` }}>
                      <div className="absolute inset-0 flex pointer-events-none">
                        {hourMarkers.map((h) => <div key={h} className="flex-1 border-r border-border/15 last:border-r-0" />)}
                      </div>
                      {currentNowPercent >= 0 && (
                        <div className="absolute top-0 bottom-0 z-10 w-px bg-destructive/70 pointer-events-none" style={{ left: `${currentNowPercent}%` }} />
                      )}
                      {isSemesterDay ? (
                        <>
                          <div className="absolute top-1.5 bottom-1.5 flex items-center" style={{ left: "12px" }}>
                            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-100/60 px-3 py-1.5 dark:border-red-800/40 dark:bg-red-900/20">
                              <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Semester</span>
                            </div>
                          </div>
                          {shadowShifts.map((shift) => {
                            const left = timeToPercent(shift.start_time!);
                            const width = shiftWidthPercent(shift.start_time!, shift.stop_time!);
                            return (
                              <div key={shift.id} className="absolute top-1.5 bottom-1.5 opacity-30 pointer-events-none" style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(width, 1.5)}%`, minWidth: "36px" }}>
                                <div className="absolute inset-0 rounded-lg border border-dashed border-red-400 bg-red-100/40"
                                  title={`Skuggpass: ${shift.shift_name} ${shift.start_time}–${shift.stop_time}\nOrsak: ${shift.deviation_cause}`} />
                              </div>
                            );
                          })}
                        </>
                      ) : workShifts.length === 0 ? (
                        <div className="flex h-full items-center px-3">
                          <span className="text-[11px] italic text-muted-foreground/40">{absenceShift?.deviation_cause || "Ledig"}</span>
                        </div>
                      ) : (
                        workShifts.map((shift) => {
                          const left = timeToPercent(shift.start_time!);
                          const width = shiftWidthPercent(shift.start_time!, shift.stop_time!);
                          const col = shiftColor(shift.shift_name, shift.color);
                          const light = isLightColor(col);
                          const bws: BreakWindow[] = Array.isArray(shift.break_windows) ? shift.break_windows : [];
                          return (
                            <div key={shift.id} className="absolute top-1.5 bottom-1.5" style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(width, 1.5)}%`, minWidth: "36px" }}>
                              <div
                                className="absolute inset-0 flex items-center gap-1 overflow-hidden rounded-lg px-2 text-[11px] font-semibold shadow-sm cursor-default select-none transition-opacity hover:opacity-90"
                                style={{ backgroundColor: col, color: light ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.92)", borderLeft: `2px solid ${light ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.3)"}` }}
                                title={[
                                  `${shift.shift_name || emp.employee_name}: ${shift.start_time} – ${shift.stop_time}`,
                                  `Brutto: ${minsToHours(shift.gross_minutes)}`,
                                  shift.break_minutes > 0 ? `Rast: ${shift.break_minutes} min` : null,
                                  `Netto: ${minsToHours(shift.net_minutes > 0 ? shift.net_minutes : Math.max(0, shift.gross_minutes - shift.break_minutes))}`,
                                  shift.is_lended ? "↔ Utlånad till annan enhet" : null,
                                ].filter(Boolean).join("\n")}>
                                {shift.is_lended && <ArrowLeftRight className="h-2.5 w-2.5 shrink-0 opacity-80" />}
                                <span className="truncate leading-tight">
                                  {shift.shift_name ? <>{shift.shift_name}<br /><span className="opacity-70">{shift.start_time}–{shift.stop_time}</span></> : `${shift.start_time}–${shift.stop_time}`}
                                </span>
                              </div>
                              {bws.map((bw, bi) => {
                                const bLeft = ((timeToPercent(bw.start) - left) / width) * 100;
                                const bWidth = ((bw.minutes / (TOTAL_HOURS * 60)) * 100 / width) * 100;
                                // Skip break windows that fall outside this shift's bounds
                                if (bLeft < 0 || bLeft >= 100) return null;
                                const clampedWidth = Math.min(bWidth, 100 - bLeft);
                                return (
                                  <div key={bi} className="absolute top-0 bottom-0 z-20 pointer-events-none"
                                    style={{ left: `${bLeft}%`, width: `${Math.max(clampedWidth, 1)}%` }}
                                    title={`Rast ${bw.start}, ${bw.minutes} min`}>
                                    <div className="absolute inset-0 rounded-sm bg-black/25 backdrop-brightness-75" />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })
                      )}
                      {dayTasks.map((task) => {
                        if (!task.due_date) return null;
                        const dueTime = new Date(task.due_date).toTimeString().slice(0, 5);
                        const dueH = parseInt(dueTime.split(":")[0]);
                        if (dueH < TIMELINE_START || dueH > TIMELINE_END) return null;
                        const dueLeft = timeToPercent(dueTime);
                        const isLate = task.status === "late" || new Date(task.due_date) < new Date();
                        return (
                          <div key={task.id} className="absolute bottom-0.5 z-30 -translate-x-1/2 pointer-events-auto" style={{ left: `${dueLeft}%` }} title={`${task.title}\nKlar senast: ${dueTime}\nPrioritet: ${task.priority}`}>
                            <div className={["flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm whitespace-nowrap", isLate ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"].join(" ")}>
                              <Timer className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate max-w-[80px]">{task.title}</span>
                              <span className="opacity-80">{dueTime}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })
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
                      </div>
                    </div>
                    {weekDates.map((date, idx) => {
                      const dayShifts = scheduleShifts.filter((s) => s.schedule_employee_id === emp.id && s.day_date === date);
                      const work = dayShifts.filter((s) => !s.is_absence_day && s.start_time);
                      const absence = dayShifts.find((s) => s.is_absence_day);
                      const isSemDay = absence?.deviation_cause?.toLowerCase().includes("semester") || absence?.shift_name?.toLowerCase() === "semester";
                      const isToday = date === todayStr;
                      return (
                        <div key={idx} className={["border-r border-border/20 last:border-r-0 px-1.5 py-2 flex flex-col justify-center gap-0.5 cursor-pointer transition-colors", isSemDay ? "bg-red-50/70 hover:bg-red-50 dark:bg-red-950/20" : isToday ? "bg-primary-soft/20 hover:bg-muted/20" : "hover:bg-muted/20"].join(" ")} onClick={() => { setSelectedDayIndex(idx); setViewMode("day"); }}>
                          {work.length === 0 && !absence && <span className="text-center text-[10px] text-muted-foreground/30">–</span>}
                          {absence && work.length === 0 && (
                            <span className={["rounded px-1 py-0.5 text-center text-[10px] font-medium truncate", isSemDay ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-warning/15 text-warning-foreground"].join(" ")}>
                              {isSemDay ? "Semester" : absence.deviation_cause || "Frånvaro"}
                            </span>
                          )}
                          {work.map((s) => {
                            const col = shiftColor(s.shift_name, s.color);
                            return (
                              <div key={s.id} className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold truncate"
                                style={{ backgroundColor: col + "55", borderLeft: `2px solid ${col}`, color: isLightColor(col) ? "oklch(0.25 0.05 145)" : "oklch(0.15 0.05 145)" }}
                                title={s.is_lended ? "↔ Utlånad till annan enhet" : undefined}>
                                {s.is_lended && <ArrowLeftRight className="h-2 w-2 shrink-0" />}
                                <span className="truncate">{s.start_time}–{s.stop_time}</span>
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

      {/* Unified import dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(o) => { if (!importProcessing) { setImportDialogOpen(o); if (!o) { setImportFiles([]); setPdfPreviews({}); } } }}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col p-0 gap-0 overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold">Importera filer</h2>
              <p className="text-xs text-muted-foreground">Schema (XML) och/eller leveransplan (CSV)</p>
            </div>
            <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors" onClick={() => { if (!importProcessing) { setImportDialogOpen(false); setImportFiles([]); setPdfPreviews({}); } }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
            {/* Info boxes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-3">
                <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Schema (XML)</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">SoftOne GO-export med anställda och skift</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Leveransplan (CSV)</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Export från Coop-portalen — välj veckonummer nedan</p>
                </div>
              </div>
            </div>

            {/* Week picker for CSV */}
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground shrink-0">Leveransplan gäller vecka</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={53}
                  value={csvWeekNumber}
                  onChange={(e) => setCsvWeekNumber(Math.max(1, Math.min(53, parseInt(e.target.value) || 1)))}
                  className="w-16 rounded-lg border border-border/60 bg-background px-2 py-1 text-center text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="text-xs text-muted-foreground">/</span>
                <input
                  type="number"
                  min={2020}
                  max={2099}
                  value={csvYear}
                  onChange={(e) => setCsvYear(parseInt(e.target.value) || new Date().getFullYear())}
                  className="w-20 rounded-lg border border-border/60 bg-background px-2 py-1 text-center text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {getWeekStartDate(csvWeekNumber, csvYear)} →
              </span>
            </div>

            {/* Drop zone */}
            <div
              className={[
                "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-8 px-6 text-center transition-colors cursor-pointer select-none",
                importDragOver ? "border-primary bg-primary-soft/40" : "border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
              ].join(" ")}
              onDragOver={(e) => { e.preventDefault(); setImportDragOver(true); }}
              onDragLeave={() => setImportDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setImportDragOver(false);
                const dropped = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith(".xml") || f.name.toLowerCase().endsWith(".csv"));
                if (dropped.length) addImportFiles(dropped);
              }}
              onClick={() => importInputRef.current?.click()}
            >
              <div className={["flex h-10 w-10 items-center justify-center rounded-2xl transition-colors", importDragOver ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"].join(" ")}>
                <FilePlus2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Dra och släpp filer här</p>
                <p className="mt-0.5 text-xs text-muted-foreground">eller klicka för att välja · .xml och .csv</p>
              </div>
            </div>

            {/* File list with PDF previews */}
            {importFiles.length > 0 && (
              <div className="space-y-3">
                {importFiles.map((f) => {
                  const isCsv = f.name.toLowerCase().endsWith(".csv");
                  const preview = pdfPreviews[f.name];
                  return (
                    <div key={f.name} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                      {/* File header row */}
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        {isCsv ? <FileText className="h-4 w-4 shrink-0 text-info" /> : <FileCode2 className="h-4 w-4 shrink-0 text-primary" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{f.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {isCsv ? "Leveransplan CSV" : "Schema XML"} · {(f.size / 1024).toFixed(0)} KB
                            {isCsv && preview !== undefined && (
                              <span className={preview.length > 0 ? " · text-success" : " · text-warning"}>
                                {preview.length > 0 ? ` · ${preview.length} leveranser hittade` : " · inga leveranser hittades"}
                              </span>
                            )}
                            {isCsv && preview === undefined && <span className="text-muted-foreground"> · läser…</span>}
                          </p>
                        </div>
                        <button className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-destructive transition-colors" onClick={(e) => { e.stopPropagation(); removeImportFile(f.name); }} aria-label="Ta bort">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* CSV delivery preview table */}
                      {isCsv && preview && preview.length > 0 && (
                        <div className="border-t border-border/40">
                          <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] gap-0 text-[10px]">
                            <div className="col-span-5 grid grid-cols-[1fr_auto_auto_auto_1fr] bg-muted/40 px-3 py-1.5 font-semibold uppercase tracking-wide text-muted-foreground">
                              <span>Leveransdag</span>
                              <span className="px-3">Tid</span>
                              <span className="px-3">Beställ</span>
                              <span className="px-3">Stopp</span>
                              <span>Flöde / Leverantör</span>
                            </div>
                            {preview.map((d, i) => {
                              const c = flowColor(d.flowName);
                              return (
                                <div key={i} className="col-span-5 grid grid-cols-[1fr_auto_auto_auto_1fr] items-center border-t border-border/20 px-3 py-1.5 hover:bg-muted/20 transition-colors">
                                  <span className="font-medium text-foreground capitalize">{d.deliveryDay}</span>
                                  <span className="px-3 font-mono text-foreground">{d.deliveryTime}</span>
                                  <span className="px-3 text-muted-foreground capitalize">{d.orderDay}</span>
                                  <span className="px-3 font-mono text-muted-foreground">{d.stopTime}</span>
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: c.bg, color: c.text }}>{d.flowName || "–"}</span>
                                    <span className="truncate text-muted-foreground">{d.supplier}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* No deliveries found warning */}
                      {isCsv && preview && preview.length === 0 && (
                        <div className="border-t border-border/40 flex items-center gap-2 px-3 py-2.5 bg-warning/5">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
                          <p className="text-[11px] text-warning">Kunde inte läsa leveranser från denna CSV. Kontrollera att det är en korrekt leveransplan.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
            <Button variant="outline" size="sm" onClick={() => { setImportDialogOpen(false); setImportFiles([]); setPdfPreviews({}); }} disabled={importProcessing}>Avbryt</Button>
            <Button size="sm" onClick={() => processImportFiles(importFiles)} disabled={importFiles.length === 0 || importProcessing} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              {importProcessing ? "Importerar…" : `Importera${importFiles.length > 0 ? ` (${importFiles.length})` : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import + mapping dialog */}
      <Dialog open={mappingOpen} onOpenChange={(o) => { if (!savingImport) { setMappingOpen(o); if (!o) { setParsed(null); setMatchedEmployees([]); } } }}>
        <DialogContent className="flex h-[90vh] w-full max-w-2xl flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-5 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-foreground">
                {parsed ? "Granska och bekräfta import" : "Personalmatching"}
              </h2>
              {parsed && (
                <p className="text-xs text-muted-foreground">
                  {parsed.storeName && `${parsed.storeName} · `}Vecka {parsed.weekNumber}, {parsed.year} · {parsed.employees.length} anställda
                </p>
              )}
            </div>
            <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors" onClick={() => { if (!savingImport) { setMappingOpen(false); setParsed(null); setMatchedEmployees([]); } }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {parsed && matchedEmployees.length > 0 && (
              <div className="p-5 space-y-4">
                {/* Summary pills */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {matchedEmployees.filter((m) => m.matchType === "existing").length} matchade befintliga
                  </span>
                  {matchedEmployees.filter((m) => m.matchType === "new").length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                      <UserPlus className="h-3.5 w-3.5" />
                      {matchedEmployees.filter((m) => m.matchType === "new").length} nya konton skapas
                    </span>
                  )}
                </div>

                {/* Existing matches */}
                {matchedEmployees.some((m) => m.matchType === "existing") && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Matchade användare</p>
                    <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden">
                      {matchedEmployees.filter((m) => m.matchType === "existing").map((me) => {
                        const matched = allUsers.find((u) => u.id === me.appUserId);
                        const role = groupToRole(me.employeeGroup);
                        const roleLabel = role === "manager" ? "Chef" : "Anställd";
                        return (
                          <div key={me.employeeNr} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-[10px] font-bold text-success">
                              {me.employeeName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{me.employeeName}</p>
                              <p className="text-xs text-muted-foreground">{me.employeeGroup || "—"}</p>
                            </div>
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-success/60" />
                            <div className="min-w-0 text-right">
                              <p className="text-xs font-medium text-foreground">{matched?.display_name ?? "–"}</p>
                              <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
                            </div>
                            <Select
                              value={me.appUserId ?? "__none__"}
                              onValueChange={(v) => setMatchedEmployees((prev) => prev.map((x) => x.employeeNr === me.employeeNr ? { ...x, appUserId: v === "__none__" ? null : v, matchType: v === "__none__" ? "new" : "existing" } : x))}
                            >
                              <SelectTrigger className="h-7 w-36 shrink-0 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__"><span className="text-muted-foreground">Inget konto</span></SelectItem>
                                {allUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* New users to create */}
                {matchedEmployees.some((m) => m.matchType === "new") && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nya konton skapas</p>
                    <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden">
                      {matchedEmployees.filter((m) => m.matchType === "new").map((me) => {
                        const role = groupToRole(me.employeeGroup);
                        const roleLabel = role === "manager" ? "Chef" : "Anställd";
                        return (
                          <div key={me.employeeNr} className="px-4 py-3 space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">
                                {me.employeeName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-foreground">{me.employeeName}</p>
                                  <span className={["rounded-full px-1.5 py-0.5 text-[10px] font-semibold", role === "manager" ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"].join(" ")}>{roleLabel}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{me.employeeGroup || "—"}</p>
                              </div>
                              <Select
                                value="__new__"
                                onValueChange={(v) => { if (v !== "__new__") setMatchedEmployees((prev) => prev.map((x) => x.employeeNr === me.employeeNr ? { ...x, appUserId: v, matchType: "existing" } : x)); }}
                              >
                                <SelectTrigger className="h-7 w-36 shrink-0 text-xs"><SelectValue placeholder="Skapa nytt" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__new__"><span className="text-primary font-medium">Skapa nytt konto</span></SelectItem>
                                  {allUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pl-11">
                              <div>
                                <Label className="text-[11px] text-muted-foreground">Användarnamn</Label>
                                <Input value={me.newUsername} onChange={(e) => setMatchedEmployees((prev) => prev.map((x) => x.employeeNr === me.employeeNr ? { ...x, newUsername: e.target.value } : x))} className="mt-1 h-7 text-xs" />
                              </div>
                              <div>
                                <Label className="text-[11px] text-muted-foreground">Lösenord</Label>
                                <Input type="password" value={me.newPassword} onChange={(e) => setMatchedEmployees((prev) => prev.map((x) => x.employeeNr === me.employeeNr ? { ...x, newPassword: e.target.value } : x))} className="mt-1 h-7 text-xs" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* View existing mappings (no pending import) */}
            {!parsed && imports.length > 0 && (
              <div className="p-5">
                <p className="mb-4 text-sm text-muted-foreground">Koppla SoftOne-anställda till användare i systemet.</p>
                <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden">
                  {Array.from(new Map(scheduleEmployees.map((e) => [e.employee_nr, e])).values()).map((emp) => (
                    <MappingRow key={emp.employee_nr} employeeNr={emp.employee_nr} employeeName={emp.employee_name} employeeGroup={emp.employee_group} appUsers={allUsers} mappedUserId={getMappedUserId(emp.employee_nr)} storeId={storeId} onMap={(uid) => setMapping(emp.employee_nr, uid)} onUserCreated={(u) => { setAppUsers((p) => [...p, u]); setAllUsers((p) => [...p, u]); setMapping(emp.employee_nr, u.id); }} />
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

          {/* Sticky footer */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
            <Button variant="outline" size="sm" onClick={() => { if (!savingImport) { setMappingOpen(false); setParsed(null); setMatchedEmployees([]); } }} disabled={savingImport}>
              {parsed ? "Avbryt" : "Stäng"}
            </Button>
            {!parsed && imports.length > 0 && (
              <Button size="sm" onClick={async () => { await saveMappings(); await loadMappings(); setMappingOpen(false); toast.success("Matchningar sparade!"); }}>
                Spara matchningar
              </Button>
            )}
            {parsed && (
              <Button size="sm" onClick={confirmImport} disabled={savingImport} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                {savingImport ? "Importerar…" : "Bekräfta och importera"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function getISOWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getCurrentISOWeek(): number {
  return getISOWeek(new Date());
}

function getWeekStartDate(week: number, year: number): string {
  // ISO 8601: week 1 is the week containing the first Thursday of the year
  const jan4 = new Date(year, 0, 4);
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const start = new Date(mondayOfWeek1);
  start.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
  // Use local date to avoid UTC offset shifting
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
