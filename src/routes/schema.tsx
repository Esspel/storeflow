import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Calendar, CalendarClock, ChevronLeft, ChevronRight, Download, Upload, Users, Clock, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, X, UserPlus, LayoutGrid, List, Timer, Trash2, Truck, FileText, Lock, FilePlus as FilePlus2, FileCode as FileCode2, ArrowLeftRight, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase, type AppUser, type Task, type Meeting } from "@/lib/supabase";
import { generatePassword, usernameFromName } from "@/lib/text-utils";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSpecialWeekHoliday, stockholmToUtc, formatStockholmTime, isoWeekNumber } from "@/lib/swedish-holidays";

function SchemaRoute() {
  const { activeStore, user } = useAuth();
  const storeId = activeStore?.id ?? user?.store_id ?? "none";
  return <SchemaPage key={storeId} />;
}

export const Route = createFileRoute("/schema")({
  component: SchemaRoute,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type BreakWindow = { start: string; minutes: number };

type XmlShift = {
  shiftName: string;
  description: string;
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
  isPreliminary: boolean;
  isZeroScheduleDay: boolean;
  shifts: XmlShift[];
};

type ParsedEmployee = {
  employeeNr: string;
  employeeName: string;
  employeeGroup: string;
  employeeCategory: string;
  employmentPercent: number | null;
  workTimeWeek: number | null;
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
  employee_category: string;
  employment_percent: number | null;
  work_time_week: number | null;
};

type ScheduleShift = {
  id: string;
  schedule_employee_id: string;
  day_date: string;
  start_time: string | null;
  stop_time: string | null;
  shift_name: string;
  shift_description: string;
  color: string;
  gross_minutes: number;
  net_minutes: number;
  break_minutes: number;
  break_windows: BreakWindow[];
  deviation_cause: string;
  is_absence_day: boolean;
  is_preliminary: boolean;
  is_zero_schedule_day: boolean;
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
  is_special_week: boolean;
  is_default_template: boolean;
  holiday_name: string | null;
  notes: string | null;
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
  isBorrowed?: boolean; // true if user belongs to another store (Lånad Personal)
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

// Read a file as text with automatic encoding detection.
// Tries UTF-8 first; if the result contains replacement characters (U+FFFD)
// it re-reads with windows-1252 (which covers ISO-8859-1 as a superset).
async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("windows-1252").decode(buf);
  } catch {
    return utf8;
  }
}

function nameToUsername(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ".").replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9.]/g, "");
}

// ─── XML parsing ──────────────────────────────────────────────────────────────

function getText(el: Element, selector: string): string {
  return el.querySelector(selector)?.textContent?.trim() ?? "";
}

function parseTime(raw: string): string {
  // Handles "T08:00", "08:00", "2026-02-03T08:00:00+01:00"
  const iso = raw.match(/T(\d{2}:\d{2})/);
  if (iso) return iso[1];
  const plain = raw.match(/^(\d{2}:\d{2})/);
  if (plain) return plain[1];
  return "";
}

function getAttrOrText(el: Element, tag: string): string {
  return el.getAttribute(tag) || getText(el, tag);
}

// Parse a single <Day> element into XmlDay. weekStartDate is mutated by reference via callback.
function parseXmlDay(
  dayEl: Element,
  absenceNameFallback: string,
  onMonday: (date: string) => void,
): XmlDay {
  const dayNr = parseInt(getAttrOrText(dayEl, "DayNr") || "0", 10);
  const scheduleDateRaw = getAttrOrText(dayEl, "ScheduleDate");
  // ScheduleDate may be "2026-02-03T00:00:00+01:00" or "2026-02-03"
  const scheduleDate = scheduleDateRaw.length >= 10 ? scheduleDateRaw.slice(0, 10) : "";
  const absenceRaw = getAttrOrText(dayEl, "IsAbsenceDay") || "0";
  const isAbsenceDay = absenceRaw === "1" || absenceRaw.toLowerCase() === "true";
  const absenceName = getAttrOrText(dayEl, "AbsencePayrollProductName") || absenceNameFallback;
  const isPreliminaryRaw = getAttrOrText(dayEl, "IsPreliminary") || "0";
  const isPreliminary = isPreliminaryRaw === "1" || isPreliminaryRaw.toLowerCase() === "true";
  const isZeroRaw = getAttrOrText(dayEl, "IsZeroScheduleDay") || "0";
  const isZeroScheduleDay = isZeroRaw === "1" || isZeroRaw.toLowerCase() === "true";

  // DayNr=1 is Monday — use it to anchor the week start date
  if (dayNr === 1 && scheduleDate) onMonday(scheduleDate);

  const dayShiftLink = getAttrOrText(dayEl, "ShiftLink") || "";
  const dayScheduleCost = parseFloat((getAttrOrText(dayEl, "ScheduleTotalCost") || "-1").replace(",", "."));
  const isDayLendedOut = !isAbsenceDay && dayShiftLink.length > 8 && dayScheduleCost === 0;

  // Break windows (ScheduleBreak1Start..ScheduleBreak4Start)
  const dayBreakWindows: BreakWindow[] = [];
  for (let bIdx = 1; bIdx <= 4; bIdx++) {
    const bStartRaw = getAttrOrText(dayEl, `ScheduleBreak${bIdx}Start`);
    const bMins = parseInt(getAttrOrText(dayEl, `ScheduleBreak${bIdx}Minutes`) || "0", 10);
    const bStart = parseTime(bStartRaw);
    if (bStart && bMins > 0) dayBreakWindows.push({ start: bStart, minutes: bMins });
  }
  const dayBreakTotal = parseInt(getAttrOrText(dayEl, "ScheduleBreakTime") || "0", 10);

  // Shifts: Shift1Name..Shift15Name as attributes or child elements on Day
  const shifts: XmlShift[] = [];
  for (let sIdx = 1; sIdx <= 15; sIdx++) {
    const prefix = `Shift${sIdx}`;
    const sName = getAttrOrText(dayEl, `${prefix}Name`);
    if (!sName) continue;
    const sStartRaw = getAttrOrText(dayEl, `${prefix}StartTime`);
    const sStopRaw = getAttrOrText(dayEl, `${prefix}StopTime`);
    // An absence/lended shift may have a name but no times — skip it but keep scanning
    if (!sStartRaw && !sStopRaw) continue;
    const colRaw = getAttrOrText(dayEl, `${prefix}Color`);
    const xmlCol = colRaw ? (colRaw.startsWith("#") ? colRaw : `#${colRaw}`) : "";
    const grossMins = parseInt(getAttrOrText(dayEl, `${prefix}GrossTimeMinutes`) || "0", 10);
    const netMins = parseInt(getAttrOrText(dayEl, `${prefix}NetTimeMinutes`) || "0", 10);
    const sDescription = getAttrOrText(dayEl, `${prefix}Description`) || "";
    const deviationCause = getAttrOrText(dayEl, `${prefix}TimeDeviationCauseName`) || absenceName;
    const shiftLendedRaw = getAttrOrText(dayEl, `${prefix}Lended`) || "";
    const isShiftLended = shiftLendedRaw === "1" || shiftLendedRaw.toLowerCase() === "true" || isDayLendedOut;
    const shiftLink = getAttrOrText(dayEl, `${prefix}Link`) || dayShiftLink;
    // Break applies to first shift only (day-level break belongs to first work segment)
    const shiftBreakMins = sIdx === 1 ? dayBreakTotal : 0;
    const effectiveGross = grossMins > 0 ? grossMins : netMins + shiftBreakMins;
    shifts.push({
      shiftName: sName,
      description: sDescription,
      startTime: parseTime(sStartRaw),
      stopTime: parseTime(sStopRaw),
      color: xmlCol && xmlCol !== "#000000" && xmlCol !== "#FFFFFF" && xmlCol !== "#ffffff"
        ? xmlCol : shiftColor(sName, xmlCol),
      grossMinutes: effectiveGross,
      netMinutes: netMins,
      breakMinutes: shiftBreakMins,
      breakWindows: [],
      deviationCause,
      totalCost: dayScheduleCost,
      isLended: isShiftLended,
      shiftLink,
      isBorrowed: false,
    });
  }

  // Fallback: <Shifts> child elements (used alongside flat Shift1..15 in the same file)
  // Parse these even when flat shifts exist — they may carry the <Shifts id="N"> list
  if (shifts.length === 0) {
    let isFirst = true;
    for (const sEl of Array.from(dayEl.children).filter(c => c.nodeName === "Shifts")) {
      const g = (attr: string) => getAttrOrText(sEl, attr) || getText(sEl, attr);
      const sName = g("ShiftName");
      const colRaw = g("Color");
      const xmlCol = colRaw ? (colRaw.startsWith("#") ? colRaw : `#${colRaw}`) : "";
      const grossMinutes = parseInt(g("ShiftGrossTimeMinutes") || "0", 10);
      const xmlNet = parseInt(g("ShiftNetTimeMinutes") || "0", 10);
      const netMinutes = xmlNet > 0 ? xmlNet : Math.max(0, grossMinutes - (isFirst ? dayBreakTotal : 0));
      const shiftLendedRaw = g("ShiftLended");
      const isShiftLended = shiftLendedRaw === "1" || shiftLendedRaw.toLowerCase() === "true" || isDayLendedOut;
      shifts.push({
        shiftName: sName,
        description: g("ShiftDescription") || "",
        startTime: parseTime(g("ShiftStartTime")),
        stopTime: parseTime(g("ShiftStopTime")),
        color: xmlCol && xmlCol !== "#000000" ? xmlCol : shiftColor(sName, xmlCol),
        grossMinutes: grossMinutes > 0 ? grossMinutes : netMinutes + (isFirst ? dayBreakTotal : 0),
        netMinutes,
        breakMinutes: isFirst ? dayBreakTotal : 0,
        breakWindows: isFirst ? dayBreakWindows : [],
        deviationCause: g("ShiftTimeDeviationCauseName") || absenceName,
        totalCost: dayScheduleCost,
        isLended: isShiftLended,
        shiftLink: dayShiftLink,
        isBorrowed: false,
      });
      isFirst = false;
    }
  }

  // Distribute day-level break windows to the shift that contains each break start
  if (shifts.length > 0 && dayBreakWindows.length > 0) {
    const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    for (const bw of dayBreakWindows) {
      const bStart = toMins(bw.start);
      let target = shifts.find((s) => {
        if (!s.startTime || !s.stopTime) return false;
        const ss = toMins(s.startTime), se = toMins(s.stopTime);
        return bStart >= ss && bStart < se;
      });
      if (!target) {
        const before = shifts.filter((s) => s.startTime && toMins(s.startTime) <= bStart);
        target = before.length > 0 ? before[before.length - 1] : shifts[0];
      }
      if (target) target.breakWindows.push(bw);
    }
  }

  const anyShiftSemester = shifts.some((s) =>
    s.deviationCause.toLowerCase().includes("semester") || s.deviationCause.toLowerCase().includes("holiday")
  );
  const isSemester = isAbsenceDay && (
    absenceName.toLowerCase().includes("semester") ||
    absenceName.toLowerCase().includes("holiday") ||
    anyShiftSemester
  );
  return { dayNr, scheduleDate, isAbsenceDay, isSemester, isPreliminary, isZeroScheduleDay, shifts };
}

