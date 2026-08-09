// Edge Function: import-schedule-xml
//
// URL-callable version of the "Schema (XML)" SoftOne GO import in schema.tsx,
// for automation tools like Power Automate. Bypasses the browser entirely —
// auth is via a rotatable API key or JWT (same as storeflow-api / mcp-server),
// writes go through the service role key, and the interactive
// employee-mapping step is replaced with automatic matching (existing
// employee_mappings → name match in store → name match elsewhere
// ("borrowed") → optionally auto-create a new account).
//
// Call:
//   POST https://<project-ref>.supabase.co/functions/v1/import-schedule-xml
//   Headers:
//     Content-Type: application/json
//     Authorization: Bearer <API-nyckel (sf_live_...) eller JWT>
//       — nyckeln måste ha scope 'schedule:write' och åtkomst till angiven store_id
//         (skapas/roteras under Inställningar → API-nycklar)
//   Body (JSON):
//     {
//       "store_id": "uuid",                 // required
//       "imported_by_user_id": "uuid",       // required — schedule_imports.imported_by is NOT NULL.
//                                            // Use a real app_users.id (e.g. your own admin account,
//                                            // or a dedicated "Power Automate" service account).
//       "auto_create_users": true,           // optional, default true. If false, unmatched employees'
//                                            // shifts are still imported, but no account is created for them.
//       "xml": "raw file contents...",       // required — either xml (plain text) ...
//       "xml_base64": "..."                  // ... or xml_base64 (base64-encoded), not both
//     }
//
// Response: { success: true, weeks: [...], employees_matched, employees_created, shifts_imported, warnings: [...] }
//        or { error: "..." } with a 4xx/5xx status.
//
// Known simplifications vs. the in-app import:
//   - One XML file per call (the in-app "merge multiple files for the same week" pass is not replicated —
//     call this endpoint once per file; each call still imports every week contained in that one file).
//   - Unknown shift-type colors don't get a persisted per-browser color (that mechanism was
//     localStorage-based and browser-only) — they fall back to the "standard" color.
//   - No interactive review step: matching is automatic using the rules above.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { DOMParser } from "npm:linkedom@0.18.13";
import { authenticateRequest, hasScope, canAccessStore, serviceRoleClient } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Text / username utils (ported from src/lib/text-utils.ts) ────────────────

const TRANSLITERATE_MAP: Record<string, string> = {
  å: "a", ä: "a", ö: "o", Å: "A", Ä: "A", Ö: "O",
  é: "e", è: "e", ê: "e", ë: "e", É: "E", È: "E", Ê: "E", Ë: "E",
  á: "a", à: "a", â: "a", Á: "A", À: "A", Â: "A",
  í: "i", ì: "i", î: "i", ï: "i", Í: "I", Ì: "I", Î: "I", Ï: "I",
  ó: "o", ò: "o", ô: "o", õ: "o", Ó: "O", Ò: "O", Ô: "O", Õ: "O",
  ú: "u", ù: "u", û: "u", ü: "u", Ú: "U", Ù: "U", Û: "U", Ü: "U",
  ý: "y", ÿ: "y", Ý: "Y", ñ: "n", Ñ: "N", ç: "c", Ç: "C", ß: "ss",
  ø: "o", Ø: "O", æ: "ae", Æ: "AE", þ: "th", Þ: "TH", ð: "d", Ð: "D",
};
function transliterate(str: string): string {
  return str.split("").map((ch) => TRANSLITERATE_MAP[ch] ?? ch).join("");
}
function usernameFromName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const first = transliterate(parts[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const last = transliterate(parts.slice(1).join("")).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!first && !last) return "anvandare";
  if (!last) return first;
  return `${first}.${last}`;
}
const PW_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%&*-_+=?";
function generatePassword(length = 16): string {
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => PW_CHARS[n % PW_CHARS.length]).join("");
}
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}
function groupToRole(group: string): "admin" | "manager" | "employee" {
  const g = group.toLowerCase();
  if (g.includes("ledarna")) return "manager";
  if (g.includes("handels tjm") || g.includes("handels") || g.includes("tjm")) return "manager";
  return "employee";
}

