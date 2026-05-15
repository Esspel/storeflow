import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Upload, Users, Clock, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, X } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// ─── Types ─────────────────────────────────────────────────────────────────

type XmlEmployee = {
  employeeNr: string;
  employeeName: string;
  employeeGroup: string;
};

type XmlShift = {
  shiftName: string;
  startTime: string; // "HH:MM"
  stopTime: string;  // "HH:MM"
  color: string;
  grossMinutes: number;
  netMinutes: number;
  deviationCause: string;
};

type XmlDay = {
  dayNr: number;
  scheduleDate: string; // ISO date string "YYYY-MM-DD"
  isAbsenceDay: boolean;
  shifts: XmlShift[];
};

type ParsedEmployee = XmlEmployee & { days: XmlDay[] };

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

// ─── XML parsing ────────────────────────────────────────────────────────────

function parseTime(raw: string): string {
  // Format: "1900-01-01T07:00:00+01:00" → "07:00"
  const match = raw.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function parseDateFromScheduleDate(raw: string): string {
  // "2026-05-11T00:00:00+02:00" → "2026-05-11"
  return raw.slice(0, 10);
}

function parseXml(xmlText: string): ParsedSchedule | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const root = doc.documentElement;
  if (!root || root.nodeName !== "SOE_TimeEmployeeSchedule") return null;

  const storeName =
    root.querySelector("Store > StoreName")?.textContent?.trim() ?? "";
  const weekEl = root.querySelector("Week");
  const weekNumber = parseInt(weekEl?.getAttribute("WeekNr") ?? "0", 10);
  const yearAttr = weekEl?.getAttribute("Year");
  const year = yearAttr ? parseInt(yearAttr, 10) : new Date().getFullYear();

  const employeeEls = Array.from(root.querySelectorAll("Employee"));

  let weekStartDate = "";

  const employees: ParsedEmployee[] = employeeEls.map((empEl) => {
    const employeeNr = empEl.getAttribute("EmployeeNr") ?? "";
    const employeeName = empEl.getAttribute("EmployeeName") ?? "";
    const employeeGroup = empEl.getAttribute("EmployeeGroup") ?? "";

    const dayEls = Array.from(empEl.querySelectorAll("Day"));
    const days: XmlDay[] = dayEls.map((dayEl) => {
      const dayNr = parseInt(dayEl.getAttribute("DayNr") ?? "0", 10);
      const scheduleDateRaw = dayEl.getAttribute("ScheduleDate") ?? "";
      const scheduleDate = parseDateFromScheduleDate(scheduleDateRaw);
      const isAbsenceDay = dayEl.getAttribute("IsAbsenceDay") === "true";

      // Use Monday (DayNr=1) as week start
      if (dayNr === 1 && scheduleDate && !weekStartDate) {
        weekStartDate = scheduleDate;
      }

      const shiftEls = Array.from(dayEl.querySelectorAll("Shifts"));
      const shifts: XmlShift[] = shiftEls.map((sEl) => ({
        shiftName: sEl.querySelector("ShiftName")?.textContent?.trim() ?? "",
        startTime: parseTime(sEl.querySelector("ShiftStartTime")?.textContent?.trim() ?? ""),
        stopTime: parseTime(sEl.querySelector("ShiftStopTime")?.textContent?.trim() ?? ""),
        color: `#${sEl.querySelector("Color")?.textContent?.trim() ?? "4CAF50"}`,
        grossMinutes: parseInt(sEl.querySelector("ShiftGrossTimeMinutes")?.textContent?.trim() ?? "0", 10),
        netMinutes: parseInt(sEl.querySelector("ShiftNetTimeMinutes")?.textContent?.trim() ?? "0", 10),
        deviationCause: sEl.querySelector("ShiftTimeDeviationCauseName")?.textContent?.trim() ?? "",
      }));

      return { dayNr, scheduleDate, isAbsenceDay, shifts };
    });

    return { employeeNr, employeeName, employeeGroup, days };
  });

  return { weekNumber, year, weekStartDate, storeName, employees };
}