function parseXml(xmlText: string): ParsedSchedule[] | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const root = doc.documentElement;
  if (!root || root.nodeName !== "SOE_TimeEmployeeSchedule") return null;

  // Company name lives in ReportHeader which is inside TimeEmployeeSchedule
  const storeName =
    getText(root, "ReportHeader Company") ||
    getText(root, "TimeEmployeeSchedule ReportHeader Company") ||
    getAttrOrText(root, "Company") ||
    getText(root, "Store StoreName") || "";

  // The actual data container — may be wrapped in <TimeEmployeeSchedule>
  const dataRoot: Element = root.querySelector("TimeEmployeeSchedule") ?? root;

  // ── Primary structure: Employee > Week > Day ────────────────────────────────
  // SoftOne GO format: TimeEmployeeSchedule > Employee > Week > Day
  const employeeEls = Array.from(dataRoot.children).filter(c => c.nodeName === "Employee");
  if (employeeEls.length > 0 && employeeEls.some(e => e.querySelector("Week"))) {
    // Collect all unique week numbers across all employees to build per-week schedules
    const weekMap = new Map<string, { weekNumber: number; year: number; weekStartDate: string; employees: ParsedEmployee[] }>();

    for (const empEl of employeeEls) {
      const employeeNr = getAttrOrText(empEl, "EmployeeNr");
      const employeeName = getAttrOrText(empEl, "EmployeeName");
      const employeeGroup = getAttrOrText(empEl, "EmployeeGroup");
      const employeeCategory = getAttrOrText(empEl, "EmployeeCategory") || "";
      const employmentPercentRaw = getAttrOrText(empEl, "EmploymentPercent") || getAttrOrText(empEl, "EmployeeGroupRuleWorkTimeYear") || "";
      const employmentPercent = employmentPercentRaw ? parseFloat(employmentPercentRaw.replace(",", ".")) || null : null;
      const workTimeWeekRaw = getAttrOrText(empEl, "EmploymentWorkTimeWeek") || getAttrOrText(empEl, "EmployeeGroupRuleWorkTimeWeek") || "";
      const workTimeWeek = workTimeWeekRaw ? parseFloat(workTimeWeekRaw.replace(",", ".")) || null : null;

      const weekEls = Array.from(empEl.children).filter(c => c.nodeName === "Week");
      for (const weekEl of weekEls) {
        const weekNrText = getAttrOrText(weekEl, "ScheduleWeekNr") || getAttrOrText(weekEl, "WeekNr") || "";
        const weekNumber = parseInt(weekNrText, 10) || 0;
        if (!weekNumber) continue;

        // Year: try Week element first, then ReportHeader (inside dataRoot), then from day dates
        const yearText = getAttrOrText(weekEl, "Year") || getText(dataRoot, "ReportHeader Year") || getText(root, "ReportHeader Year") || "";
        let year = parseInt(yearText, 10) || 0;

        let weekStartDate = "";
        const onMonday = (date: string) => {
          if (!weekStartDate) weekStartDate = date;
          if (!year && date.length >= 4) year = parseInt(date.slice(0, 4), 10);
        };

        const days: XmlDay[] = Array.from(weekEl.children)
          .filter(c => c.nodeName === "Day")
          .map(dayEl => parseXmlDay(dayEl, "", onMonday));

        if (!year) year = new Date().getFullYear();

        // Derive weekStartDate from DateInterval if still missing
        if (!weekStartDate) {
          const diRaw = getAttrOrText(weekEl, "DateInterval") || getAttrOrText(root, "DateInterval") || getText(root, "ReportHeader DateInterval") || "";
          const diMatch = diRaw.match(/(\d{4}-\d{2}-\d{2})/);
          if (diMatch) weekStartDate = diMatch[1];
        }

        const key = `${year}-${weekNumber}`;
        if (!weekMap.has(key)) {
          weekMap.set(key, { weekNumber, year, weekStartDate, employees: [] });
        } else if (!weekMap.get(key)!.weekStartDate && weekStartDate) {
          weekMap.get(key)!.weekStartDate = weekStartDate;
        }
        weekMap.get(key)!.employees.push({ employeeNr, employeeName, employeeGroup, employeeCategory, employmentPercent, workTimeWeek, days });
      }
    }

    if (weekMap.size > 0) {
      return Array.from(weekMap.values())
        .filter(s => s.weekNumber > 0)
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.weekNumber - b.weekNumber)
        .map(s => ({ ...s, storeName }));
    }
  }

  // ── Fallback A: Week elements are direct children of dataRoot (Week > Employee > Day) ──
  const directWeekEls = Array.from(dataRoot.children).filter(c => c.nodeName === "Week");
  if (directWeekEls.length > 0) {
    const results: ParsedSchedule[] = [];
    for (const weekEl of directWeekEls) {
      const weekNrText = getAttrOrText(weekEl, "ScheduleWeekNr") || getAttrOrText(weekEl, "WeekNr") || "";
      const weekNumber = parseInt(weekNrText, 10) || 0;
      if (!weekNumber) continue;
      const yearText = getAttrOrText(weekEl, "Year") || getText(root, "ReportHeader Year") || "";
      let year = parseInt(yearText, 10) || new Date().getFullYear();
      let weekStartDate = (() => {
        const r = getAttrOrText(weekEl, "DateInterval") || "";
        const m = r.match(/(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : "";
      })();

      const employees: ParsedEmployee[] = Array.from(weekEl.children)
        .filter(c => c.nodeName === "Employee")
        .map(empEl => {
          const days: XmlDay[] = Array.from(empEl.querySelectorAll("Day"))
            .map(dayEl => parseXmlDay(dayEl, "", (date) => {
              if (!weekStartDate) weekStartDate = date;
              if (!year && date.length >= 4) year = parseInt(date.slice(0, 4), 10);
            }));
          const epRaw = getAttrOrText(empEl, "EmploymentPercent") || "";
          const wtwRaw = getAttrOrText(empEl, "EmploymentWorkTimeWeek") || getAttrOrText(empEl, "EmployeeGroupRuleWorkTimeWeek") || "";
          return {
            employeeNr: getAttrOrText(empEl, "EmployeeNr"),
            employeeName: getAttrOrText(empEl, "EmployeeName"),
            employeeGroup: getAttrOrText(empEl, "EmployeeGroup"),
            employeeCategory: getAttrOrText(empEl, "EmployeeCategory") || "",
            employmentPercent: epRaw ? parseFloat(epRaw.replace(",", ".")) || null : null,
            workTimeWeek: wtwRaw ? parseFloat(wtwRaw.replace(",", ".")) || null : null,
            days,
          };
        });
      results.push({ weekNumber, year, weekStartDate, storeName, employees });
    }
    if (results.length > 0) return results;
  }

  // ── Fallback B: No Week elements — week metadata on dataRoot, employees are direct children ──
  const rootEmpEls = Array.from(dataRoot.children).filter(c => c.nodeName === "Employee");
  if (rootEmpEls.length > 0) {
    const weekNrText = getAttrOrText(dataRoot, "ScheduleWeekNr") || getAttrOrText(dataRoot, "WeekNr") || getText(root, "ReportHeader WeekNr") || "";
    const weekNumber = parseInt(weekNrText, 10) || 0;
    let year = parseInt(getAttrOrText(dataRoot, "Year") || getText(root, "ReportHeader Year") || "0", 10) || new Date().getFullYear();
    let weekStartDate = (() => {
      const r = getAttrOrText(dataRoot, "DateInterval") || getText(root, "ReportHeader DateInterval") || "";
      const m = r.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : "";
    })();

    const employees: ParsedEmployee[] = rootEmpEls.map(empEl => {
      const days: XmlDay[] = Array.from(empEl.querySelectorAll("Day"))
        .map(dayEl => parseXmlDay(dayEl, "", (date) => {
          if (!weekStartDate) weekStartDate = date;
          if (!year && date.length >= 4) year = parseInt(date.slice(0, 4), 10);
        }));
      const epRaw = getAttrOrText(empEl, "EmploymentPercent") || "";
      const wtwRaw = getAttrOrText(empEl, "EmploymentWorkTimeWeek") || getAttrOrText(empEl, "EmployeeGroupRuleWorkTimeWeek") || "";
      return {
        employeeNr: getAttrOrText(empEl, "EmployeeNr"),
        employeeName: getAttrOrText(empEl, "EmployeeName"),
        employeeGroup: getAttrOrText(empEl, "EmployeeGroup"),
        employeeCategory: getAttrOrText(empEl, "EmployeeCategory") || "",
        employmentPercent: epRaw ? parseFloat(epRaw.replace(",", ".")) || null : null,
        workTimeWeek: wtwRaw ? parseFloat(wtwRaw.replace(",", ".")) || null : null,
        days,
      };
    });
    return [{ weekNumber, year, weekStartDate, storeName, employees }];
  }

  return null;
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
  // Parse as local date to avoid UTC-offset shifting the day number
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
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
  // Both Admin and Chef (manager) can import schedules and delivery plans
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [imports, setImports] = useState<ImportRow[]>([]);
  const [activeImport, setActiveImport] = useState<ImportRow | null>(null);
  // Selected week for navigation (may or may not have an import)
  const [selectedWeek, setSelectedWeek] = useState<{ weekNumber: number; year: number }>(() => {
    const now = new Date();
    return { weekNumber: getISOWeek(now), year: now.getFullYear() };
  });
  const [scheduleEmployees, setScheduleEmployees] = useState<ScheduleEmployee[]>([]);
  const [scheduleShifts, setScheduleShifts] = useState<ScheduleShift[]>([]);
  const [mappings, setMappings] = useState<EmployeeMapping[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  });
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [hideLedig, setHideLedig] = useState(false);
  const [sortMode, setSortMode] = useState<"default" | "start" | "end">("default");

  // Delivery
  const [deliveryPlans, setDeliveryPlans] = useState<DeliveryPlan[]>([]);
  const [deliveryEntries, setDeliveryEntries] = useState<DeliveryEntry[]>([]);
  const [showDeliveries, setShowDeliveries] = useState(true);

  const [parsed, setParsed] = useState<ParsedSchedule[] | null>(null);
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
  // Per-file CSV labels: { filename: { weekNumber, year, label } }
  type CsvFileLabel = { weekNumber: number; year: number; label: string };
  const [csvFileLabels, setCsvFileLabels] = useState<Record<string, CsvFileLabel>>({});
  const [scheduleTasks, setScheduleTasks] = useState<Task[]>([]);
  const [scheduleTaskAssignees, setScheduleTaskAssignees] = useState<{ task_id: string; user_id: string | null }[]>([]);
  const [weekMeetings, setWeekMeetings] = useState<Meeting[]>([]);

  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [bulkCreatingAccounts, setBulkCreatingAccounts] = useState(false);
  const [deleteImportTarget, setDeleteImportTarget] = useState<ImportRow | null>(null);
  const [deleteDeliveryPlanConfirm, setDeleteDeliveryPlanConfirm] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const mobileListRef = useRef<HTMLDivElement>(null);
  const storeId = activeStore?.id ?? user?.store_id ?? null;
  const todayStr = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })();

  async function addImportFiles(newFiles: File[]) {
    const merged = [...importFiles, ...newFiles].filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i);
    setImportFiles(merged);
    // Initialize per-file labels for new CSVs
    setCsvFileLabels((prev) => {
      const next = { ...prev };
      for (const f of newFiles) {
        if (f.name.toLowerCase().endsWith(".csv") && !next[f.name]) {
          next[f.name] = { weekNumber: csvWeekNumber, year: csvYear, label: "Standard" };
        }
      }
      return next;
    });
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
    setCsvFileLabels((p) => { const n = { ...p }; delete n[name]; return n; });
  }

  // Upserts forening/distrikt memberships for a user based on the active store's hierarchy.
  // Additive only — never removes existing memberships for other foreningar/distrikt.
  async function linkUserToStoreHierarchy(userId: string) {
    const foreningId = activeStore?.forening_id;
    const distriktId = activeStore?.distrikt_id;
    if (foreningId) {
      await supabase.from("user_foreningar").upsert(
        { user_id: userId, forening_id: foreningId, is_primary: false },
        { onConflict: "user_id,forening_id" }
      );
      // Only set app_users.forening_id if not already set (primary indicator)
      const { data: existing } = await supabase.from("app_users").select("forening_id").eq("id", userId).maybeSingle();
      if (!existing?.forening_id) {
        await supabase.from("app_users").update({ forening_id: foreningId }).eq("id", userId);
      }
    }
    if (distriktId) {
      await supabase.from("user_distrikt").upsert(
        { user_id: userId, distrikt_id: distriktId, is_primary: false },
        { onConflict: "user_id,distrikt_id" }
      );
      // Only set app_users.distrikt_id if not already set (primary indicator)
      const { data: existing } = await supabase.from("app_users").select("distrikt_id").eq("id", userId).maybeSingle();
      if (!existing?.distrikt_id) {
        await supabase.from("app_users").update({ distrikt_id: distriktId }).eq("id", userId);
      }
    }
  }

  useEffect(() => {
    if (!storeId) return;
    loadImports();
    loadAppUsers();
    loadMappings();
    loadDeliveryPlans();
  }, [storeId]);

  useEffect(() => {
    if (activeImport) {
      loadScheduleData(activeImport.id);
      loadMeetingsForWeek(activeImport.week_start_date);
    } else {
      setScheduleEmployees([]);
      setScheduleShifts([]);
      const weekStart = getWeekStartDate(selectedWeek.weekNumber, selectedWeek.year);
      loadMeetingsForWeek(weekStart);
    }
  }, [activeImport, selectedWeek.weekNumber, selectedWeek.year]);

  useEffect(() => {
    if (!storeId) return;
    const weekStart = activeImport ? activeImport.week_start_date : getWeekStartDate(selectedWeek.weekNumber, selectedWeek.year);
    const queryStart = addDays(weekStart, -1);
    const queryEnd = addDays(weekStart, 7);

    async function loadAndSpawnTasks() {
      // First ensure recurring children are spawned for this week
      if (isAdmin) {
        const { data: parents } = await supabase
          .from("tasks")
          .select("id, title, recurrence_rule, recurrence_days, recurrence_start, recurrence_end, recurrence_period_start, parent_task_id, due_date, created_at, status, store_id, assigned_to, created_by")
          .eq("store_id", storeId!)
          .not("recurrence_rule", "is", null)
          .is("parent_task_id", null);

        if (parents && parents.length > 0) {
          const { data: existingChildren } = await supabase
            .from("tasks")
            .select("parent_task_id, recurrence_period_start")
            .in("parent_task_id", parents.map((p: Task) => p.id));

          const coveredByParent = new Map<string, Set<string>>();
          for (const c of (existingChildren ?? []) as { parent_task_id: string; recurrence_period_start: string | null }[]) {
            if (!c.parent_task_id) continue;
            if (!coveredByParent.has(c.parent_task_id)) coveredByParent.set(c.parent_task_id, new Set());
            if (c.recurrence_period_start) coveredByParent.get(c.parent_task_id)!.add(c.recurrence_period_start.slice(0, 10));
          }

          const weekCeil = new Date(queryEnd);
          const midnight = (d: Date) => { const n = new Date(d); n.setHours(0,0,0,0); return n; };
          const localDS = (d: Date) => { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; };

          for (const t of parents as Task[]) {
            if (!t.recurrence_rule) continue;
            const originDate = t.recurrence_start ? midnight(new Date(t.recurrence_start)) : t.due_date ? midnight(new Date(t.due_date)) : midnight(new Date(t.created_at));
            const durationMs = t.due_date ? Math.max(0, midnight(new Date(t.due_date)).getTime() - originDate.getTime()) : 0;
            const weekStart = new Date(queryStart);

            const periodStarts = buildPeriodStartsSimple(originDate, t.recurrence_rule, t.recurrence_days ?? null, t.recurrence_start ? new Date(t.recurrence_start) : null, t.recurrence_end ? new Date(t.recurrence_end) : null, weekCeil, weekStart);
            const covered = coveredByParent.get(t.id) ?? new Set<string>();
            for (const ps of periodStarts) {
              const psKey = localDS(ps);
              if (covered.has(psKey)) continue;
              const childDue = t.due_date ? new Date(ps.getTime() + durationMs) : null;
              await supabase.from("tasks").insert({
                title: t.title, description: (t as Task & { description?: string }).description, category: t.category, priority: t.priority,
                store_id: t.store_id, due_date: childDue ? childDue.toISOString() : null,
                recurrence_rule: t.recurrence_rule, recurrence_days: t.recurrence_days,
                recurrence_period_start: psKey, parent_task_id: t.id,
                created_by: t.created_by, assigned_to: t.assigned_to, status: "todo",
              });
              covered.add(psKey);
            }
          }
        }
      }

      const { data } = await supabase
        .from("tasks")
        .select("id, title, due_date, assigned_to, status, priority")
        .eq("store_id", storeId!)
        .not("status", "eq", "done")
        .not("status", "eq", "cancelled")
        .gte("due_date", queryStart)
        .lte("due_date", queryEnd);
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
    }

    loadAndSpawnTasks();
  }, [storeId, activeImport, selectedWeek.weekNumber, selectedWeek.year, isAdmin]);

  async function loadImports() {
    if (!storeId) return;
    const { data } = await supabase.from("schedule_imports").select("*").eq("store_id", storeId).order("week_start_date", { ascending: false });
    const rows = (data ?? []) as ImportRow[];
    setImports(rows);
    if (rows.length > 0 && !activeImport) {
      const now = new Date();
      const currWeek = getISOWeek(now);
      const currYear = now.getFullYear();
      const current = rows.find((r) => r.week_number === currWeek && r.year === currYear) ?? rows[0];
      setActiveImport(current);
      setSelectedWeek({ weekNumber: current.week_number, year: current.year });
    }
  }

  function exportScheduleCSV() {
    if (!activeImport || scheduleEmployees.length === 0) return;
    const header = "Anställningsnummer;Namn;Datum;Start;Slut;Rast (min);Avdelning;Frånvaro;Lånad";
    const rows: string[] = [];
    scheduleEmployees.forEach(emp => {
      const empShifts = scheduleShifts.filter(s => s.schedule_employee_id === emp.id);
      empShifts.forEach(s => {
        const cells = [
          emp.employee_nr,
          emp.name,
          s.day_date,
          s.start_time ?? "",
          s.stop_time ?? "",
          s.break_minutes != null ? String(s.break_minutes) : "",
          emp.department ?? "",
          s.is_absence_day ? "Ja" : "Nej",
          s.is_lended ? "Ja" : "Nej",
        ];
        rows.push(cells.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
      });
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schema-v${activeImport.week_number}-${activeImport.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteScheduleImport(imp: ImportRow) {
    await supabase.from("schedule_shifts").delete().eq("import_id", imp.id);
    await supabase.from("schedule_employees").delete().eq("import_id", imp.id);
    await supabase.from("schedule_imports").delete().eq("id", imp.id);
    setDeleteImportTarget(null);
    if (activeImport?.id === imp.id) setActiveImport(null);
    await loadImports();
  }

  async function deleteAllDeliveryPlans() {
    if (!storeId) return;
    await supabase.from("delivery_entries").delete().in(
      "plan_id",
      (await supabase.from("delivery_plans").select("id").eq("store_id", storeId)).data?.map((r: { id: string }) => r.id) ?? []
    );
    await supabase.from("delivery_plans").delete().eq("store_id", storeId);
    setDeleteDeliveryPlanConfirm(false);
    await loadDeliveryPlans();
  }

  async function loadAppUsers() {
    if (!storeId) return;
    const { data } = await supabase.from("app_users").select("id, username, display_name, role, role_manually_set, employee_group, store_id, active_store_id, is_active, last_login, created_at").eq("store_id", storeId).eq("is_active", true).order("display_name");
    setAppUsers((data ?? []) as AppUser[]);
    // Also load all users globally for cross-store name matching
    const { data: all } = await supabase.from("app_users").select("id, username, display_name, role, role_manually_set, employee_group, store_id, active_store_id, is_active, last_login, created_at").eq("is_active", true).order("display_name");
    setAllUsers((all ?? []) as AppUser[]);
  }

  async function loadMappings() {
    if (!storeId) return;
    const { data } = await supabase.from("employee_mappings").select("employee_nr, app_user_id").eq("store_id", storeId);
    setMappings((data ?? []) as EmployeeMapping[]);
  }

  async function loadScheduleData(importId: string) {
    setLoadingSchedule(true);
    const [empRes, shiftRes] = await Promise.all([
      supabase.from("schedule_employees").select("*").eq("import_id", importId).order("employee_name"),
      supabase.from("schedule_shifts").select("*").eq("import_id", importId),
    ]);
    setScheduleEmployees((empRes.data ?? []) as ScheduleEmployee[]);
    setScheduleShifts((shiftRes.data ?? []) as ScheduleShift[]);
    setLoadingSchedule(false);
  }

  async function loadMeetingsForWeek(weekStart: string) {
    if (!storeId) return;
    const weekEnd = addDays(weekStart, 7);
    const { data } = await supabase
      .from("meetings")
      .select("id, meeting_type, title, store_id, scheduled_at, status")
      .eq("store_id", storeId)
      .gte("scheduled_at", weekStart)
      .lt("scheduled_at", weekEnd)
      .order("scheduled_at");
    setWeekMeetings((data ?? []) as Meeting[]);
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
      // ── Pass 1: parse all XML files first, then open mapping dialog once ──
      const xmlFiles = files.filter((f) => f.name.split(".").pop()?.toLowerCase() === "xml");
      const csvFiles = files.filter((f) => f.name.split(".").pop()?.toLowerCase() === "csv");

      if (xmlFiles.length > 0) {
        const allSchedules: ParsedSchedule[] = [];
        for (const file of xmlFiles) {
          const text = await readFileText(file);
          const results = parseXml(text);
          if (!results || results.length === 0) {
            toast.error(`Kunde inte läsa XML-filen: ${file.name}. Kontrollera att det är en SoftOne GO-export.`);
            continue;
          }
          for (const r of results) {
            allSchedules.push({ ...r, storeName: r.storeName || activeStore?.name || "" });
          }
        }

        if (allSchedules.length > 0) {
          // Merge weeks from all files.
          // If two files share year+weekNumber:
          //   - new employees (by employeeNr) are appended
          //   - existing employees get their days merged: days absent in the first file
          //     are added from the second file; days present in both are merged by dayNr
          //     (shifts from the later file are appended so no shift data is lost)
          const weekMap = new Map<string, ParsedSchedule>();
          for (const s of allSchedules) {
            const key = `${s.year}-${s.weekNumber}`;
            if (!weekMap.has(key)) {
              // Deep-copy employees so later mutations don't affect the source arrays
              weekMap.set(key, {
                ...s,
                weekStartDate: s.weekStartDate || getWeekStartDate(s.weekNumber, s.year),
                employees: s.employees.map(e => ({ ...e, days: e.days.map(d => ({ ...d, shifts: [...d.shifts] })) })),
              });
            } else {
              const existing = weekMap.get(key)!;
              // Propagate weekStartDate if this file has one and existing doesn't
              if (!existing.weekStartDate && s.weekStartDate) existing.weekStartDate = s.weekStartDate;
              // Build a map of existing employees by employeeNr for O(1) lookup
              const empByNr = new Map(existing.employees.map(e => [e.employeeNr, e]));
              for (const incomingEmp of s.employees) {
                const existingEmp = empByNr.get(incomingEmp.employeeNr);
                if (!existingEmp) {
                  // New employee — add them with a deep copy of their days
                  const copy = { ...incomingEmp, days: incomingEmp.days.map(d => ({ ...d, shifts: [...d.shifts] })) };
                  existing.employees.push(copy);
                  empByNr.set(incomingEmp.employeeNr, copy);
                } else {
                  // Same employee — merge their days by dayNr
                  const dayByNr = new Map(existingEmp.days.map(d => [d.dayNr, d]));
                  for (const incomingDay of incomingEmp.days) {
                    const existingDay = dayByNr.get(incomingDay.dayNr);
                    if (!existingDay) {
                      // Day only in this file — add it
                      existingEmp.days.push({ ...incomingDay, shifts: [...incomingDay.shifts] });
                    } else {
                      // Day in both files — append shifts that aren't already present
                      // (deduplicate by shiftName+startTime to avoid exact duplicates)
                      const shiftKeys = new Set(existingDay.shifts.map(s => `${s.shiftName}|${s.startTime}`));
                      for (const incomingShift of incomingDay.shifts) {
                        const k = `${incomingShift.shiftName}|${incomingShift.startTime}`;
                        if (!shiftKeys.has(k)) {
                          existingDay.shifts.push(incomingShift);
                          shiftKeys.add(k);
                        }
                      }
                      // Propagate scheduleDate if missing
                      if (!existingDay.scheduleDate && incomingDay.scheduleDate) {
                        existingDay.scheduleDate = incomingDay.scheduleDate;
                      }
                    }
                  }
                }
              }
            }
          }
          const mergedSchedules = Array.from(weekMap.values()).sort(
            (a, b) => a.year !== b.year ? a.year - b.year : a.weekNumber - b.weekNumber
          );

          // Collect unique employees across all weeks for the mapping dialog
          const allEmpMap = new Map<string, ParsedEmployee>();
          for (const s of mergedSchedules) {
            for (const emp of s.employees) {
              if (!allEmpMap.has(emp.employeeNr)) allEmpMap.set(emp.employeeNr, emp);
            }
          }
          const allEmployees = Array.from(allEmpMap.values());

          const { data: storeUserLinks } = await supabase.from("user_stores").select("user_id").eq("store_id", storeId!);
          const storeUserIds = new Set((storeUserLinks ?? []).map((r: { user_id: string }) => r.user_id));
          const storeUsers = allUsers.filter((u) => storeUserIds.has(u.id));

          const usedUserIds = new Set<string>();
          const matched: MatchedEmployee[] = allEmployees.map((emp) => {
            const savedMapping = mappings.find((m) => m.employee_nr === emp.employeeNr);
            if (savedMapping?.app_user_id) {
              usedUserIds.add(savedMapping.app_user_id);
              return { employeeNr: emp.employeeNr, employeeName: emp.employeeName, employeeGroup: emp.employeeGroup, matchType: "existing" as const, appUserId: savedMapping.app_user_id, newUsername: "", newPassword: "" };
            }
            const normEmp = normalizeName(emp.employeeName);
            const byStoreAndName = storeUsers.find((u) => !usedUserIds.has(u.id) && normalizeName(u.display_name) === normEmp);
            if (byStoreAndName) {
              usedUserIds.add(byStoreAndName.id);
              return { employeeNr: emp.employeeNr, employeeName: emp.employeeName, employeeGroup: emp.employeeGroup, matchType: "existing" as const, appUserId: byStoreAndName.id, newUsername: "", newPassword: "" };
            }
            const globalNameMatch = allUsers.find((u) => !usedUserIds.has(u.id) && normalizeName(u.display_name) === normEmp && !storeUserIds.has(u.id));
            if (globalNameMatch) {
              usedUserIds.add(globalNameMatch.id);
              toast.info(`${emp.employeeName} identifierad som Lånad Personal från annan butik.`);
              return { employeeNr: emp.employeeNr, employeeName: emp.employeeName, employeeGroup: emp.employeeGroup, matchType: "existing" as const, appUserId: globalNameMatch.id, newUsername: "", newPassword: "", isBorrowed: true };
            }
            return { employeeNr: emp.employeeNr, employeeName: emp.employeeName, employeeGroup: emp.employeeGroup, matchType: "new" as const, appUserId: null, newUsername: usernameFromName(emp.employeeName), newPassword: generatePassword(16) };
          });

          const weekNums = mergedSchedules.map((s) => s.weekNumber);
          const weekLabel = weekNums.length === 1 ? `vecka ${weekNums[0]}` : `veckorna ${weekNums.join(", ")}`;
          toast.info(`${xmlFiles.length} fil${xmlFiles.length > 1 ? "er" : ""} tolkade — ${weekLabel} · ${allEmployees.length} medarbetare`);

          setParsed(mergedSchedules);
          setMatchedEmployees(matched);
          setImportDialogOpen(false);
          setImportFiles([]);
          setPdfPreviews({});
          setCsvFileLabels({});
          setMappingOpen(true);
          return; // mapping dialog handles the rest; CSV files can be imported separately
        }
      }

      // ── Pass 2: CSV delivery plans ──
      for (const file of csvFiles) {
          try {
            // Re-use already-parsed preview if available
            let entries = pdfPreviews[file.name];
            if (entries === undefined) {
              const text = await readFileText(file);
              entries = parseCsvDelivery(text);
            }
            if (entries.length === 0) {
              toast.error(`Inga leveranser hittades i ${file.name}`);
              continue;
            }
            const fileLabel = csvFileLabels[file.name];
            const weekNumber = fileLabel?.weekNumber ?? csvWeekNumber;
            const year = fileLabel?.year ?? csvYear;
            const userLabel = fileLabel?.label ?? "Standard";
            const weekStart = getWeekStartDate(weekNumber, year);
            // Detect Swedish special weeks (holidays)
            const holidayName = getSpecialWeekHoliday(year, weekNumber);
            const isSpecialWeek = holidayName !== null;
            if (isSpecialWeek) {
              toast.info(`Vecka ${weekNumber} innehåller helgdag: ${holidayName}. Importerar som specialvecka.`);
            }
            // Delete existing plans for this store/week/year before inserting new
            const { data: oldPlans } = await supabase.from("delivery_plans").select("id").eq("store_id", storeId).eq("week_number", weekNumber).eq("year", year);
            if (oldPlans && oldPlans.length > 0) {
              const oldPlanIds = oldPlans.map((p: { id: string }) => p.id);
              await supabase.from("delivery_entries").delete().in("plan_id", oldPlanIds);
              await supabase.from("delivery_plans").delete().in("id", oldPlanIds);
            }
            const { data: plan, error: planErr } = await supabase.from("delivery_plans").insert({
              store_id: storeId, week_number: weekNumber, year, imported_by: user.id, filename: file.name,
              is_special_week: isSpecialWeek || userLabel !== "Standard", holiday_name: holidayName,
              is_default_template: userLabel === "Standard" && !isSpecialWeek,
              notes: userLabel !== "Standard" ? userLabel : (holidayName ?? null),
            }).select().single();
            if (planErr || !plan) { toast.error(`Fel vid sparande av leveransplan: ${planErr?.message}`); continue; }
            const planId = (plan as DeliveryPlan).id;
            const rows = entries.map((e) => ({
              plan_id: planId, delivery_day: e.deliveryDay, delivery_time: e.deliveryTime,
              order_day: e.orderDay, stop_time: e.stopTime, flow_name: e.flowName, supplier: e.supplier,
              delivery_date: deliveryDateForDay(e.deliveryDay, weekStart),
            }));
            await supabase.from("delivery_entries").insert(rows);
            const wasOverwrite = oldPlans && oldPlans.length > 0;
            toast.success(`Leveransplan ${wasOverwrite ? "uppdaterad" : "importerad"} från ${file.name} (${rows.length} leveranser)`);
          } catch (err) {
            toast.error(`Fel vid läsning av ${file.name}`);
            console.error(err);
          }
      }
      setImportDialogOpen(false);
      setImportFiles([]);
      setPdfPreviews({});
      setCsvFileLabels({});
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

  async function bulkCreateUnmatchedAccounts() {
    if (!storeId || !user) return;
    setBulkCreatingAccounts(true);
    const unmapped = Array.from(new Map(scheduleEmployees.map((e) => [e.employee_nr, e])).values())
      .filter((emp) => !getMappedUserId(emp.employee_nr));

    for (const emp of unmapped) {
      const username = usernameFromName(emp.employee_name);
      const password = generatePassword(16);
      if (!username) continue;
      let finalUsername = username;
      const { data: existing } = await supabase.from("app_users").select("id").eq("username", finalUsername).maybeSingle();
      if (existing) finalUsername = `${username}_${emp.employee_nr.slice(-4)}`;
      const { data: hash } = await supabase.rpc("hash_password", { plain_password: password });
      const role = groupToRole(emp.employee_group);
      const { data: created } = await supabase.from("app_users").insert({
        username: finalUsername, password_hash: hash, display_name: emp.employee_name,
        role, employee_group: emp.employee_group, store_id: storeId, is_active: true,
        must_change_password: true,
      }).select("id, username, display_name, role, employee_group, store_id, active_store_id, is_active, last_login, created_at").maybeSingle();
      if (!created) continue;
      const newUser = created as AppUser;
      await supabase.from("user_stores").upsert({ user_id: newUser.id, store_id: storeId, is_primary: true }, { onConflict: "user_id,store_id" });
      await linkUserToStoreHierarchy(newUser.id);
      await supabase.from("employee_mappings").upsert(
        { store_id: storeId, employee_nr: emp.employee_nr, app_user_id: newUser.id, created_by: user.id, updated_at: new Date().toISOString() },
        { onConflict: "store_id,employee_nr" }
      );
      setAppUsers((p) => [...p, newUser]);
      setAllUsers((p) => [...p, newUser]);
      setMapping(emp.employee_nr, newUser.id);
    }

    await loadMappings();
    setBulkCreatingAccounts(false);
    toast.success(`${unmapped.length} konton skapade. De loggar in och byter lösenord vid första inloggning.`);
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
          if (!me.isBorrowed) {
            await supabase.from("user_stores").upsert({ user_id: me.appUserId, store_id: storeId, is_primary: false }, { onConflict: "user_id,store_id" });
            await linkUserToStoreHierarchy(me.appUserId);
            const existingUser = allUsers.find((u) => u.id === me.appUserId);
            if (me.employeeGroup && !existingUser?.role_manually_set) {
              const role = groupToRole(me.employeeGroup);
              await supabase.from("app_users").update({ role, employee_group: me.employeeGroup }).eq("id", me.appUserId);
            } else if (me.employeeGroup) {
              await supabase.from("app_users").update({ employee_group: me.employeeGroup }).eq("id", me.appUserId);
            }
          }
        } else if (me.matchType === "new") {
          const username = me.newUsername || usernameFromName(me.employeeName);
          const password = me.newPassword && me.newPassword.length >= 12 ? me.newPassword : generatePassword(16);
          if (!username) continue;
          let finalUsername = username;
          const { data: existing } = await supabase.from("app_users").select("id").eq("username", finalUsername).maybeSingle();
          if (existing) finalUsername = `${username}_${me.employeeNr.slice(-4)}`;
          const { data: hash } = await supabase.rpc("hash_password", { plain_password: password });
          const role = groupToRole(me.employeeGroup);
          const { data: created, error: createErr } = await supabase.from("app_users").insert({
            username: finalUsername, password_hash: hash, display_name: me.employeeName,
            role, employee_group: me.employeeGroup, store_id: storeId, is_active: true,
            must_change_password: true,
          }).select("id, username, display_name, role, employee_group, store_id, active_store_id, is_active, last_login, created_at").single();
          if (createErr || !created) {
            toast.error(`Kunde inte skapa användare för ${me.employeeName}: ${createErr?.message}`);
            continue;
          }
          const newUser = created as AppUser;
          newlyCreated.push(newUser);
          await supabase.from("user_stores").insert({ user_id: newUser.id, store_id: storeId, is_primary: true });
          await linkUserToStoreHierarchy(newUser.id);
          finalMappings.push({ employee_nr: me.employeeNr, app_user_id: newUser.id });
        }
      }

      // Persist mappings
      for (const m of finalMappings) {
        await supabase.from("employee_mappings").upsert(
          { store_id: storeId, employee_nr: m.employee_nr, app_user_id: m.app_user_id || null, created_by: user.id, updated_at: new Date().toISOString() },
          { onConflict: "store_id,employee_nr" }
        );
      }
      setMappings(finalMappings);

      async function upsertGroup(name: string, memberIds: string[]) {
        let { data: grp } = await supabase.from("user_groups").select("id").eq("store_id", storeId!).eq("name", name).maybeSingle();
        if (!grp) {
          const { data: created } = await supabase.from("user_groups").insert({ name, store_id: storeId! }).select("id").maybeSingle();
          grp = created;
        }
        if (!grp?.id || memberIds.length === 0) return;
        await supabase.from("user_group_members").upsert(memberIds.map((uid) => ({ group_id: grp!.id, user_id: uid })), { onConflict: "group_id,user_id" });
      }

      // Import each week separately; overwrite any existing import for the same store/week/year
      let lastImportData: ImportRow | null = null;
      const allWeekNums: number[] = [];
      for (const weekSchedule of parsed) {
        // Delete existing import for this store/week/year (cascades to schedule_employees + schedule_shifts)
        const { data: oldImports } = await supabase
          .from("schedule_imports")
          .select("id")
          .eq("store_id", storeId)
          .eq("week_number", weekSchedule.weekNumber)
          .eq("year", weekSchedule.year);
        if (oldImports && oldImports.length > 0) {
          const oldIds = oldImports.map((r: { id: string }) => r.id);
          await supabase.from("schedule_shifts").delete().in("import_id", oldIds);
          await supabase.from("schedule_employees").delete().in("import_id", oldIds);
          await supabase.from("schedule_imports").delete().in("id", oldIds);
        }

        const resolvedWeekStart = weekSchedule.weekStartDate || getWeekStartDate(weekSchedule.weekNumber, weekSchedule.year);
        const { data: importData, error: importErr } = await supabase
          .from("schedule_imports")
          .insert({ store_id: storeId, week_start_date: resolvedWeekStart, week_number: weekSchedule.weekNumber, year: weekSchedule.year, imported_by: user.id, filename: `vecka_${weekSchedule.weekNumber}_${weekSchedule.year}.xml`, raw_employee_count: weekSchedule.employees.length })
          .select().single();
        if (importErr || !importData) throw new Error(`schedule_imports vecka ${weekSchedule.weekNumber}: ${importErr?.message ?? "Import failed"}`);
        const importId = (importData as ImportRow).id;
        allWeekNums.push(weekSchedule.weekNumber);
        lastImportData = importData as ImportRow;

        for (const emp of weekSchedule.employees) {
          const { data: empData } = await supabase.from("schedule_employees").insert({ import_id: importId, employee_nr: emp.employeeNr, employee_name: emp.employeeName, employee_group: emp.employeeGroup, employee_category: emp.employeeCategory || "", employment_percent: emp.employmentPercent ?? null, work_time_week: emp.workTimeWeek ?? null }).select().single();
          if (!empData) continue;
          const empId = (empData as ScheduleEmployee).id;
          const borrowedMe = matchedEmployees.find((me) => me.employeeNr === emp.employeeNr);
          const isEmpBorrowed = borrowedMe?.isBorrowed === true;

          const rows = emp.days.flatMap((day) => {
            // If the XML day has no ScheduleDate, derive it from the week start + dayNr (1=Mon)
            const effectiveDayDate = day.scheduleDate || (day.dayNr >= 1 ? addDays(resolvedWeekStart, day.dayNr - 1) : "");
            const isAbsence = day.isAbsenceDay || day.isSemester;
            if (day.shifts.length > 0) {
              return day.shifts.map((s) => {
                let startUtc: string | null = null;
                let stopUtc: string | null = null;
                if (s.startTime && effectiveDayDate) startUtc = stockholmToUtc(`${effectiveDayDate}T${s.startTime}`);
                if (s.stopTime && effectiveDayDate) {
                  const stopDay = (s.stopTime < s.startTime) ? addDays(effectiveDayDate, 1) : effectiveDayDate;
                  stopUtc = stockholmToUtc(`${stopDay}T${s.stopTime}`);
                }
                return {
                  schedule_employee_id: empId, import_id: importId, day_date: effectiveDayDate,
                  start_time: s.startTime || null, stop_time: s.stopTime || null,
                  start_time_utc: startUtc, stop_time_utc: stopUtc,
                  shift_name: s.shiftName,
                  shift_description: s.description || "",
                  color: isAbsence ? (day.isSemester ? "#fca5a5" : "#e0e0e0") : s.color,
                  gross_minutes: isAbsence ? 0 : s.grossMinutes, net_minutes: isAbsence ? 0 : s.netMinutes,
                  break_minutes: isAbsence ? 0 : s.breakMinutes, break_windows: isAbsence ? [] : s.breakWindows,
                  deviation_cause: s.deviationCause || (day.isSemester ? "Semester" : ""),
                  is_absence_day: isAbsence, is_lended: s.isLended,
                  is_borrowed: isEmpBorrowed || s.isBorrowed, shift_link: s.shiftLink,
                  is_shadow_shift: isAbsence && !!(s.startTime || s.shiftName),
                  is_preliminary: day.isPreliminary,
                  is_zero_schedule_day: day.isZeroScheduleDay,
                };
              });
            }
            if (isAbsence) {
              return [{
                schedule_employee_id: empId, import_id: importId, day_date: effectiveDayDate,
                start_time: null, stop_time: null,
                shift_name: day.isSemester ? "Semester" : "", color: day.isSemester ? "#fca5a5" : "#e0e0e0",
                shift_description: "", gross_minutes: 0, net_minutes: 0, break_minutes: 0, break_windows: [],
                deviation_cause: day.isSemester ? "Semester" : "", is_absence_day: true,
                is_lended: false, is_borrowed: false, shift_link: "", is_shadow_shift: false,
                is_preliminary: day.isPreliminary, is_zero_schedule_day: day.isZeroScheduleDay,
              }];
            }
            return [];
          });
          if (rows.length > 0) await supabase.from("schedule_shifts").insert(rows);
        }
      }

      // Auto-create/update "Alla medarbetare" and "Ledning" user groups
      const allUserIds = finalMappings.map((m) => m.app_user_id).filter(Boolean) as string[];
      const managersInSchedule = allUsers.filter((u) => allUserIds.includes(u.id) && (u.role === "manager" || u.hierarchy_level === "chef")).map((u) => u.id);
      await upsertGroup("Alla medarbetare", allUserIds);
      if (managersInSchedule.length > 0) await upsertGroup("Ledning", managersInSchedule);

      const createdCount = newlyCreated.length;
      const matchedCount = finalMappings.length - createdCount;
      const weekLabel = allWeekNums.length === 1 ? `vecka ${allWeekNums[0]}` : `veckorna ${allWeekNums.join(", ")}`;
      toast.success(`Schema ${weekLabel} importerat. ${matchedCount} matchade · ${createdCount > 0 ? `${createdCount} nya konton skapade` : "inga nya konton"}.`);
      if (newlyCreated.length > 0) setAppUsers((p) => [...p, ...newlyCreated]);
      setMappingOpen(false);
      setParsed(null);
      setMatchedEmployees([]);
      await loadImports();
      if (lastImportData) setActiveImport(lastImportData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Import misslyckades: ${msg}`);
      console.error("confirmImport error:", err);
    } finally {
      setSavingImport(false);
    }
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  // Week start for selected week (always defined from selectedWeek state)
  const selectedWeekStart = getWeekStartDate(selectedWeek.weekNumber, selectedWeek.year);
  const selectedWeekImport = imports.find((r) => r.week_number === selectedWeek.weekNumber && r.year === selectedWeek.year) ?? null;

  // Navigate to a week: update selectedWeek and sync activeImport
  function navigateToWeek(weekNumber: number, year: number) {
    setSelectedWeek({ weekNumber, year });
    const imp = imports.find((r) => r.week_number === weekNumber && r.year === year) ?? null;
    if (imp?.id !== activeImport?.id) {
      setActiveImport(imp);
      if (imp) {
        loadScheduleData(imp.id);
        loadMeetingsForWeek(imp.week_start_date);
      } else {
        setScheduleEmployees([]);
        setScheduleShifts([]);
        setWeekMeetings([]);
      }
    }
  }

  // weekDates always covers the 7 days of the selected week
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(selectedWeekStart, i));
  const currentDate = weekDates[selectedDayIndex] ?? null;
  const currentNowPercent = currentDate === todayStr ? nowPercent() : -1;

  // ── Auto-detect borrowed-out shifts ──────────────────────────────────────
  // A shift is "butik-only" if all its week shifts have shift_name containing only "butik"
  // and each day has exactly 1 long work shift.
  // We flag these employees as borrowed-out when >60% of others have complex shifts (≥2 distinct types per day at some point in the week).
  function isButikOnly(name: string): boolean {
    const n = name.toLowerCase().trim();
    return n === "butik" || n.startsWith("butik ");
  }
  function isComplexEmployee(empId: string): boolean {
    // Has at least one day with 2+ distinct shift types
    const workDays = weekDates.map(date =>
      scheduleShifts.filter(s => s.schedule_employee_id === empId && s.day_date === date && !s.is_absence_day && s.start_time)
    ).filter(ds => ds.length > 0);
    return workDays.some(ds => {
      const types = new Set(ds.map(s => s.shift_name.toLowerCase().trim()));
      return types.size >= 2;
    });
  }

  const allEmpIds = scheduleEmployees.map(e => e.id);
  const complexCount = allEmpIds.filter(id => isComplexEmployee(id)).length;
  const complexRatio = allEmpIds.length > 0 ? complexCount / allEmpIds.length : 0;
  const autoBorrowedEmployeeIds = new Set<string>();
  if (complexRatio > 0.6) {
    for (const emp of scheduleEmployees) {
      const weekWork = scheduleShifts.filter(s => s.schedule_employee_id === emp.id && !s.is_absence_day && s.start_time);
      if (weekWork.length === 0) continue;
      const allButik = weekWork.every(s => isButikOnly(s.shift_name));
      // Also check: each work day has only 1 shift
      const days = [...new Set(weekWork.map(s => s.day_date))];
      const singleShiftDays = days.every(d => weekWork.filter(s => s.day_date === d).length === 1);
      if (allButik && singleShiftDays) autoBorrowedEmployeeIds.add(emp.id);
    }
  }

  const employeeRows = selectedWeekImport
    ? scheduleEmployees
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
          const isAutoBorrowed = autoBorrowedEmployeeIds.has(emp.id);
          return { emp, dayShifts, workShifts, shadowShifts, absenceShift, appUser, weekMinutes, initials, dayTasks, isAutoBorrowed };
        })
    : appUsers.map((u) => {
        // Fallback row when no schedule import exists — show user with their tasks
        const fakeEmp: ScheduleEmployee = {
          id: u.id,
          import_id: "",
          employee_nr: u.id,
          employee_name: u.display_name,
          employee_group: u.employee_group ?? "",
          employee_category: "",
          employment_percent: null,
          work_time_week: null,
        };
        const dayTasks = scheduleTasks.filter((t) => {
          if (!t.due_date || toLocalDateStr(t.due_date) !== currentDate) return false;
          if (t.assigned_to === u.id) return true;
          return scheduleTaskAssignees.some(a => a.task_id === t.id && a.user_id === u.id);
        });
        const initials = u.display_name.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
        return { emp: fakeEmp, dayShifts: [], workShifts: [], shadowShifts: [], absenceShift: undefined, appUser: u, weekMinutes: 0, initials, dayTasks, isAutoBorrowed: false };
      });

  const workingToday = employeeRows.filter((r) => r.workShifts.length > 0).length;
  const absentToday = employeeRows.filter((r) => r.workShifts.length === 0 && r.absenceShift).length;
  const totalStaff = employeeRows.length;
  const totalWeekHours = employeeRows.reduce((sum, r) => sum + r.weekMinutes, 0);

  // Apply filter and sort
  const timeToMinsSort = (t: string | null) => { if (!t) return 9999; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const displayRows = employeeRows
    .filter((r) => !hideLedig || r.workShifts.length > 0 || r.absenceShift)
    .sort((a, b) => {
      if (sortMode === "start") {
        const aStart = Math.min(...(a.workShifts.length > 0 ? a.workShifts.map(s => timeToMinsSort(s.start_time)) : [9999]));
        const bStart = Math.min(...(b.workShifts.length > 0 ? b.workShifts.map(s => timeToMinsSort(s.start_time)) : [9999]));
        return aStart - bStart;
      }
      if (sortMode === "end") {
        const aEnd = Math.max(...(a.workShifts.length > 0 ? a.workShifts.map(s => timeToMinsSort(s.stop_time)) : [0]));
        const bEnd = Math.max(...(b.workShifts.length > 0 ? b.workShifts.map(s => timeToMinsSort(s.stop_time)) : [0]));
        return bEnd - aEnd;
      }
      return 0;
    });

  // Resolve which delivery plan applies to the selected week:
  // Uses selectedWeek (not activeImport) so deliveries show even on weeks without a schedule import.
  // 1. A plan imported specifically for this week (exact match)
  // 2. Else a special-week plan for this week (is_special_week=true, same week/year)
  // 3. Else the default template (is_default_template=true)
  const activeWeekPlan: DeliveryPlan | null = (() => {
    const { weekNumber, year } = selectedWeek;
    const exactMatch = deliveryPlans.find((p) => p.week_number === weekNumber && p.year === year);
    if (exactMatch) return exactMatch;
    return deliveryPlans.find((p) => p.is_default_template) ?? null;
  })();

  // Re-derive delivery dates for the selected week's Monday
  // This way a standard template correctly shows regardless of which week is selected.
  const activeWeekEntries: DeliveryEntry[] = (() => {
    if (!activeWeekPlan) return [];
    const entries = deliveryEntries.filter((d) => d.plan_id === activeWeekPlan.id);
    return entries.map((d) => ({
      ...d,
      delivery_date: deliveryDateForDay(d.delivery_day, selectedWeekStart) ?? d.delivery_date,
    }));
  })();

  // Delivery plan status for the selected week
  const activeWeekHasSpecialPlan = deliveryPlans.some(
    (p) => p.week_number === selectedWeek.weekNumber && p.year === selectedWeek.year && p.is_special_week
  );
  const activeWeekIsHoliday = getSpecialWeekHoliday(selectedWeek.year, selectedWeek.weekNumber);
  const missingSpecialPlan = activeWeekIsHoliday && !activeWeekHasSpecialPlan;
  const missingAnyPlan = deliveryPlans.length > 0 && !activeWeekPlan;

  // Deliveries for current day
  const todayDeliveries = activeWeekEntries.filter((d) => d.delivery_date === currentDate);

  // Meetings for current day
  const todayMeetings = weekMeetings.filter((m) => toLocalDateStr(m.scheduled_at) === currentDate);

  const hourMarkers = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => TIMELINE_START + i);

  // Auto-scroll mobile list once on initial load to first active/upcoming shift
  const didAutoScrollRef = useRef(false);
  useEffect(() => {
    if (didAutoScrollRef.current) return;
    if (!mobileListRef.current || currentDate !== todayStr || loadingSchedule) return;
    didAutoScrollRef.current = true;
    const container = mobileListRef.current;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const cards = container.querySelectorAll<HTMLElement>("[data-shift-start]");
    let targetEl: HTMLElement | null = null;
    for (const card of Array.from(cards)) {
      const stop = parseInt(card.dataset.shiftStop ?? "9999", 10);
      if (stop > nowMins - 15) { targetEl = card; break; }
    }
    if (targetEl) {
      setTimeout(() => {
        if (!targetEl) return;
        const rect = targetEl.getBoundingClientRect();
        const offset = window.scrollY + rect.top - 120;
        window.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
      }, 300);
    }
  }, [loadingSchedule]);

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Page header */}
      <div className="border-b border-border/60 bg-card px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Schema</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {selectedWeekImport
                ? `Vecka ${selectedWeek.weekNumber}, ${selectedWeek.year} · ${selectedWeekImport.raw_employee_count} medarbetare`
                : `Vecka ${selectedWeek.weekNumber}, ${selectedWeek.year} · ${new Date(selectedWeekStart).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const currYear = selectedWeek.year;
              // Build all weeks for the year (w1..w52/53)
              const allWeeks: Array<{ weekNumber: number; year: number; weekStart: string }> = [];
              for (let w = 1; w <= 53; w++) {
                const ws = getWeekStartDate(w, currYear);
                const wsYear = parseInt(ws.slice(0, 4), 10);
                // week belongs to this year if its Monday is in the year or w=1 starts just before
                if (w === 1 && wsYear < currYear) { allWeeks.push({ weekNumber: w, year: currYear, weekStart: ws }); continue; }
                if (wsYear > currYear) break;
                // Check week 53 actually exists for this year
                if (w === 53) {
                  const testDate = new Date(parseInt(ws.slice(0,4)), parseInt(ws.slice(5,7))-1, parseInt(ws.slice(8,10)));
                  if (getISOWeek(testDate) !== 53) break;
                }
                allWeeks.push({ weekNumber: w, year: currYear, weekStart: ws });
              }
              const currIdx = allWeeks.findIndex((w) => w.weekNumber === selectedWeek.weekNumber);
              return (
                <div className="flex items-center gap-1">
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:bg-muted/60 disabled:opacity-30 transition-colors"
                    disabled={currIdx <= 0}
                    onClick={() => {
                      if (currIdx > 0) {
                        const prev = allWeeks[currIdx - 1];
                        navigateToWeek(prev.weekNumber, prev.year);
                      }
                    }}
                    aria-label="Föregående vecka"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <Select
                    value={`${currYear}-${selectedWeek.weekNumber}`}
                    onValueChange={(v) => {
                      const [y, w] = v.split("-").map(Number);
                      navigateToWeek(w, y);
                    }}
                  >
                    <SelectTrigger className="h-9 w-40 text-sm font-medium">
                      <SelectValue placeholder="Välj vecka" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {allWeeks.map((wk) => {
                        const hasImport = imports.some((i) => i.week_number === wk.weekNumber && i.year === wk.year);
                        const monthStr = new Date(parseInt(wk.weekStart.slice(0,4)), parseInt(wk.weekStart.slice(5,7))-1, parseInt(wk.weekStart.slice(8,10)))
                          .toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
                        return (
                          <SelectItem key={`${wk.year}-${wk.weekNumber}`} value={`${wk.year}-${wk.weekNumber}`}>
                            <span className="flex items-center gap-2">
                              <span>V{wk.weekNumber}</span>
                              <span className="text-muted-foreground text-xs">{monthStr}</span>
                              {!hasImport && <span className="text-[10px] text-muted-foreground/50">–</span>}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground hover:bg-muted/60 disabled:opacity-30 transition-colors"
                    disabled={currIdx >= allWeeks.length - 1}
                    onClick={() => {
                      if (currIdx < allWeeks.length - 1) {
                        const next = allWeeks[currIdx + 1];
                        navigateToWeek(next.weekNumber, next.year);
                      }
                    }}
                    aria-label="Nästa vecka"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })()}
            {deliveryPlans.length > 0 && (
              <Button size="sm" variant={showDeliveries ? "default" : "outline"} onClick={() => setShowDeliveries((v) => !v)} className="hidden sm:flex gap-1.5">
                <Truck className="h-4 w-4" />
                {activeWeekPlan?.is_special_week ? "Specialleveranser" : "Leveranser"}
                {(missingAnyPlan || missingSpecialPlan) && <AlertCircle className="h-3.5 w-3.5 text-amber-400" />}
              </Button>
            )}
            {isAdmin && selectedWeekImport && (
              <Button size="sm" variant="outline" className="hidden sm:flex gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5" onClick={() => setDeleteImportTarget(selectedWeekImport)}>
                <Trash2 className="h-4 w-4" />
                Ta bort vecka
              </Button>
            )}
            {isAdmin && deliveryPlans.length > 0 && (
              <Button size="sm" variant="outline" className="hidden sm:flex gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5" onClick={() => setDeleteDeliveryPlanConfirm(true)}>
                <Trash2 className="h-4 w-4" />
                Ta bort leveransplan
              </Button>
            )}
            {activeImport && scheduleEmployees.length > 0 && (
              <Button size="sm" variant="outline" className="hidden sm:flex gap-1.5" onClick={exportScheduleCSV}>
                <Download className="h-4 w-4" />
                Exportera CSV
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" className="hidden sm:flex gap-1.5" onClick={() => { setImportFiles([]); setPdfPreviews({}); if (activeImport) { setCsvWeekNumber(activeImport.week_number + 1 > 53 ? 1 : activeImport.week_number + 1); setCsvYear(activeImport.year); } setImportDialogOpen(true); }}>
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

      {/* Delivery plan warning banners */}
      {showDeliveries && missingAnyPlan && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2.5 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {isAdmin
              ? "Ingen leveransplan importerad. Importera en leveransplan (CSV) för att se leveranser."
              : "Leveransplan saknas för denna vecka. Kontakta din chef för information om leveranser."}
          </p>
          {isAdmin && (
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
              onClick={() => setImportDialogOpen(true)}>
              Importera
            </Button>
          )}
        </div>
      )}
      {showDeliveries && missingSpecialPlan && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2.5 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {isAdmin
              ? <><span className="font-medium">Helgvecka ({activeWeekIsHoliday})</span> — ingen specialleveransplan importerad. Visar standardplan. Importera en specialplan för denna vecka om leveranserna avviker.</>
              : <><span className="font-medium">Helgvecka ({activeWeekIsHoliday})</span> — standardplan visas. Leveranserna kan avvika denna vecka, fråga din chef om du är osäker.</>}
          </p>
          {isAdmin && (
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
              onClick={() => setImportDialogOpen(true)}>
              Importera specialplan
            </Button>
          )}
        </div>
      )}
      {showDeliveries && activeWeekPlan && !activeWeekPlan.is_special_week && activeWeekIsHoliday && !activeWeekHasSpecialPlan && (
        <div className="hidden" /> /* covered by missingSpecialPlan above */
      )}

      {/* Empty state — no schedule imported */}
      {imports.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
            <Calendar className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground">Inget schema importerat</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {isAdmin ? "Exportera ett schema från SoftOne GO som XML och importera det för att se skiftöversikten." : "Schema importeras av administratören. Kontrollera att rätt butik är vald."}
            </p>
          </div>
          {isAdmin && (
            <Button className="min-h-[48px] gap-2 rounded-full" onClick={() => { setImportFiles([]); setPdfPreviews({}); if (activeImport) { setCsvWeekNumber(activeImport.week_number + 1 > 53 ? 1 : activeImport.week_number + 1); setCsvYear(activeImport.year); } setImportDialogOpen(true); }}>
              <Upload className="h-4 w-4" />
              Importera schema
            </Button>
          )}
        </div>
      )}

      {/* Empty week state — shown when no import exists for the selected week */}
      {!selectedWeekImport && weekDates.length > 0 && imports.length > 0 && (
        <div className="mx-3 my-4 sm:mx-6">
          {isAdmin ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <CalendarClock className="h-8 w-8 text-primary/60" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">Inget schema importerat för vecka {selectedWeek.weekNumber}</p>
                <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">Exportera schema för vecka {selectedWeek.weekNumber}, {selectedWeek.year} från SoftOne GO och importera det här.</p>
              </div>
              <Button className="gap-2 rounded-full" onClick={() => { setImportFiles([]); setPdfPreviews({}); setCsvWeekNumber(selectedWeek.weekNumber); setCsvYear(selectedWeek.year); setImportDialogOpen(true); }}>
                <Upload className="h-4 w-4" />
                Importera schema för V{selectedWeek.weekNumber}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Calendar className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Inget schema för vecka {selectedWeek.weekNumber}</p>
                <p className="mt-1 text-sm text-muted-foreground">Schemat för denna vecka har ännu inte lagts till. Fråga din chef om du behöver information.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      {weekDates.length > 0 && (selectedWeekImport || appUsers.length > 0) && (
        <div className="flex flex-1 flex-col px-3 py-3 sm:px-6 sm:py-4">
          {/* Sticky day strip — touch-action: pan-x so only horizontal swipe changes day */}
          <div className="sticky top-14 z-20 -mx-3 mb-3 flex items-center gap-1 border-b border-border/40 bg-background/95 px-2 py-2 backdrop-blur-sm sm:-mx-6 sm:top-16 sm:px-4">
            <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 disabled:opacity-30 transition-colors" onClick={() => setSelectedDayIndex((i) => Math.max(0, i - 1))} disabled={selectedDayIndex === 0} aria-label="Föregående dag">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex flex-1 gap-1 overflow-x-auto scrollbar-none">
              {weekDates.map((date, idx) => {
                const isToday = date === todayStr;
                const count = scheduleEmployees.filter((emp) => scheduleShifts.some((s) => s.schedule_employee_id === emp.id && s.day_date === date && !s.is_absence_day && s.start_time)).length;
                const delivCount = activeWeekEntries.filter((d) => d.delivery_date === date).length;
                const meetCount = weekMeetings.filter((m) => toLocalDateStr(m.scheduled_at) === date).length;
                const isSelected = selectedDayIndex === idx;
                return (
                  <button key={date} onClick={() => setSelectedDayIndex(idx)}
                    className={["relative flex min-w-[44px] flex-col items-center rounded-xl px-1.5 py-2 text-center transition-all",
                      isSelected ? "bg-primary text-primary-foreground shadow-[var(--shadow-md)]" : isToday ? "bg-primary-soft text-primary border border-primary/30" : "bg-card text-foreground hover:bg-muted border border-border/60"].join(" ")}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-widest leading-none">{DAY_SHORT[idx]}</span>
                    {(() => {
                      const [y, m, d] = date.split("-").map(Number);
                      const dateObj = new Date(y, m - 1, d);
                      return (
                        <>
                          <span className="mt-1 text-base font-bold leading-none tabular-nums">{dateObj.getDate()}</span>
                          <span className={["text-[9px] font-medium leading-none mt-0.5", isSelected ? "text-primary-foreground/70" : "text-muted-foreground"].join(" ")}>
                            {dateObj.toLocaleDateString("sv-SE", { month: "short" })}
                          </span>
                        </>
                      );
                    })()}
                    <span className={["mt-0.5 text-[9px] font-medium leading-none", isSelected ? "text-primary-foreground/70" : count > 0 ? "text-muted-foreground" : "text-muted-foreground/40"].join(" ")}>
                      {activeImport ? (count > 0 ? `${count}p` : "–") : ""}
                    </span>
                    {delivCount > 0 && (
                      <span className={["text-[8px] font-medium leading-none", isSelected ? "text-primary-foreground/60" : "text-info"].join(" ")}>
                        {delivCount}l
                      </span>
                    )}
                    {meetCount > 0 && (
                      <span className={["text-[8px] font-medium leading-none", isSelected ? "text-primary-foreground/60" : "text-sky-600"].join(" ")}>
                        m
                      </span>
                    )}
                    {isToday && !isSelected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
            <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 disabled:opacity-30 transition-colors" onClick={() => setSelectedDayIndex((i) => Math.min(6, i + 1))} disabled={selectedDayIndex === 6} aria-label="Nästa dag">
              <ChevronRight className="h-5 w-5" />
            </button>
            {/* View mode toggle — hidden on mobile, visible sm+ */}
            <div className="ml-1 hidden shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/40 sm:flex">
              <button onClick={() => setViewMode("day")} className={["flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "day" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}>
                <List className="h-3.5 w-3.5" />Dag
              </button>
              <button onClick={() => setViewMode("week")} className={["flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "week" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}>
                <LayoutGrid className="h-3.5 w-3.5" />Vecka
              </button>
            </div>
          </div>

          {/* Day heading + controls */}
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
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
            {viewMode === "day" && (
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setHideLedig(v => !v)}
                  className={["hidden sm:block rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors min-h-[36px]", hideLedig ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border/60 hover:border-primary/50"].join(" ")}
                >
                  Dölj lediga
                </button>
                <div className="hidden items-center overflow-hidden rounded-lg border border-border/60 bg-muted/40 sm:flex">
                  {(["default","start","end"] as const).map(m => (
                    <button key={m} onClick={() => setSortMode(m)}
                      className={["px-2.5 py-1.5 text-xs font-medium transition-colors", sortMode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}>
                      {m === "default" ? "Standard" : m === "start" ? "Starttid" : "Sluttid"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Deliveries row for day view — desktop only */}
          {viewMode === "day" && showDeliveries && todayDeliveries.length > 0 && (
            <div className="mb-2 hidden flex-wrap gap-2 sm:flex">
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

          {/* Meetings row for day view — desktop only */}
          {viewMode === "day" && todayMeetings.length > 0 && (
            <div className="mb-3 hidden flex-wrap gap-2 sm:flex">
              {todayMeetings.map((m) => {
                const time = new Date(m.scheduled_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
                const isDone = m.status === "completed" || m.status === "cancelled";
                return (
                  <div key={m.id} className={["flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium", isDone ? "opacity-50" : ""].join(" ")} style={{ backgroundColor: "var(--color-info-soft, #e0f2fe)", color: "#0369a1", borderColor: "#bae6fd" }}>
                    <CalendarClock className="h-3 w-3" />
                    <span>{time} — {m.title}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Empty week banner — shown when the import has no shifts at all ── */}
          {!loadingSchedule && activeImport && scheduleShifts.length === 0 && (
            <div className="mb-4 flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-destructive/40 bg-destructive/5 px-6 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive/70" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">Schemat saknar pass</p>
                <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                  Vecka {activeImport.week_number}, {activeImport.year} verkar vara tomt eller felaktigt importerat. Vänligen exportera denna vecka från SoftOne GO igen och importera på nytt.
                </p>
              </div>
              {isAdmin && (
                <Button
                  variant="destructive"
                  className="gap-2 rounded-full"
                  onClick={() => { setImportFiles([]); setPdfPreviews({}); setCsvWeekNumber(activeImport.week_number); setCsvYear(activeImport.year); setImportDialogOpen(true); }}
                >
                  <Upload className="h-4 w-4" />
                  Importera vecka {activeImport.week_number} igen
                </Button>
              )}
            </div>
          )}

          {/* ── MOBILE LEVERANSER VIEW (below sm) ───────────────────────────── */}
          {viewMode === "day" && (
            <div className="sm:hidden mb-4">
              {deliveryEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-14 text-center">
                  <Truck className="mb-3 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">Ingen leveransplan importerad</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Importera en CSV-fil för att se leveranserna</p>
                </div>
              ) : todayDeliveries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-14 text-center">
                  <Truck className="mb-3 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">Inga leveranser idag</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayDeliveries.map((d) => {
                    const c = flowColor(d.flow_name);
                    return (
                      <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3" style={{ borderLeftWidth: 4, borderLeftColor: c.text }}>
                        <Truck className="h-5 w-5 shrink-0" style={{ color: c.text }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{d.flow_name}</p>
                          {d.supplier && <p className="text-xs text-muted-foreground truncate">{d.supplier}</p>}
                        </div>
                        <span className="text-sm font-mono font-bold shrink-0" style={{ color: c.text }}>{d.delivery_time}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── MOBILE SCHEDULE CARD VIEW — hidden on mobile, desktop uses timeline ── */}
          {viewMode === "day" && (
            <div className="hidden sm:block pb-6" data-scroll-container ref={mobileListRef}>
              {loadingSchedule ? (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-4">
                      <div className="h-10 w-10 animate-pulse rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
                        <div className="h-3 w-1/3 animate-pulse rounded-md bg-muted/60" />
                      </div>
                      <div className="h-6 w-20 animate-pulse rounded-full bg-muted/60 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : displayRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    <Calendar className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Inga pass schemalagda</p>
                    <p className="mt-1 text-sm text-muted-foreground">Kontrollera att rätt butik är vald eller uppdatera sidan.</p>
                  </div>
                  <button
                    onClick={() => { if (activeImport) loadScheduleData(activeImport.id); }}
                    className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors min-h-[48px]"
                  >
                    <RefreshCw className="h-4 w-4" /> Uppdatera schema
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Deliveries & meetings strip */}
                  {(todayDeliveries.length > 0 || todayMeetings.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {todayDeliveries.map((d) => {
                        const c = flowColor(d.flow_name);
                        return (
                          <div key={d.id} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: c.bg, color: c.text, borderColor: c.text + "30" }}>
                            <Truck className="h-3 w-3" />{d.delivery_time} {d.flow_name}
                          </div>
                        );
                      })}
                      {todayMeetings.map((m) => {
                        const time = new Date(m.scheduled_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
                        return (
                          <div key={m.id} className="flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                            <CalendarClock className="h-3 w-3" />{time}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {displayRows.map(({ emp, workShifts, absenceShift, appUser, initials, dayTasks, weekMinutes }) => {
                    const isAbsent = workShifts.length === 0 && !!absenceShift;
                    const isSemester = absenceShift?.deviation_cause?.toLowerCase().includes("semester") || absenceShift?.shift_name?.toLowerCase() === "semester";
                    const isLedig = workShifts.length === 0 && !absenceShift;
                    const name = appUser?.display_name ?? emp.employee_name;

                    // Compute now relative to shifts for fading
                    const now = new Date();
                    const nowMins = now.getHours() * 60 + now.getMinutes();
                    const timeToMins2 = (t: string | null) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + m; };

                    // Primary shift (first active/upcoming shift)
                    const primaryShift = workShifts.sort((a, b) => timeToMins2(a.start_time) - timeToMins2(b.start_time))[0];
                    const isPast = primaryShift ? timeToMins2(primaryShift.stop_time) < nowMins - 5 && currentDate === todayStr : false;

                    if (isLedig) return null; // hidden when hideLedig is off they're already excluded by filter

                    const startMins = primaryShift ? timeToMins2(primaryShift.start_time) : 0;
                    const stopMins = primaryShift ? timeToMins2(primaryShift.stop_time) : 0;

                    return (
                      <div
                        key={emp.id}
                        data-shift-start={startMins}
                        data-shift-stop={stopMins}
                        className={cn(
                          "rounded-2xl border bg-card p-4 transition-all",
                          isSemester ? "border-red-200/60 bg-red-50/40" : isAbsent ? "border-warning/30 bg-warning/5" : "border-border/60",
                          isPast && "opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              background: isSemester ? "#fca5a5" : appUser ? "oklch(0.5 0.16 148)" : "oklch(0.88 0.02 145)",
                              color: isSemester ? "#7f1d1d" : appUser ? "white" : "oklch(0.4 0.05 145)",
                            }}
                          >
                            {initials}
                          </div>

                          {/* Name + dept */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-sm leading-snug text-foreground">{name}</p>
                              {emp.employment_percent != null && (
                                <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 rounded-full px-1.5 py-0.5 leading-none" title={`Sysselsättningsgrad: ${emp.employment_percent}%`}>{emp.employment_percent}%</span>
                              )}
                              {primaryShift?.is_borrowed && (
                                <span className="flex items-center gap-0.5 text-[10px] font-medium text-sky-600 bg-sky-50 rounded-full px-1.5 py-0.5 leading-none"><ArrowLeftRight className="h-2.5 w-2.5" />Inlånad</span>
                              )}
                              {primaryShift?.is_preliminary && (
                                <span className="text-[10px] font-medium text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5 leading-none">Preliminär</span>
                              )}
                            </div>
                            {primaryShift && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {primaryShift.shift_name}
                                {primaryShift.shift_description ? ` · ${primaryShift.shift_description}` : ""}
                                {primaryShift.deviation_cause && !isAbsent ? ` · ${primaryShift.deviation_cause}` : ""}
                              </p>
                            )}
                            {isSemester && <p className="text-xs font-medium text-red-500">Semester</p>}
                            {isAbsent && !isSemester && <p className="text-xs text-warning-foreground">{absenceShift?.deviation_cause || "Frånvaro"}</p>}
                            {(() => {
                              const dayMins = workShifts.reduce((s, sh) => s + (sh.net_minutes > 0 ? sh.net_minutes : Math.max(0, sh.gross_minutes - sh.break_minutes)), 0);
                              return (
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                  {dayMins > 0 ? `${minsToHours(dayMins)} idag` : ""}
                                  {dayMins > 0 && weekMinutes > 0 ? " · " : ""}
                                  {weekMinutes > 0 ? `V: ${minsToHours(weekMinutes)}` : ""}
                                </p>
                              );
                            })()}
                          </div>

                          {/* Time block — primary info, bold */}
                          <div className="shrink-0 text-right">
                            {primaryShift ? (
                              <>
                                <p className="text-sm font-bold text-foreground tabular-nums leading-snug">
                                  {primaryShift.start_time}–{primaryShift.stop_time}
                                </p>
                                {workShifts.length > 1 && (
                                  <p className="text-[10px] text-muted-foreground">+{workShifts.length - 1} pass</p>
                                )}
                              </>
                            ) : null}
                          </div>

                          {/* Shift type badge — color coded */}
                          {primaryShift && (() => {
                            const col = shiftColor(primaryShift.shift_name, primaryShift.color);
                            const light = isLightColor(col);
                            return (
                              <div
                                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-snug hidden xs:block"
                                style={{ backgroundColor: col, color: light ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.92)" }}
                              >
                                {primaryShift.shift_name || "–"}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Additional shifts */}
                        {workShifts.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-1.5 pl-14">
                            {workShifts.slice(1).map((s) => {
                              const col = shiftColor(s.shift_name, s.color);
                              return (
                                <div key={s.id} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: col + "55", borderLeft: `2px solid ${col}` }}>
                                  <span>{s.shift_name}</span>
                                  <span className="opacity-70 font-mono">{s.start_time}–{s.stop_time}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Due tasks for this employee today */}
                        {dayTasks.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1 pl-14">
                            {dayTasks.map((t) => (
                              <div key={t.id} className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                <Timer className="h-2.5 w-2.5 shrink-0" />
                                {t.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── DESKTOP TIMELINE VIEW (sm and above) ────────────────────────── */}
          {viewMode === "day" && (
            <div className="hidden overflow-auto rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)] sm:flex sm:flex-col" style={{ maxHeight: "calc(100vh - 18rem)" }}>
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

              {/* Meetings row in day timeline */}
              {todayMeetings.length > 0 && (
                <div className="flex border-b border-border/20 bg-sky-50/40 dark:bg-sky-950/10">
                  <div className="flex w-48 shrink-0 items-center border-r border-border/30 px-4 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" /> Möten
                    </span>
                  </div>
                  <div className="relative flex-1 py-1" style={{ minWidth: `${TOTAL_HOURS * 60}px` }}>
                    <div className="absolute inset-0 flex pointer-events-none">
                      {hourMarkers.map((h) => <div key={h} className="flex-1 border-r border-border/15 last:border-r-0" />)}
                    </div>
                    {todayMeetings.map((m) => {
                      const time = new Date(m.scheduled_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
                      const left = timeToPercent(time);
                      if (left < 0 || left > 100) return null;
                      const isDone = m.status === "completed" || m.status === "cancelled";
                      return (
                        <div key={m.id} className={["absolute top-0.5 bottom-0.5 flex items-center rounded px-1.5 text-[10px] font-semibold cursor-default select-none whitespace-nowrap overflow-hidden", isDone ? "opacity-50" : ""].join(" ")}
                          style={{ left: `${Math.max(0, left)}%`, minWidth: "52px", maxWidth: "14%", backgroundColor: "#e0f2fe", color: "#0369a1", borderLeft: "2px solid #7dd3fc" }}
                          title={`${m.title} — ${time}`}>
                          {time} {m.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tasks row in day timeline */}
              {scheduleTasks.filter((t) => t.due_date && toLocalDateStr(t.due_date) === currentDate).length > 0 && (
                <div className="flex border-b border-border/20 bg-amber-50/40 dark:bg-amber-950/10">
                  <div className="flex w-48 shrink-0 items-center border-r border-border/30 px-4 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <Timer className="h-3 w-3" /> Uppgifter
                    </span>
                  </div>
                  <div className="relative flex-1 py-1" style={{ minWidth: `${TOTAL_HOURS * 60}px` }}>
                    <div className="absolute inset-0 flex pointer-events-none">
                      {hourMarkers.map((h) => <div key={h} className="flex-1 border-r border-border/15 last:border-r-0" />)}
                    </div>
                    {scheduleTasks.filter((t) => t.due_date && toLocalDateStr(t.due_date) === currentDate).map((task) => {
                      const dueTime = new Date(task.due_date!).toTimeString().slice(0, 5);
                      const dueH = parseInt(dueTime.split(":")[0]);
                      if (dueH < TIMELINE_START || dueH > TIMELINE_END) return null;
                      const left = timeToPercent(dueTime);
                      const isLate = task.status === "late" || new Date(task.due_date!) < new Date();
                      return (
                        <div key={task.id} className="absolute top-0.5 bottom-0.5 flex items-center rounded px-1.5 text-[10px] font-semibold cursor-default select-none whitespace-nowrap overflow-hidden"
                          style={{ left: `${Math.max(0, left)}%`, minWidth: "60px", maxWidth: "14%", backgroundColor: isLate ? "#fee2e2" : "#fef3c7", color: isLate ? "#dc2626" : "#92400e", borderLeft: `2px solid ${isLate ? "#dc2626" : "#d97706"}` }}
                          title={`${task.title} — ${dueTime}`}>
                          {dueTime} {task.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {displayRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <Clock className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Inga pass schemalagda denna dag</p>
                </div>
              ) : (
                displayRows.map(({ emp, workShifts, shadowShifts, absenceShift, appUser, weekMinutes, initials, dayTasks }) => {
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
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {emp.employment_percent != null && (
                            <span className="text-[9px] text-muted-foreground/70" title={`Sysselsättningsgrad: ${emp.employment_percent}%`}>{emp.employment_percent}%</span>
                          )}
                          {weekMinutes > 0 && <span className="text-[9px] text-muted-foreground/70" title="Schemalagd tid denna vecka">{minsToHours(weekMinutes)}/v</span>}
                          {(() => {
                            const dayMins = workShifts.reduce((s, sh) => s + (sh.net_minutes > 0 ? sh.net_minutes : Math.max(0, sh.gross_minutes - sh.break_minutes)), 0);
                            return dayMins > 0 ? <span className="text-[9px] font-medium text-foreground/60" title="Schemalagd tid idag">{minsToHours(dayMins)}/dag</span> : null;
                          })()}
                        </div>
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
                          <div className="absolute top-1.5 bottom-1.5 flex items-center gap-2 flex-wrap" style={{ left: "12px" }}>
                            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-100/60 px-3 py-1.5 dark:border-red-800/40 dark:bg-red-900/20">
                              <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Semester</span>
                            </div>
                            {shadowShifts.map((shift) => {
                              const col = shiftColor(shift.shift_name, shift.color);
                              return (
                                <div key={shift.id} className="flex items-center gap-1 rounded-lg border px-2 py-1 opacity-60"
                                  style={{ borderColor: col + "80", backgroundColor: col + "20" }}
                                  title={`Planerat: ${shift.shift_name} ${shift.start_time}–${shift.stop_time}`}>
                                  <span className="text-[10px] font-medium" style={{ color: isLightColor(col) ? "rgba(0,0,0,0.6)" : col }}>{shift.shift_name}</span>
                                  <span className="text-[10px] opacity-70" style={{ color: isLightColor(col) ? "rgba(0,0,0,0.5)" : col + "cc" }}>{shift.start_time}–{shift.stop_time}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : workShifts.length === 0 ? (
                        <div className="flex h-full items-center px-3">
                          <span className="text-[11px] italic text-muted-foreground/40">{absenceShift?.deviation_cause || "Ledig"}</span>
                        </div>
                      ) : (
                        <>
                          {workShifts.map((shift) => {
                            const left = timeToPercent(shift.start_time!);
                            const width = shiftWidthPercent(shift.start_time!, shift.stop_time!);
                            const col = shiftColor(shift.shift_name, shift.color);
                            const light = isLightColor(col);
                            return (
                              <div key={shift.id} className="absolute top-1.5 bottom-1.5" style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(width, 1.5)}%`, minWidth: "36px" }}>
                                <div
                                  className="absolute inset-0 flex items-center gap-1 overflow-hidden rounded-lg px-2 text-[11px] font-semibold shadow-sm cursor-default select-none transition-opacity hover:opacity-90"
                                  style={{ backgroundColor: col, color: light ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.92)", borderLeft: `2px solid ${light ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.3)"}` }}
                                  title={[
                                    `${shift.shift_name || emp.employee_name}: ${shift.start_time} – ${shift.stop_time}`,
                                    shift.shift_description ? `Beskrivning: ${shift.shift_description}` : null,
                                    `Brutto: ${minsToHours(shift.gross_minutes)}`,
                                    shift.break_minutes > 0 ? `Rast: ${shift.break_minutes} min` : null,
                                    `Netto: ${minsToHours(shift.net_minutes > 0 ? shift.net_minutes : Math.max(0, shift.gross_minutes - shift.break_minutes))}`,
                                    shift.deviation_cause && !shift.is_absence_day ? `Avvikelse: ${shift.deviation_cause}` : null,
                                    shift.is_lended ? "↔ Utlånad till annan enhet" : null,
                                    shift.is_borrowed ? "↔ Inlånad från annan enhet" : null,
                                    shift.is_preliminary ? "⚠ Preliminärt pass" : null,
                                  ].filter(Boolean).join("\n")}>
                                  {shift.is_lended && <ArrowLeftRight className="h-2.5 w-2.5 shrink-0 opacity-80" />}
                                  {shift.is_borrowed && <ArrowLeftRight className="h-2.5 w-2.5 shrink-0 opacity-80" />}
                                  {shift.is_preliminary && <span className="shrink-0 text-[9px] opacity-70">※</span>}
                                  <span className="truncate leading-tight">
                                    {shift.shift_name ? <>{shift.shift_name}<br /><span className="opacity-70">{shift.start_time}–{shift.stop_time}</span></> : `${shift.start_time}–${shift.stop_time}`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {/* Breaks rendered on the timeline directly using absolute timestamps */}
                          {workShifts.flatMap((shift) =>
                            (Array.isArray(shift.break_windows) ? shift.break_windows as BreakWindow[] : []).map((bw, bi) => {
                              const bLeft = timeToPercent(bw.start);
                              const bWidthPct = (bw.minutes / (TOTAL_HOURS * 60)) * 100;
                              if (bLeft < 0 || bLeft > 100) return null;
                              return (
                                <div key={`${shift.id}-bw-${bi}`}
                                  className="absolute top-1.5 bottom-1.5 z-20 pointer-events-none rounded-sm"
                                  style={{ left: `${bLeft}%`, width: `${Math.max(bWidthPct, 0.4)}%`, backgroundColor: "rgba(0,0,0,0.28)", backdropFilter: "brightness(0.72)" }}
                                  title={`Rast ${bw.start}, ${bw.minutes} min`}
                                />
                              );
                            })
                          )}
                        </>
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

          {/* ── WEEK OVERVIEW (desktop only) ─────────────────────────────── */}
          {viewMode === "week" && (
            <div className="overflow-auto rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]" style={{ maxHeight: "calc(100vh - 18rem)" }}>
              <div className="sticky top-0 z-10 grid bg-card/95 backdrop-blur-sm border-b border-border/60" style={{ gridTemplateColumns: "12rem repeat(7, 1fr)" }}>
                <div className="border-r border-border/40 px-4 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Medarbetare</span>
                </div>
                {weekDates.map((date, idx) => {
                  const isToday = date === todayStr;
                  const delivCount = activeWeekEntries.filter((d) => d.delivery_date === date).length;
                  return (
                    <div key={date} className={["border-r border-border/30 last:border-r-0 px-2 py-2.5 text-center cursor-pointer hover:bg-muted/30 transition-colors", isToday ? "bg-primary-soft/40" : ""].join(" ")} onClick={() => { setSelectedDayIndex(idx); setViewMode("day"); }}>
                      <p className={["text-[10px] font-semibold uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground"].join(" ")}>{DAY_SHORT[idx]}</p>
                      <p className={["text-sm font-bold", isToday ? "text-primary" : "text-foreground"].join(" ")}>{fmtDate(date).split(" ")[0]}</p>
                      {delivCount > 0 && <p className="text-[9px] text-info font-medium">{delivCount} lev</p>}
                    </div>
                  );
                })}
              </div>

              {displayRows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12">
                  <Clock className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Inga schemalagda pass</p>
                </div>
              ) : (
                displayRows.map(({ emp, appUser, weekMinutes, initials }) => (
                  <div key={emp.id} className="grid border-b border-border/20 last:border-b-0 hover:bg-muted/10 transition-colors" style={{ gridTemplateColumns: "12rem repeat(7, 1fr)" }}>
                    <div className="flex items-center gap-2.5 border-r border-border/30 px-4 py-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ background: appUser ? "oklch(0.5 0.16 148)" : "oklch(0.88 0.02 145)", color: appUser ? "white" : "oklch(0.4 0.05 145)" }}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">{appUser?.display_name ?? emp.employee_name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {emp.employment_percent != null && <span className="text-[9px] text-muted-foreground/60">{emp.employment_percent}%</span>}
                          {weekMinutes > 0 && <span className="text-[9px] text-muted-foreground/60">{minsToHours(weekMinutes)}</span>}
                        </div>
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
                            const tooltipParts = [
                              s.shift_name ? `${s.shift_name}: ${s.start_time}–${s.stop_time}` : `${s.start_time}–${s.stop_time}`,
                              s.shift_description ? `Beskrivning: ${s.shift_description}` : null,
                              s.gross_minutes > 0 ? `Brutto: ${minsToHours(s.gross_minutes)}` : null,
                              s.break_minutes > 0 ? `Rast: ${s.break_minutes} min` : null,
                              s.net_minutes > 0 ? `Netto: ${minsToHours(s.net_minutes)}` : null,
                              s.deviation_cause && !s.is_absence_day ? `Avvikelse: ${s.deviation_cause}` : null,
                              s.is_lended ? "↔ Utlånad till annan enhet" : null,
                              s.is_borrowed ? "↔ Inlånad från annan enhet" : null,
                              s.is_preliminary ? "⚠ Preliminärt pass" : null,
                            ].filter(Boolean).join("\n");
                            return (
                              <div key={s.id} className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold truncate"
                                style={{ backgroundColor: col + "55", borderLeft: `2px solid ${col}`, color: isLightColor(col) ? "oklch(0.25 0.05 145)" : "oklch(0.15 0.05 145)" }}
                                title={tooltipParts}>
                                {(s.is_lended || s.is_borrowed) && <ArrowLeftRight className="h-2 w-2 shrink-0" />}
                                {s.is_preliminary && <span className="shrink-0 opacity-60">※</span>}
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
                    const dayDeliveries = activeWeekEntries.filter((d) => d.delivery_date === date);
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

              {/* Meetings row in week view */}
              {weekMeetings.length > 0 && (
                <div className="grid border-t border-border/20 bg-sky-50/30 dark:bg-sky-950/10" style={{ gridTemplateColumns: "12rem repeat(7, 1fr)" }}>
                  <div className="border-r border-border/40 px-4 py-2 flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-sky-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Möten</span>
                  </div>
                  {weekDates.map((date, idx) => {
                    const dayMeetings = weekMeetings.filter((m) => toLocalDateStr(m.scheduled_at) === date);
                    const isToday = date === todayStr;
                    return (
                      <div key={idx} className={["border-r border-border/20 last:border-r-0 px-1.5 py-1.5 flex flex-col gap-0.5", isToday ? "bg-primary-soft/10" : ""].join(" ")}>
                        {dayMeetings.map((m) => {
                          const time = new Date(m.scheduled_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
                          const isDone = m.status === "completed" || m.status === "cancelled";
                          return (
                            <div key={m.id} className={["rounded px-1 py-0.5 text-[9px] font-semibold truncate", isDone ? "opacity-50" : ""].join(" ")}
                              style={{ backgroundColor: "#e0f2fe", color: "#0369a1", borderLeft: "2px solid #7dd3fc" }}
                              title={`${m.title} — ${time}`}>
                              {time} {m.title}
                            </div>
                          );
                        })}
                        {dayMeetings.length === 0 && <span className="text-center text-[10px] text-muted-foreground/20">–</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tasks row in week view */}
              {scheduleTasks.length > 0 && (
                <div className="grid border-t border-border/20 bg-amber-50/20 dark:bg-amber-950/10" style={{ gridTemplateColumns: "12rem repeat(7, 1fr)" }}>
                  <div className="border-r border-border/40 px-4 py-2 flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Uppgifter</span>
                  </div>
                  {weekDates.map((date, idx) => {
                    const dayTasksForDate = scheduleTasks.filter((t) => t.due_date && toLocalDateStr(t.due_date) === date);
                    const isToday = date === todayStr;
                    return (
                      <div key={idx} className={["border-r border-border/20 last:border-r-0 px-1.5 py-1.5 flex flex-col gap-0.5", isToday ? "bg-primary-soft/10" : ""].join(" ")}>
                        {dayTasksForDate.map((task) => {
                          const isLate = task.status === "late" || (task.due_date && new Date(task.due_date) < new Date());
                          return (
                            <div key={task.id} className="rounded px-1 py-0.5 text-[9px] font-semibold truncate"
                              style={{ backgroundColor: isLate ? "#fee2e2" : "#fef3c7", color: isLate ? "#dc2626" : "#92400e", borderLeft: `2px solid ${isLate ? "#dc2626" : "#d97706"}` }}
                              title={task.title}>
                              {task.title}
                            </div>
                          );
                        })}
                        {dayTasksForDate.length === 0 && <span className="text-center text-[10px] text-muted-foreground/20">–</span>}
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
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Export från leveransportalen — välj veckonummer nedan</p>
                </div>
              </div>
            </div>

            {/* Default week picker — used as starting values for newly added CSV files */}
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground shrink-0">Standardvecka för ny CSV</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={53} value={csvWeekNumber}
                  onChange={(e) => setCsvWeekNumber(Math.max(1, Math.min(53, parseInt(e.target.value) || 1)))}
                  className="w-16 rounded-lg border border-border/60 bg-background px-2 py-1 text-center text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="text-xs text-muted-foreground">/</span>
                <input
                  type="number" min={2020} max={2099} value={csvYear}
                  onChange={(e) => setCsvYear(parseInt(e.target.value) || new Date().getFullYear())}
                  className="w-20 rounded-lg border border-border/60 bg-background px-2 py-1 text-center text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <span className="text-[11px] text-muted-foreground ml-auto">Ange vecka/år per fil nedan</span>
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

                      {/* Per-file week + label controls (CSV only) */}
                      {isCsv && (() => {
                        const lbl = csvFileLabels[f.name] ?? { weekNumber: csvWeekNumber, year: csvYear, label: "Standard" };
                        const holiday = getSpecialWeekHoliday(lbl.year, lbl.weekNumber);
                        return (
                          <div className={["border-t border-border/40 px-3 py-2.5 space-y-2", holiday ? "bg-amber-50/40 dark:bg-amber-950/10" : "bg-muted/20"].join(" ")}>
                            <div className="flex flex-wrap items-center gap-2">
                              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="text-[11px] font-medium text-foreground shrink-0">Vecka:</span>
                              <input type="number" min={1} max={53} value={lbl.weekNumber}
                                onChange={(e) => setCsvFileLabels((p) => ({ ...p, [f.name]: { ...lbl, weekNumber: Math.max(1, Math.min(53, parseInt(e.target.value) || 1)) } }))}
                                className="w-14 rounded border border-border/60 bg-background px-1.5 py-0.5 text-center text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                              />
                              <span className="text-[11px] text-muted-foreground">/</span>
                              <input type="number" min={2020} max={2099} value={lbl.year}
                                onChange={(e) => setCsvFileLabels((p) => ({ ...p, [f.name]: { ...lbl, year: parseInt(e.target.value) || new Date().getFullYear() } }))}
                                className="w-18 rounded border border-border/60 bg-background px-1.5 py-0.5 text-center text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                              />
                              <label className="ml-2 flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={lbl.label === "Specialvecka" || holiday !== null}
                                  disabled={holiday !== null}
                                  onChange={(e) => setCsvFileLabels((p) => ({ ...p, [f.name]: { ...lbl, label: e.target.checked ? "Specialvecka" : "Standard" } }))}
                                  className="rounded accent-amber-600"
                                />
                                <span className="text-[11px] font-medium text-foreground">Specialvecka</span>
                              </label>
                            </div>
                            {holiday && (
                              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                <span>Helgdag: <strong>{holiday}</strong></span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

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
            <div className="flex-1 pr-8">
              <h2 className="text-sm font-semibold text-foreground">
                {parsed ? "Granska och bekräfta import" : "Personalmatching"}
              </h2>
              {parsed && parsed.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {parsed[0].storeName && `${parsed[0].storeName} · `}
                  {parsed.length === 1
                    ? `Vecka ${parsed[0].weekNumber}, ${parsed[0].year}`
                    : `Veckorna ${parsed.map(p => p.weekNumber).join(", ")}, ${parsed[0].year}`
                  } · {matchedEmployees.length} anställda
                </p>
              )}
            </div>
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
            {!parsed && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
                <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-center text-sm text-muted-foreground">Matchningar hanteras vid import. Importera ett nytt schema för att uppdatera matchningar.</p>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
            <Button variant="outline" size="sm" onClick={() => { if (!savingImport) { setMappingOpen(false); setParsed(null); setMatchedEmployees([]); } }} disabled={savingImport}>
              {parsed ? "Avbryt" : "Stäng"}
            </Button>
            {parsed && (() => {
              const unmappedCount = matchedEmployees.filter((m) => m.matchType === "new").length;
              return unmappedCount > 0 ? (
                <Button size="sm" variant="outline" onClick={bulkCreateUnmatchedAccounts} disabled={bulkCreatingAccounts} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  {bulkCreatingAccounts ? "Skapar konton…" : `Skapa konton för alla (${unmappedCount})`}
                </Button>
              ) : null;
            })()}
            {parsed && (
              <Button size="sm" onClick={confirmImport} disabled={savingImport} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                {savingImport ? "Importerar…" : "Bekräfta och importera"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE SCHEDULE IMPORT */}
      <AlertDialog open={!!deleteImportTarget} onOpenChange={(o) => !o && setDeleteImportTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort schema — V{deleteImportTarget?.week_number} {deleteImportTarget?.year}</AlertDialogTitle>
            <AlertDialogDescription>
              Schemaimporten och alla tillhörande skift för denna vecka raderas permanent. Åtgärden kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteImportTarget && deleteScheduleImport(deleteImportTarget)}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE DELIVERY PLANS */}
      <AlertDialog open={deleteDeliveryPlanConfirm} onOpenChange={setDeleteDeliveryPlanConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort alla leveransplaner</AlertDialogTitle>
            <AlertDialogDescription>
              Alla leveransplaner och leveransposter för denna butik raderas permanent. Du kan sedan importera en ny leveransplan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteAllDeliveryPlans}
            >
              Ta bort alla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function buildPeriodStartsSimple(
  originDue: Date, rule: string, weekdays: number[] | null,
  startDate: Date | null, endDate: Date | null,
  ceil: Date, floor: Date,
): Date[] {
  const midnight = (d: Date) => { const n = new Date(d); n.setHours(0,0,0,0); return n; };
  const effectiveCeil = endDate && midnight(endDate) < ceil ? midnight(endDate) : ceil;
  const effectiveFloor = startDate ? midnight(startDate) : floor;
  const results: Date[] = [];

  if (rule === "weekly" && weekdays && weekdays.length > 0) {
    const cur = new Date(effectiveFloor);
    while (cur <= effectiveCeil) {
      const js = cur.getDay();
      const d = js === 0 ? 6 : js - 1;
      if (weekdays.includes(d)) results.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return results;
  }

  const advance = (d: Date): Date => {
    const n = new Date(d);
    if (rule === "daily") n.setDate(n.getDate() + 1);
    else if (rule === "every_other_day") n.setDate(n.getDate() + 2);
    else if (rule === "weekly") n.setDate(n.getDate() + 7);
    else if (rule === "monthly") { const od = originDue.getDate(); n.setMonth(n.getMonth() + 1); const dim = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate(); n.setDate(Math.min(od, dim)); }
    else if (rule === "yearly") n.setFullYear(n.getFullYear() + 1);
    n.setHours(0,0,0,0);
    return n;
  };

  let cur = midnight(new Date(originDue));
  cur = advance(cur);
  while (cur < effectiveFloor) cur = advance(cur);
  while (cur <= effectiveCeil) { results.push(new Date(cur)); cur = advance(new Date(cur)); }
  return results;
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

function MappingRow({ employeeNr, employeeName, employeeGroup, appUsers, mappedUserId, storeId, foreningId, distriktId, onMap, onUserCreated }: {
  employeeNr: string; employeeName: string; employeeGroup: string;
  appUsers: AppUser[]; mappedUserId: string | null; storeId: string | null;
  foreningId?: string | null; distriktId?: string | null;
  onMap: (uid: string | null) => void; onUserCreated: (user: AppUser) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState(() => usernameFromName(employeeName));
  const [newPassword] = useState(() => generatePassword(16));
  const [createError, setCreateError] = useState("");

  const role = groupToRole(employeeGroup);
  const roleLabel = role === "manager" ? "Chef" : "Anställd";
  const roleBg = role === "manager" ? "bg-info/15 text-info" : "bg-muted text-muted-foreground";

  async function handleCreate() {
    if (!storeId) return;
    setCreateError("");
    if (newUsername.length < 3) { setCreateError("Minst 3 tecken i användarnamnet."); return; }
    setCreating(true);
    try {
      const { data: existing } = await supabase.from("app_users").select("id").eq("username", newUsername.toLowerCase().trim()).maybeSingle();
      if (existing) { setCreateError("Användarnamnet är redan taget."); return; }
      const { data: hash } = await supabase.rpc("hash_password", { plain_password: newPassword });
      const { data: created, error } = await supabase.from("app_users").insert({ username: newUsername.toLowerCase().trim(), password_hash: hash, display_name: employeeName, role, employee_group: employeeGroup, store_id: storeId, is_active: true, must_change_password: true })
        .select("id, username, display_name, role, employee_group, store_id, active_store_id, is_active, last_login, created_at").single();
      if (error || !created) { setCreateError(error?.message ?? "Något gick fel."); return; }
      await supabase.from("user_stores").upsert({ user_id: (created as AppUser).id, store_id: storeId, is_primary: true }, { onConflict: "user_id,store_id" });
      if (foreningId) {
        await supabase.from("user_foreningar").upsert({ user_id: (created as AppUser).id, forening_id: foreningId, is_primary: true }, { onConflict: "user_id,forening_id" });
        await supabase.from("app_users").update({ forening_id: foreningId }).eq("id", (created as AppUser).id);
      }
      if (distriktId) {
        await supabase.from("user_distrikt").upsert({ user_id: (created as AppUser).id, distrikt_id: distriktId, is_primary: true }, { onConflict: "user_id,distrikt_id" });
        await supabase.from("app_users").update({ distrikt_id: distriktId }).eq("id", (created as AppUser).id);
      }
      onUserCreated(created as AppUser);
      setShowCreate(false);
      toast.success(`Konto för ${employeeName} skapat. Lösenord byts vid första inloggning.`);
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