// ─── Date/time utils (ported from src/lib/swedish-holidays.ts + schema.tsx) ───

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const result = new Date(y, m - 1, d + n);
  const yr = result.getFullYear();
  const mo = String(result.getMonth() + 1).padStart(2, "0");
  const dy = String(result.getDate()).padStart(2, "0");
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
function stockholmToUtc(localDateTimeStr: string): string {
  const [datePart, timePart] = localDateTimeStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  for (const offsetHours of [2, 1]) {
    const candidate = new Date(naiveUtc.getTime() - offsetHours * 3600000);
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((p) => [p.type, p.value]));
    const candidateLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    const inputNorm = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (candidateLocal === inputNorm) return candidate.toISOString();
  }
  return naiveUtc.toISOString();
}

// ─── Shift colors (simplified — no localStorage persistence server-side) ──────

const SHIFT_COLORS: Record<string, string> = {
  kassa: "#b5c9a1", "kassa reserv": "#b5c9a1", "kassa reserv 1": "#b5c9a1",
  förbutik: "#f0c87a", teamplock: "#7d6547", butikskök: "#4a7c4e",
  butik: "#b5c9a1", lager: "#9aab85", städning: "#aec6b0", standard: "#b0b0b0",
};
const IGNORE_COLORS = new Set(["#4caf50", "#4CAF50", "#ffffff", "#FFFFFF", "#000000", "#FFFFFFFF"]);
function shiftColor(name: string, xmlColor: string): string {
  if (xmlColor && !IGNORE_COLORS.has(xmlColor) && /^#[0-9a-fA-F]{6}$/.test(xmlColor)) return xmlColor;
  const key = name.toLowerCase().trim();
  for (const k of Object.keys(SHIFT_COLORS)) if (key.includes(k)) return SHIFT_COLORS[k];
  return SHIFT_COLORS["standard"];
}

// ─── XML parsing (ported verbatim in structure from src/routes/schema.tsx) ────

type BreakWindow = { start: string; minutes: number };
type XmlShift = {
  shiftName: string; description: string; startTime: string; stopTime: string; color: string;
  grossMinutes: number; netMinutes: number; breakMinutes: number; breakWindows: BreakWindow[];
  deviationCause: string; totalCost: number; isLended: boolean; shiftLink: string; isBorrowed: boolean;
};
type XmlDay = {
  dayNr: number; scheduleDate: string; isAbsenceDay: boolean; isSemester: boolean;
  isPreliminary: boolean; isZeroScheduleDay: boolean; shifts: XmlShift[];
};
type ParsedEmployee = {
  employeeNr: string; employeeName: string; employeeGroup: string; employeeCategory: string;
  employmentPercent: number | null; workTimeWeek: number | null; days: XmlDay[];
};
type ParsedSchedule = {
  weekNumber: number; year: number; weekStartDate: string; storeName: string; employees: ParsedEmployee[];
};

// deno-lint-ignore no-explicit-any
type El = any;

function getText(el: El, selector: string): string {
  return el.querySelector(selector)?.textContent?.trim() ?? "";
}
function parseTime(raw: string): string {
  const iso = raw.match(/T(\d{2}:\d{2})/);
  if (iso) return iso[1];
  const plain = raw.match(/^(\d{2}:\d{2})/);
  if (plain) return plain[1];
  return "";
}
function getAttrOrText(el: El, tag: string): string {
  return el.getAttribute(tag) || getText(el, tag);
}

function parseXmlDay(dayEl: El, absenceNameFallback: string, onMonday: (date: string) => void): XmlDay {
  const dayNr = parseInt(getAttrOrText(dayEl, "DayNr") || "0", 10);
  const scheduleDateRaw = getAttrOrText(dayEl, "ScheduleDate");
  const scheduleDate = scheduleDateRaw.length >= 10 ? scheduleDateRaw.slice(0, 10) : "";
  const absenceRaw = getAttrOrText(dayEl, "IsAbsenceDay") || "0";
  const isAbsenceDay = absenceRaw === "1" || absenceRaw.toLowerCase() === "true";
  const absenceName = getAttrOrText(dayEl, "AbsencePayrollProductName") || absenceNameFallback;
  const isPreliminaryRaw = getAttrOrText(dayEl, "IsPreliminary") || "0";
  const isPreliminary = isPreliminaryRaw === "1" || isPreliminaryRaw.toLowerCase() === "true";
  const isZeroRaw = getAttrOrText(dayEl, "IsZeroScheduleDay") || "0";
  const isZeroScheduleDay = isZeroRaw === "1" || isZeroRaw.toLowerCase() === "true";

  if (dayNr === 1 && scheduleDate) onMonday(scheduleDate);

  const dayShiftLink = getAttrOrText(dayEl, "ShiftLink") || "";
  const dayScheduleCost = parseFloat((getAttrOrText(dayEl, "ScheduleTotalCost") || "-1").replace(",", "."));
  const isDayLendedOut = !isAbsenceDay && dayShiftLink.length > 8 && dayScheduleCost === 0;

  const dayBreakWindows: BreakWindow[] = [];
  for (let bIdx = 1; bIdx <= 4; bIdx++) {
    const bStartRaw = getAttrOrText(dayEl, `ScheduleBreak${bIdx}Start`);
    const bMins = parseInt(getAttrOrText(dayEl, `ScheduleBreak${bIdx}Minutes`) || "0", 10);
    const bStart = parseTime(bStartRaw);
    if (bStart && bMins > 0) dayBreakWindows.push({ start: bStart, minutes: bMins });
  }
  const dayBreakTotal = parseInt(getAttrOrText(dayEl, "ScheduleBreakTime") || "0", 10);

  const shifts: XmlShift[] = [];
  for (let sIdx = 1; sIdx <= 15; sIdx++) {
    const prefix = `Shift${sIdx}`;
    const sName = getAttrOrText(dayEl, `${prefix}Name`);
    if (!sName) continue;
    const sStartRaw = getAttrOrText(dayEl, `${prefix}StartTime`);
    const sStopRaw = getAttrOrText(dayEl, `${prefix}StopTime`);
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
    const shiftBreakMins = sIdx === 1 ? dayBreakTotal : 0;
    const effectiveGross = grossMins > 0 ? grossMins : netMins + shiftBreakMins;
    shifts.push({
      shiftName: sName, description: sDescription,
      startTime: parseTime(sStartRaw), stopTime: parseTime(sStopRaw),
      color: xmlCol && xmlCol !== "#000000" && xmlCol !== "#FFFFFF" && xmlCol !== "#ffffff" ? xmlCol : shiftColor(sName, xmlCol),
      grossMinutes: effectiveGross, netMinutes: netMins, breakMinutes: shiftBreakMins, breakWindows: [],
      deviationCause, totalCost: dayScheduleCost, isLended: isShiftLended, shiftLink, isBorrowed: false,
    });
  }

  if (shifts.length === 0) {
    let isFirst = true;
    for (const sEl of Array.from(dayEl.children).filter((c: El) => c.nodeName === "Shifts") as El[]) {
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
        shiftName: sName, description: g("ShiftDescription") || "",
        startTime: parseTime(g("ShiftStartTime")), stopTime: parseTime(g("ShiftStopTime")),
        color: xmlCol && xmlCol !== "#000000" ? xmlCol : shiftColor(sName, xmlCol),
        grossMinutes: grossMinutes > 0 ? grossMinutes : netMinutes + (isFirst ? dayBreakTotal : 0),
        netMinutes, breakMinutes: isFirst ? dayBreakTotal : 0, breakWindows: isFirst ? dayBreakWindows : [],
        deviationCause: g("ShiftTimeDeviationCauseName") || absenceName, totalCost: dayScheduleCost,
        isLended: isShiftLended, shiftLink: dayShiftLink, isBorrowed: false,
      });
      isFirst = false;
    }
  }

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
    s.deviationCause.toLowerCase().includes("semester") || s.deviationCause.toLowerCase().includes("holiday"));
  const isSemester = isAbsenceDay && (
    absenceName.toLowerCase().includes("semester") ||
    absenceName.toLowerCase().includes("holiday") ||
    anyShiftSemester);
  return { dayNr, scheduleDate, isAbsenceDay, isSemester, isPreliminary, isZeroScheduleDay, shifts };
}