// ─── Time utils ─────────────────────────────────────────────────────────────

const TIMELINE_START = 6;  // 06:00
const TIMELINE_END = 23;   // 23:00
const TOTAL_HOURS = TIMELINE_END - TIMELINE_START;

function timeToPercent(time: string): number {
  const [h, m] = time.split(":").map(Number);
  const totalMins = (h - TIMELINE_START) * 60 + m;
  return (totalMins / (TOTAL_HOURS * 60)) * 100;
}

function shiftWidthPercent(start: string, stop: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = stop.split(":").map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60; // overnight
  const dur = endMins - startMins;
  return (dur / (TOTAL_HOURS * 60)) * 100;
}

// ─── Day navigation helpers ──────────────────────────────────────────────────

const DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
const DAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

// ─── Color utils ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

// ─── Component ───────────────────────────────────────────────────────────────

function SchemaPage() {
  const { user, activeStore } = useAuth();

  const [imports, setImports] = useState<ImportRow[]>([]);
  const [activeImport, setActiveImport] = useState<ImportRow | null>(null);
  const [scheduleEmployees, setScheduleEmployees] = useState<ScheduleEmployee[]>([]);
  const [scheduleShifts, setScheduleShifts] = useState<ScheduleShift[]>([]);
  const [mappings, setMappings] = useState<EmployeeMapping[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0); // 0=Mon … 6=Sun

  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedSchedule | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [savingImport, setSavingImport] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const storeId = activeStore?.id ?? user?.store_id ?? null;

  // Load imports and app users on mount
  useEffect(() => {
    if (!storeId) return;
    loadImports();
    loadAppUsers();
    loadMappings();
  }, [storeId]);

  // When activeImport changes, load its employees + shifts
  useEffect(() => {
    if (!activeImport) return;
    loadScheduleData(activeImport.id);
  }, [activeImport]);

  async function loadImports() {
    if (!storeId) return;
    const { data } = await supabase
      .from("schedule_imports")
      .select("*")
      .eq("store_id", storeId)
      .order("week_start_date", { ascending: false });
    const rows = (data ?? []) as ImportRow[];
    setImports(rows);
    if (rows.length > 0 && !activeImport) setActiveImport(rows[0]);
  }

  async function loadAppUsers() {
    if (!storeId) return;
    const { data } = await supabase
      .from("app_users")
      .select("id, username, display_name, role, store_id, active_store_id, is_active, last_login, created_at")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("display_name");
    setAppUsers((data ?? []) as AppUser[]);
  }

  async function loadMappings() {
    if (!storeId) return;
    const { data } = await supabase
      .from("employee_mappings")
      .select("employee_nr, app_user_id")
      .eq("store_id", storeId);
    setMappings((data ?? []) as EmployeeMapping[]);
  }

  async function loadScheduleData(importId: string) {
    const [empRes, shiftRes] = await Promise.all([
      supabase
        .from("schedule_employees")
        .select("*")
        .eq("import_id", importId)
        .order("employee_name"),
      supabase
        .from("schedule_shifts")
        .select("*")
        .eq("import_id", importId),
    ]);
    setScheduleEmployees((empRes.data ?? []) as ScheduleEmployee[]);
    setScheduleShifts((shiftRes.data ?? []) as ScheduleShift[]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseXml(text);
      setParsing(false);
      if (!result) {
        toast.error("Kunde inte läsa XML-filen. Kontrollera att det är en SoftOne GO-export.");
        return;
      }
      setParsed({ ...result, storeName: result.storeName || activeStore?.name || "" });
      // Pre-populate mappings from existing saved mappings
      setMappingOpen(true);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function getMappedUserId(employeeNr: string): string | null {
    return mappings.find((m) => m.employee_nr === employeeNr)?.app_user_id ?? null;
  }

  function setMapping(employeeNr: string, appUserId: string | null) {
    setMappings((prev) => {
      const existing = prev.find((m) => m.employee_nr === employeeNr);
      if (existing) {
        return prev.map((m) =>
          m.employee_nr === employeeNr ? { ...m, app_user_id: appUserId } : m
        );
      }
      return [...prev, { employee_nr: employeeNr, app_user_id: appUserId }];
    });
  }

  async function saveMappings() {
    if (!storeId || !user) return;
    for (const m of mappings) {
      await supabase
        .from("employee_mappings")
        .upsert(
          {
            store_id: storeId,
            employee_nr: m.employee_nr,
            app_user_id: m.app_user_id || null,
            created_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store_id,employee_nr" }
        );
    }
  }

  async function confirmImport() {
    if (!parsed || !storeId || !user) return;
    setSavingImport(true);

    try {
      // Save mappings first
      await saveMappings();

      // Insert schedule_import record
      const { data: importData, error: importErr } = await supabase
        .from("schedule_imports")
        .insert({
          store_id: storeId,
          week_start_date: parsed.weekStartDate,
          week_number: parsed.weekNumber,
          year: parsed.year,
          imported_by: user.id,
          filename: fileRef.current?.value || `vecka_${parsed.weekNumber}.xml`,
          raw_employee_count: parsed.employees.length,
        })
        .select()
        .single();

      if (importErr || !importData) throw new Error(importErr?.message ?? "Import failed");

      const importId = (importData as ImportRow).id;

      // Insert employees and shifts
      for (const emp of parsed.employees) {
        const { data: empData, error: empErr } = await supabase
          .from("schedule_employees")
          .insert({
            import_id: importId,
            employee_nr: emp.employeeNr,
            employee_name: emp.employeeName,
            employee_group: emp.employeeGroup,
          })
          .select()
          .single();

        if (empErr || !empData) continue;
        const empId = (empData as ScheduleEmployee).id;

        const shiftRows = emp.days.flatMap((day) =>
          day.shifts.length > 0
            ? day.shifts.map((s) => ({
                schedule_employee_id: empId,
                import_id: importId,
                day_date: day.scheduleDate,
                start_time: s.startTime || null,
                stop_time: s.stopTime || null,
                shift_name: s.shiftName,
                color: s.color,
                gross_minutes: s.grossMinutes,
                net_minutes: s.netMinutes,
                deviation_cause: s.deviationCause,
                is_absence_day: day.isAbsenceDay,
              }))
            : day.isAbsenceDay
            ? [
                {
                  schedule_employee_id: empId,
                  import_id: importId,
                  day_date: day.scheduleDate,
                  start_time: null,
                  stop_time: null,
                  shift_name: "",
                  color: "#e0e0e0",
                  gross_minutes: 0,
                  net_minutes: 0,
                  deviation_cause: "",
                  is_absence_day: true,
                },
              ]
            : []
        );

        if (shiftRows.length > 0) {
          await supabase.from("schedule_shifts").insert(shiftRows);
        }
      }

      toast.success(`Schema för vecka ${parsed.weekNumber} importerat!`);
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

  // ─── Compute current day's data ─────────────────────────────────────────

  const weekDates = activeImport
    ? Array.from({ length: 7 }, (_, i) => addDays(activeImport.week_start_date, i))
    : [];
  const currentDate = weekDates[selectedDayIndex] ?? null;

  const shiftsForDay = currentDate
    ? scheduleShifts.filter((s) => s.day_date === currentDate)
    : [];

  const employeeShifts = scheduleEmployees.map((emp) => {
    const empShifts = shiftsForDay.filter((s) => s.schedule_employee_id === emp.id);
    const mapping = mappings.find((m) => m.employee_nr === emp.employee_nr);
    const appUser = mapping?.app_user_id
      ? appUsers.find((u) => u.id === mapping.app_user_id)
      : null;
    return { emp, shifts: empShifts, appUser };
  }).filter((row) => row.shifts.length > 0 || scheduleShifts.some((s) => s.schedule_employee_id === row.emp.id));

  // Only show employees that have at least one shift this week
  const activeEmployeeRows = employeeShifts.filter((row) =>
    scheduleShifts.some((s) => s.schedule_employee_id === row.emp.id)
  );

  // Timeline hour markers
  const hourMarkers = Array.from(
    { length: TOTAL_HOURS + 1 },
    (_, i) => TIMELINE_START + i
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Schema"
        subtitle={
          activeImport
            ? `Vecka ${activeImport.week_number}, ${activeImport.year} · ${activeImport.raw_employee_count} medarbetare`
            : "Importera schema från SoftOne GO"
        }
        actions={
          <div className="flex items-center gap-2">
            {imports.length > 1 && (
              <Select
                value={activeImport?.id ?? ""}
                onValueChange={(v) => {
                  const imp = imports.find((i) => i.id === v);
                  if (imp) setActiveImport(imp);
                }}
              >
                <SelectTrigger className="h-9 w-44 text-sm">
                  <SelectValue placeholder="Välj vecka" />
                </SelectTrigger>
                <SelectContent>
                  {imports.map((imp) => (
                    <SelectItem key={imp.id} value={imp.id}>
                      Vecka {imp.week_number}, {imp.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMappingOpen(true)}
              disabled={!parsed && imports.length === 0}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              Personalmatching
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Importera XML
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        }
      />

      {/* Empty state */}
      {imports.length === 0 && !parsing && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-20">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-soft">
            <Calendar className="h-10 w-10 text-primary" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground">Inget schema importerat</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Exportera ett schema från SoftOne GO som XML och importera det här för att se
              skiftöversikten för ditt team.
            </p>
          </div>
          <Button
            className="gap-2"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Välj XML-fil
          </Button>
        </div>
      )}

      {/* Timeline view */}
      {activeImport && weekDates.length > 0 && (
        <div className="flex flex-1 flex-col overflow-hidden px-4 pb-4">
          {/* Day picker */}
          <div className="mb-4 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSelectedDayIndex((i) => Math.max(0, i - 1))}
              disabled={selectedDayIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-1 gap-1 overflow-x-auto">
              {weekDates.map((date, idx) => {
                const isToday = date === new Date().toISOString().slice(0, 10);
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDayIndex(idx)}
                    className={[
                      "flex min-w-[72px] flex-col items-center rounded-xl px-3 py-2 text-center transition-colors",
                      selectedDayIndex === idx
                        ? "bg-primary text-primary-foreground shadow-[var(--shadow-md)]"
                        : "bg-card text-foreground hover:bg-muted border border-border/60",
                    ].join(" ")}
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wide">
                      {DAY_SHORT[idx]}
                    </span>
                    <span className="text-sm font-semibold">{formatDate(date).split(" ")[0]}</span>
                    {isToday && (
                      <span className="mt-0.5 h-1 w-1 rounded-full bg-current opacity-70" />
                    )}
                  </button>
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSelectedDayIndex((i) => Math.min(6, i + 1))}
              disabled={selectedDayIndex === 6}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day heading */}
          <div className="mb-3">
            <h2 className="text-base font-semibold text-foreground">
              {DAY_NAMES[selectedDayIndex]}{" "}
              <span className="font-normal text-muted-foreground">{formatDate(weekDates[selectedDayIndex])}</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {activeEmployeeRows.filter((r) => r.shifts.some((s) => s.day_date === currentDate)).length} medarbetare arbetar idag
            </p>
          </div>

          {/* Timeline grid */}
          <div className="flex-1 overflow-auto rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
            {/* Hour header */}
            <div className="sticky top-0 z-10 flex bg-card border-b border-border/60">
              <div className="w-40 shrink-0 border-r border-border/40 px-3 py-2">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Medarbetare
                </span>
              </div>
              <div className="relative flex-1" style={{ minWidth: `${TOTAL_HOURS * 56}px` }}>
                <div className="flex">
                  {hourMarkers.map((h) => (
                    <div
                      key={h}
                      className="flex-1 border-r border-border/30 px-1 py-2 last:border-r-0"
                    >
                      <span className="text-[11px] font-mono text-muted-foreground/70">
                        {String(h).padStart(2, "0")}:00
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Employee rows */}
            {activeEmployeeRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Clock className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Inga pass schemalagda denna dag</p>
              </div>
            ) : (
              activeEmployeeRows.map(({ emp, shifts: dayShifts, appUser }) => {
                const todayShifts = dayShifts.filter((s) => s.day_date === currentDate);
                const isOffToday = todayShifts.length === 0 || todayShifts.every((s) => s.is_absence_day);
                const absenceCause = todayShifts.find((s) => s.is_absence_day)?.deviation_cause;

                return (
                  <div
                    key={emp.id}
                    className="flex border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    {/* Employee name cell */}
                    <div className="flex w-40 shrink-0 items-center gap-2 border-r border-border/40 px-3 py-3">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{
                          background: appUser
                            ? "oklch(0.5 0.16 148)"
                            : "oklch(0.88 0.02 145)",
                          color: appUser ? "white" : "oklch(0.4 0.05 145)",
                        }}
                      >
                        {(appUser?.display_name ?? emp.employeeName)
                          .split(" ")
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground leading-tight">
                          {appUser?.display_name ?? emp.employeeName}
                        </p>
                        {!appUser && (
                          <p className="truncate text-[10px] text-muted-foreground/60">
                            {emp.employeeName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Shift timeline */}
                    <div
                      className="relative flex-1 py-2"
                      style={{ minWidth: `${TOTAL_HOURS * 56}px` }}
                    >
                      {/* Hour grid lines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {hourMarkers.map((h) => (
                          <div
                            key={h}
                            className="flex-1 border-r border-border/20 last:border-r-0"
                          />
                        ))}
                      </div>

                      {isOffToday ? (
                        <div className="flex h-full items-center px-2">
                          <span className="text-[11px] text-muted-foreground/50">
                            {absenceCause || "Ledig"}
                          </span>
                        </div>
                      ) : (
                        todayShifts
                          .filter((s) => s.start_time && s.stop_time)
                          .map((shift) => {
                            const left = timeToPercent(shift.start_time!);
                            const width = shiftWidthPercent(shift.start_time!, shift.stop_time!);
                            const textColor = isLightColor(shift.color) ? "#1a1a1a" : "#ffffff";
                            const bgColor = shift.color;

                            return (
                              <div
                                key={shift.id}
                                className="absolute top-1.5 bottom-1.5 flex items-center overflow-hidden rounded-md px-2 text-[11px] font-medium shadow-sm select-none cursor-default"
                                style={{
                                  left: `${Math.max(0, left)}%`,
                                  width: `${Math.max(width, 1.5)}%`,
                                  backgroundColor: bgColor,
                                  color: textColor,
                                  minWidth: "40px",
                                }}
                                title={`${shift.shift_name || emp.employeeName}: ${shift.start_time} – ${shift.stop_time}${shift.deviation_cause ? ` (${shift.deviation_cause})` : ""}`}
                              >
                                <span className="truncate">
                                  {shift.start_time}–{shift.stop_time}
                                  {shift.deviation_cause && (
                                    <span className="ml-1 opacity-70">· {shift.deviation_cause}</span>
                                  )}
                                </span>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Import + mapping dialog */}
      <Dialog open={mappingOpen} onOpenChange={(o) => { if (!savingImport) { setMappingOpen(o); if (!o && !parsed) {} } }}>
        <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-hidden p-0 gap-0">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-foreground">
                {parsed ? "Importera schema & matcha personal" : "Personalmatching"}
              </h2>
              {parsed && (
                <p className="text-xs text-muted-foreground">
                  Vecka {parsed.weekNumber}, {parsed.year} · {parsed.employees.length} anställda i filen
                </p>
              )}
            </div>
            <button
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              onClick={() => { if (!savingImport) { setMappingOpen(false); } }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
            {!parsed && imports.length > 0 && (
              <div className="p-5">
                <p className="mb-4 text-sm text-muted-foreground">
                  Koppla SoftOne-anställda till användare i systemet. Matchningarna sparas automatiskt.
                </p>
                <div className="divide-y divide-border/40 rounded-xl border border-border/60">
                  {Array.from(
                    new Map(
                      scheduleEmployees.map((e) => [e.employee_nr, e])
                    ).values()
                  ).map((emp) => (
                    <MappingRow
                      key={emp.employee_nr}
                      employeeNr={emp.employee_nr}
                      employeeName={emp.employee_name}
                      employeeGroup={emp.employee_group}
                      appUsers={appUsers}
                      mappedUserId={getMappedUserId(emp.employee_nr)}
                      onMap={(uid) => setMapping(emp.employee_nr, uid)}
                    />
                  ))}
                </div>
              </div>
            )}

            {parsed && (
              <div className="p-5">
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">XML inläst</p>
                    <p className="text-muted-foreground">
                      {parsed.storeName && `${parsed.storeName} · `}
                      Vecka {parsed.weekNumber}, {parsed.year} · {parsed.employees.length} anställda
                    </p>
                  </div>
                </div>

                <p className="mb-3 text-sm font-medium text-foreground">
                  Koppla SoftOne-anställda till användare i systemet
                </p>
                <p className="mb-4 text-xs text-muted-foreground">
                  Matchningarna sparas och används automatiskt vid nästa import.
                </p>

                <div className="divide-y divide-border/40 rounded-xl border border-border/60">
                  {parsed.employees.map((emp) => (
                    <MappingRow
                      key={emp.employeeNr}
                      employeeNr={emp.employeeNr}
                      employeeName={emp.employeeName}
                      employeeGroup={emp.employeeGroup}
                      appUsers={appUsers}
                      mappedUserId={getMappedUserId(emp.employeeNr)}
                      onMap={(uid) => setMapping(emp.employeeNr, uid)}
                    />
                  ))}
                </div>
              </div>
            )}

            {!parsed && imports.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
                <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Importera ett schema först för att kunna matcha personal.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { if (!savingImport) { setMappingOpen(false); setParsed(null); } }}
              disabled={savingImport}
            >
              {parsed ? "Avbryt" : "Stäng"}
            </Button>
            {!parsed && imports.length > 0 && (
              <Button
                size="sm"
                onClick={async () => {
                  await saveMappings();
                  await loadMappings();
                  setMappingOpen(false);
                  toast.success("Matchningar sparade!");
                }}
              >
                Spara matchningar
              </Button>
            )}
            {parsed && (
              <Button size="sm" onClick={confirmImport} disabled={savingImport}>
                {savingImport ? "Importerar…" : "Importera schema"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MappingRow component ─────────────────────────────────────────────────────

function MappingRow({
  employeeNr,
  employeeName,
  employeeGroup,
  appUsers,
  mappedUserId,
  onMap,
}: {
  employeeNr: string;
  employeeName: string;
  employeeGroup: string;
  appUsers: AppUser[];
  mappedUserId: string | null;
  onMap: (uid: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {employeeName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{employeeName}</p>
        <p className="text-xs text-muted-foreground truncate">
          #{employeeNr}{employeeGroup ? ` · ${employeeGroup}` : ""}
        </p>
      </div>
      <Select
        value={mappedUserId ?? "__none__"}
        onValueChange={(v) => onMap(v === "__none__" ? null : v)}
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder="Välj användare…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">Ingen koppling</span>
          </SelectItem>
          {appUsers.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