function parseXml(xmlText: string): ParsedSchedule[] | null {
  let doc: El;
  try {
    doc = new DOMParser().parseFromString(xmlText, "text/xml");
  } catch {
    return null;
  }
  const root: El = doc.documentElement;
  if (!root || root.nodeName !== "SOE_TimeEmployeeSchedule") return null;

  const storeName =
    getText(root, "ReportHeader Company") ||
    getText(root, "TimeEmployeeSchedule ReportHeader Company") ||
    getAttrOrText(root, "Company") ||
    getText(root, "Store StoreName") || "";

  const dataRoot: El = root.querySelector("TimeEmployeeSchedule") ?? root;

  const employeeEls = Array.from(dataRoot.children).filter((c: El) => c.nodeName === "Employee") as El[];
  if (employeeEls.length > 0 && employeeEls.some((e: El) => e.querySelector("Week"))) {
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

      const weekEls = Array.from(empEl.children).filter((c: El) => c.nodeName === "Week") as El[];
      for (const weekEl of weekEls) {
        const weekNrText = getAttrOrText(weekEl, "ScheduleWeekNr") || getAttrOrText(weekEl, "WeekNr") || "";
        const weekNumber = parseInt(weekNrText, 10) || 0;
        if (!weekNumber) continue;

        const yearText = getAttrOrText(weekEl, "Year") || getText(dataRoot, "ReportHeader Year") || getText(root, "ReportHeader Year") || "";
        let year = parseInt(yearText, 10) || 0;

        let weekStartDate = "";
        const onMonday = (date: string) => {
          if (!weekStartDate) weekStartDate = date;
          if (!year && date.length >= 4) year = parseInt(date.slice(0, 4), 10);
        };

        const days: XmlDay[] = (Array.from(weekEl.children).filter((c: El) => c.nodeName === "Day") as El[])
          .map((dayEl: El) => parseXmlDay(dayEl, "", onMonday));

        if (!year) year = new Date().getFullYear();

        if (!weekStartDate) {
          const diRaw = getAttrOrText(weekEl, "DateInterval") || getAttrOrText(root, "DateInterval") || getText(root, "ReportHeader DateInterval") || "";
          const diMatch = diRaw.match(/(\d{4}-\d{2}-\d{2})/);
          if (diMatch) weekStartDate = diMatch[1];
        }

        const key = `${year}-${weekNumber}`;
        if (!weekMap.has(key)) weekMap.set(key, { weekNumber, year, weekStartDate, employees: [] });
        else if (!weekMap.get(key)!.weekStartDate && weekStartDate) weekMap.get(key)!.weekStartDate = weekStartDate;
        weekMap.get(key)!.employees.push({ employeeNr, employeeName, employeeGroup, employeeCategory, employmentPercent, workTimeWeek, days });
      }
    }

    if (weekMap.size > 0) {
      return Array.from(weekMap.values())
        .filter((s) => s.weekNumber > 0)
        .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.weekNumber - b.weekNumber))
        .map((s) => ({ ...s, storeName }));
    }
  }

  const directWeekEls = Array.from(dataRoot.children).filter((c: El) => c.nodeName === "Week") as El[];
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

      const employees: ParsedEmployee[] = (Array.from(weekEl.children).filter((c: El) => c.nodeName === "Employee") as El[])
        .map((empEl: El) => {
          const days: XmlDay[] = (Array.from(empEl.querySelectorAll("Day")) as El[])
            .map((dayEl: El) => parseXmlDay(dayEl, "", (date) => {
              if (!weekStartDate) weekStartDate = date;
              if (!year && date.length >= 4) year = parseInt(date.slice(0, 4), 10);
            }));
          const epRaw = getAttrOrText(empEl, "EmploymentPercent") || "";
          const wtwRaw = getAttrOrText(empEl, "EmploymentWorkTimeWeek") || getAttrOrText(empEl, "EmployeeGroupRuleWorkTimeWeek") || "";
          return {
            employeeNr: getAttrOrText(empEl, "EmployeeNr"), employeeName: getAttrOrText(empEl, "EmployeeName"),
            employeeGroup: getAttrOrText(empEl, "EmployeeGroup"), employeeCategory: getAttrOrText(empEl, "EmployeeCategory") || "",
            employmentPercent: epRaw ? parseFloat(epRaw.replace(",", ".")) || null : null,
            workTimeWeek: wtwRaw ? parseFloat(wtwRaw.replace(",", ".")) || null : null, days,
          };
        });
      results.push({ weekNumber, year, weekStartDate, storeName, employees });
    }
    if (results.length > 0) return results;
  }

  const rootEmpEls = Array.from(dataRoot.children).filter((c: El) => c.nodeName === "Employee") as El[];
  if (rootEmpEls.length > 0) {
    const weekNrText = getAttrOrText(dataRoot, "ScheduleWeekNr") || getAttrOrText(dataRoot, "WeekNr") || getText(root, "ReportHeader WeekNr") || "";
    const weekNumber = parseInt(weekNrText, 10) || 0;
    let year = parseInt(getAttrOrText(dataRoot, "Year") || getText(root, "ReportHeader Year") || "0", 10) || new Date().getFullYear();
    let weekStartDate = (() => {
      const r = getAttrOrText(dataRoot, "DateInterval") || getText(root, "ReportHeader DateInterval") || "";
      const m = r.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : "";
    })();

    const employees: ParsedEmployee[] = rootEmpEls.map((empEl: El) => {
      const days: XmlDay[] = (Array.from(empEl.querySelectorAll("Day")) as El[])
        .map((dayEl: El) => parseXmlDay(dayEl, "", (date) => {
          if (!weekStartDate) weekStartDate = date;
          if (!year && date.length >= 4) year = parseInt(date.slice(0, 4), 10);
        }));
      const epRaw = getAttrOrText(empEl, "EmploymentPercent") || "";
      const wtwRaw = getAttrOrText(empEl, "EmploymentWorkTimeWeek") || getAttrOrText(empEl, "EmployeeGroupRuleWorkTimeWeek") || "";
      return {
        employeeNr: getAttrOrText(empEl, "EmployeeNr"), employeeName: getAttrOrText(empEl, "EmployeeName"),
        employeeGroup: getAttrOrText(empEl, "EmployeeGroup"), employeeCategory: getAttrOrText(empEl, "EmployeeCategory") || "",
        employmentPercent: epRaw ? parseFloat(epRaw.replace(",", ".")) || null : null,
        workTimeWeek: wtwRaw ? parseFloat(wtwRaw.replace(",", ".")) || null : null, days,
      };
    });
    return [{ weekNumber, year, weekStartDate, storeName, employees }];
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

  const ctx = await authenticateRequest(req);
  if (!ctx) return json({ error: "Ogiltig eller saknad Authorization: Bearer <API-nyckel eller JWT>." }, 401);
  if (!hasScope(ctx, "schedule:write")) return json({ error: "Nyckeln saknar scope 'schedule:write'." }, 403);

  let body: {
    store_id?: string; imported_by_user_id?: string; auto_create_users?: boolean;
    xml?: string; xml_base64?: string;
  };
  try {
    body = await req.json();
  } catch {
    // ── Provide a specific, actionable error instead of a generic message ──
    let rawBody = "";
    try { rawBody = await req.text(); } catch { /* body already consumed or unreadable */ }
    const contentType = req.headers.get("content-type") ?? "";
    const trimmed = rawBody.trim();

    if (!trimmed) {
      return json({
        error: "Request-body är tomt. Skicka JSON med minst { \"store_id\", \"imported_by_user_id\", \"xml\" } (Content-Type: application/json).",
      }, 400);
    }
    if (trimmed.startsWith("<?xml") || trimmed.startsWith("<SOE_") || trimmed.startsWith("<Time")) {
      return json({
        error: "Det ser ut som att du skickade rå XML direkt i request-body. XML-innehållet måste skickas inuti ett JSON-objekt, t.ex.: { \"store_id\": \"...\", \"imported_by_user_id\": \"...\", \"xml\": \"<xml-innehåll>\" } eller base64-kodat i fältet \"xml_base64\". Sätt Content-Type: application/json.",
      }, 400);
    }
    if (!contentType.includes("application/json")) {
      return json({
        error: `Felaktig Content-Type: \"${contentType}\". Denna endpoint kräver Content-Type: application/json med ett JSON-objekt i body som innehåller fälten store_id, imported_by_user_id och xml/xml_base64.`,
      }, 400);
    }
    return json({
      error: `Kunde inte tolka request-body som JSON. Kontrollera att JSON-syntaxen är korrekt (t.ex. inga avslutande kommatecken, korrekt escaping av citattecken i XML-strängar). Rå body (första 200 tecken): ${trimmed.slice(0, 200)}`,
    }, 400);
  }

  const { store_id, imported_by_user_id } = body;
  const autoCreateUsers = body.auto_create_users ?? true;
  if (!store_id) return json({ error: "store_id saknas." }, 400);
  if (!imported_by_user_id) return json({ error: "imported_by_user_id saknas (måste vara ett giltigt app_users.id — t.ex. ditt eget admin-konto eller ett dedikerat automationskonto)." }, 400);
  if (!body.xml && !body.xml_base64) return json({ error: "xml eller xml_base64 måste anges." }, 400);

  if (!canAccessStore(ctx, store_id)) return json({ error: "Nyckeln har inte åtkomst till denna butik." }, 403);

  let xmlText: string;
  if (body.xml_base64) {
    xmlText = decodeBase64Content(body.xml_base64);
  } else if (body.xml) {
    const trimmed = body.xml.trim();
    if (trimmed.startsWith("data:") || (!trimmed.includes("<") && trimmed.length > 20)) {
      xmlText = decodeBase64Content(trimmed);
    } else {
      xmlText = trimmed.replace(/^\uFEFF/, "");
    }
  } else {
    return json({ error: "xml eller xml_base64 måste anges." }, 400);
  }

  const supabase = serviceRoleClient();

  const { data: store } = await supabase.from("stores").select("id, forening_id, distrikt_id").eq("id", store_id).maybeSingle();
  if (!store) return json({ error: `Ingen butik hittades med store_id ${store_id}.` }, 404);

  const { data: importedByUser } = await supabase.from("app_users").select("id").eq("id", imported_by_user_id).maybeSingle();
  if (!importedByUser) return json({ error: `Ingen användare hittades med imported_by_user_id ${imported_by_user_id}.` }, 404);

  const parsed = parseXml(xmlText);
  if (!parsed || parsed.length === 0) {
    return json({ error: "Kunde inte tolka XML-filen. Kontrollera att det är en SoftOne GO-schemaexport." }, 422);
  }

  const warnings: string[] = [];

  // ── Resolve employee → app_user mapping (mirrors confirmImport, non-interactively) ──
  const { data: mappingRows } = await supabase.from("employee_mappings").select("employee_nr, app_user_id").eq("store_id", store_id);
  const mappings = new Map<string, string | null>((mappingRows ?? []).map((m: { employee_nr: string; app_user_id: string | null }) => [m.employee_nr, m.app_user_id]));

  const { data: storeUserLinks } = await supabase.from("user_stores").select("user_id").eq("store_id", store_id);
  const storeUserIds = new Set((storeUserLinks ?? []).map((r: { user_id: string }) => r.user_id));

  const { data: allUsers } = await supabase.from("app_users").select("id, display_name, role_manually_set");
  const allUsersList = (allUsers ?? []) as { id: string; display_name: string; role_manually_set: boolean }[];

  async function linkUserToStoreHierarchy(userId: string) {
    if (store.forening_id) {
      await supabase.from("user_foreningar").upsert({ user_id: userId, forening_id: store.forening_id, is_primary: false }, { onConflict: "user_id,forening_id" });
      const { data: existing } = await supabase.from("app_users").select("forening_id").eq("id", userId).maybeSingle();
      if (!existing?.forening_id) await supabase.from("app_users").update({ forening_id: store.forening_id }).eq("id", userId);
    }
    if (store.distrikt_id) {
      await supabase.from("user_distrikt").upsert({ user_id: userId, distrikt_id: store.distrikt_id, is_primary: false }, { onConflict: "user_id,distrikt_id" });
      const { data: existing } = await supabase.from("app_users").select("distrikt_id").eq("id", userId).maybeSingle();
      if (!existing?.distrikt_id) await supabase.from("app_users").update({ distrikt_id: store.distrikt_id }).eq("id", userId);
    }
  }

  const allEmpMap = new Map<string, ParsedEmployee>();
  for (const s of parsed) for (const emp of s.employees) if (!allEmpMap.has(emp.employeeNr)) allEmpMap.set(emp.employeeNr, emp);
  const allEmployees = Array.from(allEmpMap.values());

  const usedUserIds = new Set<string>();
  const finalMappings = new Map<string, string | null>();
  let employeesMatched = 0;
  let employeesCreated = 0;

  for (const emp of allEmployees) {
    const savedMapping = mappings.get(emp.employeeNr);
    if (savedMapping) {
      usedUserIds.add(savedMapping);
      finalMappings.set(emp.employeeNr, savedMapping);
      employeesMatched++;
      // Keep the account's store membership / role in sync, same as the in-app import
      await supabase.from("user_stores").upsert({ user_id: savedMapping, store_id, is_primary: false }, { onConflict: "user_id,store_id" });
      await linkUserToStoreHierarchy(savedMapping);
      const existingUser = allUsersList.find((u) => u.id === savedMapping);
      if (emp.employeeGroup && !existingUser?.role_manually_set) {
        await supabase.from("app_users").update({ role: groupToRole(emp.employeeGroup), employee_group: emp.employeeGroup }).eq("id", savedMapping);
      } else if (emp.employeeGroup) {
        await supabase.from("app_users").update({ employee_group: emp.employeeGroup }).eq("id", savedMapping);
      }
      continue;
    }

    const normEmp = normalizeName(emp.employeeName);
    const byStoreAndName = allUsersList.find((u) => storeUserIds.has(u.id) && !usedUserIds.has(u.id) && normalizeName(u.display_name) === normEmp);
    if (byStoreAndName) {
      usedUserIds.add(byStoreAndName.id);
      finalMappings.set(emp.employeeNr, byStoreAndName.id);
      employeesMatched++;
      continue;
    }
    const globalNameMatch = allUsersList.find((u) => !usedUserIds.has(u.id) && normalizeName(u.display_name) === normEmp && !storeUserIds.has(u.id));
    if (globalNameMatch) {
      usedUserIds.add(globalNameMatch.id);
      finalMappings.set(emp.employeeNr, globalNameMatch.id);
      employeesMatched++;
      warnings.push(`${emp.employeeName} identifierad som lånad personal från annan butik.`);
      continue;
    }

    if (!autoCreateUsers) {
      finalMappings.set(emp.employeeNr, null);
      warnings.push(`${emp.employeeName} (${emp.employeeNr}) kunde inte matchas mot ett konto och auto_create_users=false — inget konto skapades. Passet importerades ändå.`);
      continue;
    }

    const username = usernameFromName(emp.employeeName);
    let finalUsername = username;
    const { data: existing } = await supabase.from("app_users").select("id").eq("username", finalUsername).maybeSingle();
    if (existing) finalUsername = `${username}_${emp.employeeNr.slice(-4)}`;
    const password = generatePassword(16);
    const { data: hash } = await supabase.rpc("hash_password", { plain_password: password });
    const role = groupToRole(emp.employeeGroup);
    const { data: created, error: createErr } = await supabase.from("app_users").insert({
      username: finalUsername, password_hash: hash, display_name: emp.employeeName,
      role, employee_group: emp.employeeGroup, store_id, is_active: true, must_change_password: true,
    }).select("id").maybeSingle();
    if (createErr || !created) {
      warnings.push(`Kunde inte skapa konto för ${emp.employeeName}: ${createErr?.message ?? "okänt fel"}. Passet importerades ändå.`);
      finalMappings.set(emp.employeeNr, null);
      continue;
    }
    await supabase.from("user_stores").insert({ user_id: created.id, store_id, is_primary: true });
    await linkUserToStoreHierarchy(created.id);
    finalMappings.set(emp.employeeNr, created.id);
    usedUserIds.add(created.id);
    employeesCreated++;
  }

  for (const [employeeNr, appUserId] of finalMappings) {
    await supabase.from("employee_mappings").upsert(
      { store_id, employee_nr: employeeNr, app_user_id: appUserId, created_by: imported_by_user_id, updated_at: new Date().toISOString() },
      { onConflict: "store_id,employee_nr" }
    );
  }

  // ── Import each week's shifts (mirrors confirmImport's shift-insertion loop) ──
  const weeksImported: { week_number: number; year: number; shifts: number }[] = [];
  let totalShifts = 0;

  for (const weekSchedule of parsed) {
    const { data: oldImports } = await supabase.from("schedule_imports").select("id")
      .eq("store_id", store_id).eq("week_number", weekSchedule.weekNumber).eq("year", weekSchedule.year);
    if (oldImports && oldImports.length > 0) {
      const oldIds = oldImports.map((r: { id: string }) => r.id);
      await supabase.from("schedule_shifts").delete().in("import_id", oldIds);
      await supabase.from("schedule_employees").delete().in("import_id", oldIds);
      await supabase.from("schedule_imports").delete().in("id", oldIds);
    }

    const resolvedWeekStart = weekSchedule.weekStartDate || getWeekStartDate(weekSchedule.weekNumber, weekSchedule.year);
    const { data: importData, error: importErr } = await supabase.from("schedule_imports").insert({
      store_id, week_start_date: resolvedWeekStart, week_number: weekSchedule.weekNumber, year: weekSchedule.year,
      imported_by: imported_by_user_id, filename: `power-automate_vecka_${weekSchedule.weekNumber}_${weekSchedule.year}.xml`,
      raw_employee_count: weekSchedule.employees.length,
    }).select().single();
    if (importErr || !importData) return json({ error: `schedule_imports vecka ${weekSchedule.weekNumber}: ${importErr?.message ?? "import misslyckades"}` }, 500);
    const importId = importData.id as string;

    let weekShiftCount = 0;
    for (const emp of weekSchedule.employees) {
      const { data: empData } = await supabase.from("schedule_employees").insert({
        import_id: importId, employee_nr: emp.employeeNr, employee_name: emp.employeeName,
        employee_group: emp.employeeGroup, employee_category: emp.employeeCategory || "",
        employment_percent: emp.employmentPercent ?? null, work_time_week: emp.workTimeWeek ?? null,
      }).select().single();
      if (!empData) continue;
      const empId = empData.id as string;
      const isEmpBorrowed = warnings.some((w) => w.startsWith(emp.employeeName) && w.includes("lånad personal"));

      const rows = emp.days.flatMap((day) => {
        const effectiveDayDate = day.scheduleDate || (day.dayNr >= 1 ? addDays(resolvedWeekStart, day.dayNr - 1) : "");
        const isAbsence = day.isAbsenceDay || day.isSemester;
        if (day.shifts.length > 0) {
          return day.shifts.map((s) => {
            let startUtc: string | null = null;
            let stopUtc: string | null = null;
            if (s.startTime && effectiveDayDate) startUtc = stockholmToUtc(`${effectiveDayDate}T${s.startTime}`);
            if (s.stopTime && effectiveDayDate) {
              const stopDay = s.stopTime < s.startTime ? addDays(effectiveDayDate, 1) : effectiveDayDate;
              stopUtc = stockholmToUtc(`${stopDay}T${s.stopTime}`);
            }
            return {
              schedule_employee_id: empId, import_id: importId, day_date: effectiveDayDate,
              start_time: s.startTime || null, stop_time: s.stopTime || null,
              start_time_utc: startUtc, stop_time_utc: stopUtc,
              shift_name: s.shiftName, shift_description: s.description || "",
              color: isAbsence ? (day.isSemester ? "#fca5a5" : "#e0e0e0") : s.color,
              gross_minutes: isAbsence ? 0 : s.grossMinutes, net_minutes: isAbsence ? 0 : s.netMinutes,
              break_minutes: isAbsence ? 0 : s.breakMinutes, break_windows: isAbsence ? [] : s.breakWindows,
              deviation_cause: s.deviationCause || (day.isSemester ? "Semester" : ""),
              is_absence_day: isAbsence, is_lended: s.isLended,
              is_borrowed: isEmpBorrowed || s.isBorrowed, shift_link: s.shiftLink,
              is_shadow_shift: isAbsence && !!(s.startTime || s.shiftName),
              is_preliminary: day.isPreliminary, is_zero_schedule_day: day.isZeroScheduleDay,
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
      if (rows.length > 0) {
        const { error: shiftsErr } = await supabase.from("schedule_shifts").insert(rows);
        if (shiftsErr) warnings.push(`Kunde inte spara pass för ${emp.employeeName} (${emp.employeeNr}): ${shiftsErr.message}`);
        else weekShiftCount += rows.length;
      }
    }
    weeksImported.push({ week_number: weekSchedule.weekNumber, year: weekSchedule.year, shifts: weekShiftCount });
    totalShifts += weekShiftCount;
  }

  // Auto-create/update "Alla medarbetare" and "Ledning" groups, same as the in-app import
  async function upsertGroup(name: string, memberIds: string[]) {
    if (memberIds.length === 0) return;
    let { data: grp } = await supabase.from("user_groups").select("id").eq("store_id", store_id).eq("name", name).maybeSingle();
    if (!grp) {
      const { data: createdGrp } = await supabase.from("user_groups").insert({ name, store_id }).select("id").maybeSingle();
      grp = createdGrp;
    }
    if (!grp?.id) return;
    await supabase.from("user_group_members").upsert(memberIds.map((uid) => ({ group_id: grp!.id, user_id: uid })), { onConflict: "group_id,user_id" });
  }
  const { data: allUsersFull } = await supabase.from("app_users").select("id, role, hierarchy_level").in("id", Array.from(finalMappings.values()).filter((v): v is string => !!v));
  const managerIds = new Set((allUsersFull ?? []).filter((u: { role: string; hierarchy_level?: string | null }) => u.role === "manager" || u.hierarchy_level === "chef").map((u: { id: string }) => u.id));
  const allUserIds = Array.from(finalMappings.values()).filter((v): v is string => !!v);
  await upsertGroup("Alla medarbetare", allUserIds);
  const managersInSchedule = allUserIds.filter((id) => managerIds.has(id));
  if (managersInSchedule.length > 0) await upsertGroup("Ledning", managersInSchedule);

  return json({
    success: true,
    weeks: weeksImported,
    employees_matched: employeesMatched,
    employees_created: employeesCreated,
    shifts_imported: totalShifts,
    warnings,
  });
});
