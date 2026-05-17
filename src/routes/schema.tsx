import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Calendar, Upload, Plus, ChevronLeft, ChevronRight, Clock, Truck, Users, RefreshCw, TriangleAlert as AlertTriangle, Check, X, FileText, Info, ChevronDown } from "lucide-react";
import { supabase, type ScheduleShift, type ScheduleEmployee, type DeliveryPlan, type AppUser, type Store as StoreType } from "@/lib/supabase";
import { useAuth, useIsManager } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, formatDate, getWeekNumber } from "@/lib/utils";
import { getSessionToken } from "@/lib/supabase";
import { toast } from "sonner";
import { addWeeks, startOfWeek, format, getISOWeek, getYear, isWithinInterval, parseISO } from "date-fns";
import { sv } from "date-fns/locale";

export const Route = createFileRoute("/schema")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: SchemaPage,
});

// Swedish national holidays (static list for key holidays)
function getSwedishHolidays(year: number): { date: string; name: string }[] {
  // Key Swedish red days
  const fixed = [
    { month: 1, day: 1, name: "Nyårsdagen" },
    { month: 1, day: 6, name: "Trettondedag jul" },
    { month: 5, day: 1, name: "Första maj" },
    { month: 6, day: 6, name: "Sveriges nationaldag" },
    { month: 12, day: 24, name: "Julafton" },
    { month: 12, day: 25, name: "Juldagen" },
    { month: 12, day: 26, name: "Annandag jul" },
    { month: 12, day: 31, name: "Nyårsafton" },
  ];
  // Easter-based
  const easter = calcEaster(year);
  const easterBased = [
    { offset: -2, name: "Långfredagen" },
    { offset: 0, name: "Påskdagen" },
    { offset: 1, name: "Annandag påsk" },
    { offset: 39, name: "Kristi himmelsfärdsdag" },
    { offset: 49, name: "Pingstdagen" },
  ];
  // Midsommar: Saturday between Jun 20-26
  const midsommar = getMidsommarDate(year);

  const result = fixed.map(f => ({
    date: `${year}-${String(f.month).padStart(2, "0")}-${String(f.day).padStart(2, "0")}`,
    name: f.name,
  }));

  easterBased.forEach(({ offset, name }) => {
    const d = new Date(easter);
    d.setDate(d.getDate() + offset);
    result.push({ date: d.toISOString().slice(0, 10), name });
  });

  result.push({ date: midsommar, name: "Midsommarafton" });
  result.push({ date: addDays(midsommar, 1), name: "Midsommardagen" });

  return result;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calcEaster(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMidsommarDate(year: number): string {
  // Midsommarafton = Saturday between June 20 and June 26
  for (let day = 20; day <= 26; day++) {
    const d = new Date(year, 5, day); // month 5 = June
    if (d.getDay() === 6) return `${year}-06-${String(day).padStart(2, "0")}`;
  }
  return `${year}-06-20`;
}

function getWeekDates(year: number, week: number): string[] {
  // ISO week: Monday = start
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (dayOfWeek - 1) + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function isSpecialWeek(weekDates: string[], holidays: { date: string; name: string }[]): { special: boolean; holidays: string[] } {
  const holidayDates = holidays.map(h => h.date);
  const found: string[] = [];
  for (const d of weekDates) {
    const date = new Date(d);
    const isSunday = date.getDay() === 0;
    // Sundays are always red days but not "special weeks" per se
    // Weekday red days (Mon-Sat) = special
    if (!isSunday && holidayDates.includes(d)) {
      const h = holidays.find(h => h.date === d)!;
      found.push(h.name);
    }
  }
  return { special: found.length > 0, holidays: found };
}

// Parse SoftOne XML
function parseSoftOneXml(xmlText: string): { employees: string[]; shifts: { employeeName: string; date: string; start: string; end: string }[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const employees = new Set<string>();
  const shifts: { employeeName: string; date: string; start: string; end: string }[] = [];

  // Handle multiple week blocks safely
  const shiftElements = Array.from(doc.querySelectorAll("Pass, Shift, WorkShift, Schemarad, Row, Record"));
  if (shiftElements.length === 0) {
    // Try generic row parsing
    const rows = Array.from(doc.getElementsByTagName("*")).filter(el =>
      el.getAttribute("Datum") || el.getAttribute("Date") || el.getAttribute("datum")
    );
    rows.forEach(row => {
      const name = row.getAttribute("Namn") || row.getAttribute("Name") || row.getAttribute("AnstNamn") || "";
      const date = row.getAttribute("Datum") || row.getAttribute("Date") || "";
      const start = row.getAttribute("Start") || row.getAttribute("StartTid") || row.getAttribute("Starttid") || "";
      const end = row.getAttribute("Slut") || row.getAttribute("Sluttid") || row.getAttribute("Stoptid") || "";
      if (name && date) {
        employees.add(name);
        shifts.push({ employeeName: name, date: normalizeDate(date), start, end });
      }
    });
  } else {
    shiftElements.forEach(el => {
      const name = el.getAttribute("Namn") || el.getAttribute("Name") || el.getAttribute("AnstNamn") || el.textContent?.trim() || "";
      const date = el.getAttribute("Datum") || el.getAttribute("Date") || "";
      const start = el.getAttribute("Start") || el.getAttribute("StartTid") || "";
      const end = el.getAttribute("Slut") || el.getAttribute("Sluttid") || el.getAttribute("Stoptid") || "";
      if (name && date) {
        employees.add(name);
        shifts.push({ employeeName: name, date: normalizeDate(date), start, end });
      }
    });
  }

  return { employees: Array.from(employees), shifts };
}

function normalizeDate(d: string): string {
  // Handle YYYY-MM-DD, YYYYMMDD, DD/MM/YYYY, etc.
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [dd, mm, yyyy] = d.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  return d;
}

function SchemaPage() {
  const { user, activeStore } = useAuth();
  const isManager = useIsManager();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"schema" | "leveransplan">("schema");
  const [currentWeek, setCurrentWeek] = useState(() => getISOWeek(new Date()));
  const [currentYear, setCurrentYear] = useState(() => getYear(new Date()));
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<ScheduleEmployee[]>([]);
  const [deliveryPlans, setDeliveryPlans] = useState<DeliveryPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showDeliveryImport, setShowDeliveryImport] = useState(false);

  const weekDates = useMemo(() => getWeekDates(currentYear, currentWeek), [currentYear, currentWeek]);

  const load = useCallback(async () => {
    if (!activeStore) { setLoading(false); return; }
    setLoading(true);
    const [startDate, endDate] = [weekDates[0], weekDates[6]];

    const [shiftsRes, empRes, planRes] = await Promise.all([
      supabase.from("schedule_shifts").select("*, schedule_employees(name, employee_number)")
        .eq("store_id", activeStore.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date").order("start_time"),
      supabase.from("schedule_employees").select("*").eq("store_id", activeStore.id),
      supabase.from("delivery_plans").select("*, delivery_items(*)")
        .eq("store_id", activeStore.id)
        .gte("delivery_date", startDate)
        .lte("delivery_date", endDate),
    ]);

    setShifts((shiftsRes.data ?? []) as ScheduleShift[]);
    setEmployees((empRes.data ?? []) as ScheduleEmployee[]);
    setDeliveryPlans((planRes.data ?? []) as DeliveryPlan[]);
    setLoading(false);
  }, [activeStore, weekDates]);

  useEffect(() => { load(); }, [load]);

  // Auto-scroll to current time on desktop
  const currentDayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMobile && currentDayRef.current) {
      setTimeout(() => {
        currentDayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 300);
    }
  }, [isMobile, shifts]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const holidays = useMemo(() => getSwedishHolidays(currentYear), [currentYear]);
  const weekSpecial = useMemo(() => isSpecialWeek(weekDates, holidays), [weekDates, holidays]);

  function prevWeek() {
    if (currentWeek === 1) { setCurrentWeek(52); setCurrentYear(y => y - 1); }
    else setCurrentWeek(w => w - 1);
  }
  function nextWeek() {
    if (currentWeek === 52) { setCurrentWeek(1); setCurrentYear(y => y + 1); }
    else setCurrentWeek(w => w + 1);
  }
  function goToday() {
    setCurrentWeek(getISOWeek(new Date()));
    setCurrentYear(getYear(new Date()));
  }

  const DAYS_SV = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Schema & Leveransplan</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeStore?.name}</p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 h-9 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium transition-colors"
            >
              <Upload className="w-4 h-4" />
              {isMobile ? "Import" : "Importera schema"}
            </button>
            <button
              onClick={() => setShowDeliveryImport(true)}
              className="flex items-center gap-2 px-3 h-9 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium"
            >
              <Truck className="w-4 h-4" />
              {isMobile ? "Lev." : "Leveransplan"}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {[
          { key: "schema" as const, label: "Schema", icon: Calendar },
          { key: "leveransplan" as const, label: "Leveransplan", icon: Truck },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                tab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Week navigator */}
      <div className="flex items-center gap-2">
        <button onClick={prevWeek} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={goToday} className="px-3 py-1.5 rounded-xl bg-card border border-border text-sm font-medium hover:bg-muted transition-colors">
          Vecka {currentWeek}, {currentYear}
        </button>
        <button onClick={nextWeek} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        {weekSpecial.special && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warning/20 border border-warning/30 text-xs text-warning-foreground">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Specialvecka: {weekSpecial.holidays.join(", ")}</span>
          </div>
        )}
      </div>

      {tab === "schema" && (
        <ScheduleView
          weekDates={weekDates}
          shifts={shifts}
          employees={employees}
          loading={loading}
          isMobile={isMobile}
          todayStr={todayStr}
          currentDayRef={currentDayRef}
          holidays={holidays}
          DAYS_SV={DAYS_SV}
        />
      )}

      {tab === "leveransplan" && (
        <DeliveryView
          weekDates={weekDates}
          deliveryPlans={deliveryPlans}
          loading={loading}
          DAYS_SV={DAYS_SV}
          todayStr={todayStr}
          holidays={holidays}
        />
      )}

      {showImport && (
        <XmlImportDialog
          activeStore={activeStore}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      {showDeliveryImport && (
        <DeliveryImportDialog
          activeStore={activeStore}
          currentYear={currentYear}
          onClose={() => setShowDeliveryImport(false)}
          onImported={() => { setShowDeliveryImport(false); load(); }}
          holidays={holidays}
        />
      )}
    </div>
  );
}

// ─── Schedule View ─────────────────────────────────────────────────────────
interface ScheduleViewProps {
  weekDates: string[];
  shifts: ScheduleShift[];
  employees: ScheduleEmployee[];
  loading: boolean;
  isMobile: boolean;
  todayStr: string;
  currentDayRef: React.RefObject<HTMLDivElement | null>;
  holidays: { date: string; name: string }[];
  DAYS_SV: string[];
}

function ScheduleView({ weekDates, shifts, employees, loading, isMobile, todayStr, currentDayRef, holidays, DAYS_SV }: ScheduleViewProps) {
  if (loading) {
    return <div className="py-12 text-center text-muted-foreground text-sm">Laddar schema...</div>;
  }

  if (isMobile) {
    // Mobile: single day view with horizontal swipe-like navigation
    const todayIdx = weekDates.indexOf(todayStr);
    const [selectedDay, setSelectedDay] = useState(todayIdx >= 0 ? todayIdx : 0);
    const dayDate = weekDates[selectedDay];
    const dayShifts = shifts.filter(s => s.date === dayDate);
    const holiday = holidays.find(h => h.date === dayDate);

    return (
      <div className="space-y-3">
        {/* Day tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {weekDates.map((d, i) => {
            const isToday = d === todayStr;
            const isHoliday = holidays.some(h => h.date === d);
            const dayName = DAYS_SV[i];
            const dayNum = new Date(d).getDate();
            return (
              <button
                key={d}
                onClick={() => setSelectedDay(i)}
                className={cn(
                  "flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px] transition-all",
                  selectedDay === i ? "bg-primary text-primary-foreground" : "bg-card border border-border",
                  isToday && selectedDay !== i && "border-primary"
                )}
              >
                <span className="text-xs font-medium">{dayName}</span>
                <span className={cn("text-base font-bold", isHoliday && selectedDay !== i && "text-destructive")}>{dayNum}</span>
              </button>
            );
          })}
        </div>

        {holiday && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {holiday.name} (röd dag)
          </div>
        )}

        <div className="space-y-2">
          {dayShifts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground bg-card border border-border rounded-xl">Inga pass denna dag</div>
          ) : (
            dayShifts.map(shift => (
              <ShiftCard key={shift.id} shift={shift} />
            ))
          )}
        </div>
      </div>
    );
  }

  // Desktop: full week grid
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 divide-x divide-border border-b border-border bg-muted/50">
        {weekDates.map((d, i) => {
          const isToday = d === todayStr;
          const holiday = holidays.find(h => h.date === d);
          return (
            <div
              key={d}
              ref={isToday ? currentDayRef : undefined}
              className={cn("px-2 py-2 text-center", isToday && "bg-primary-soft")}
            >
              <p className="text-xs font-semibold text-muted-foreground">{DAYS_SV[i]}</p>
              <p className={cn("text-lg font-bold", isToday ? "text-primary" : "text-foreground")}>
                {new Date(d).getDate()}
              </p>
              {holiday && (
                <p className="text-[10px] text-destructive truncate" title={holiday.name}>
                  {holiday.name}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 divide-x divide-border min-h-40">
        {weekDates.map(d => {
          const dayShifts = shifts.filter(s => s.date === d);
          return (
            <div key={d} className="p-2 space-y-1.5 min-h-24">
              {dayShifts.map(shift => (
                <ShiftCard key={shift.id} shift={shift} compact />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShiftCard({ shift, compact }: { shift: ScheduleShift; compact?: boolean }) {
  const name = shift.schedule_employees?.name ?? "Okänd";
  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      shift.is_borrowed ? "border-blue-200 bg-blue-50" :
      shift.is_lended ? "border-orange-200 bg-orange-50" :
      "border-border bg-muted/40",
      compact ? "px-2 py-1" : "px-3 py-2"
    )}>
      <p className={cn("font-medium text-foreground truncate", compact ? "text-xs" : "text-sm")}>{name}</p>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Clock className={cn(compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
        <p className={cn(compact ? "text-[10px]" : "text-xs")}>
          {shift.start_time}–{shift.end_time}
        </p>
      </div>
      {(shift.is_borrowed || shift.is_lended) && !compact && (
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
          shift.is_borrowed ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
        )}>
          {shift.is_borrowed ? "Inlånad" : "Utlånad"}
        </span>
      )}
    </div>
  );
}

// ─── Delivery View ─────────────────────────────────────────────────────────
function DeliveryView({ weekDates, deliveryPlans, loading, DAYS_SV, todayStr, holidays }: {
  weekDates: string[]; deliveryPlans: DeliveryPlan[]; loading: boolean;
  DAYS_SV: string[]; todayStr: string; holidays: { date: string; name: string }[];
}) {
  if (loading) return <div className="py-12 text-center text-muted-foreground text-sm">Laddar leveransplan...</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
      {weekDates.map((d, i) => {
        const dayPlans = deliveryPlans.filter(p => p.delivery_date?.slice(0, 10) === d);
        const holiday = holidays.find(h => h.date === d);
        const isToday = d === todayStr;
        return (
          <div key={d} className={cn("bg-card border border-border rounded-xl p-3", isToday && "border-primary/40 bg-primary-soft/20")}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">{DAYS_SV[i]}</p>
                <p className={cn("text-base font-bold", isToday && "text-primary")}>{new Date(d).getDate()}</p>
              </div>
              {holiday && <AlertTriangle className="w-3.5 h-3.5 text-destructive" title={holiday.name} />}
            </div>
            {dayPlans.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ingen leverans</p>
            ) : (
              dayPlans.map(plan => (
                <div key={plan.id} className="mt-1 space-y-1">
                  {(plan.delivery_items ?? []).slice(0, 4).map(item => (
                    <div key={item.id} className="text-xs text-foreground flex items-center justify-between">
                      <span className="truncate">{item.article_name}</span>
                      <span className="text-muted-foreground shrink-0 ml-1">{item.quantity} {item.unit}</span>
                    </div>
                  ))}
                  {(plan.delivery_items?.length ?? 0) > 4 && (
                    <p className="text-xs text-muted-foreground">+{(plan.delivery_items?.length ?? 0) - 4} till</p>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── XML Import Dialog ─────────────────────────────────────────────────────
function XmlImportDialog({ activeStore, onClose, onImported }: {
  activeStore: StoreType | null; onClose: () => void; onImported: () => void;
}) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ employees: string[]; shifts: { employeeName: string; date: string; start: string; end: string }[] } | null>(null);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeStore) return;
    supabase.from("app_users").select("*").eq("is_active", true).then(({ data }) => {
      const users = (data ?? []) as AppUser[];
      setAppUsers(users);
    });
  }, [activeStore]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = ev => {
      const xml = ev.target?.result as string;
      const result = parseSoftOneXml(xml);
      setParsed(result);

      // Auto-match: find app users whose display_name closely matches employee names
      const autoMappings: Record<string, string | null> = {};
      result.employees.forEach(empName => {
        const normalized = empName.toLowerCase().trim();
        const match = (data ?? []).find((u: AppUser) => {
          const uName = u.display_name.toLowerCase().trim();
          return uName === normalized || uName.startsWith(normalized.split(" ")[0]);
        });
        autoMappings[empName] = match?.id ?? null;
      });
      setMappings(autoMappings);
      setStep(2);
    };
    reader.readAsText(f, "UTF-8");
    e.target.value = "";
  }

  // Need to store loaded app users for auto-match
  const [data, setData] = useState<AppUser[]>([]);
  useEffect(() => {
    if (!activeStore) return;
    supabase.from("app_users").select("*").eq("is_active", true).then(({ data: d }) => {
      setData((d ?? []) as AppUser[]);
      setAppUsers((d ?? []) as AppUser[]);
    });
  }, [activeStore]);

  async function importShifts() {
    if (!parsed || !activeStore) return;
    setImporting(true);
    try {
      // Create import record
      const { data: importRec } = await supabase.from("schedule_imports").insert({
        store_id: activeStore.id,
        import_date: new Date().toISOString(),
        file_name: file?.name ?? "import.xml",
      }).select().single();

      const importId = importRec?.id;

      // Upsert employees and get/create mappings
      const empIdMap: Record<string, string> = {};
      for (const empName of parsed.employees) {
        // Check if employee already exists for this store
        const { data: existingEmp } = await supabase
          .from("schedule_employees")
          .select("id")
          .eq("store_id", activeStore.id)
          .eq("name", empName)
          .maybeSingle();

        let empId: string;
        if (existingEmp) {
          empId = existingEmp.id;
        } else {
          const { data: newEmp } = await supabase
            .from("schedule_employees")
            .insert({ store_id: activeStore.id, name: empName, import_id: importId })
            .select()
            .single();
          empId = newEmp?.id ?? "";
        }
        empIdMap[empName] = empId;

        // Create/update employee mapping if user selected
        const mappedUserId = mappings[empName];
        if (mappedUserId && empId) {
          await supabase.from("employee_mappings").upsert({
            store_id: activeStore.id,
            schedule_employee_id: empId,
            app_user_id: mappedUserId,
          }, { onConflict: "schedule_employee_id,store_id" });
        }
      }

      // Create shifts in batches of 50 to avoid timeouts
      const BATCH = 50;
      for (let i = 0; i < parsed.shifts.length; i += BATCH) {
        const batch = parsed.shifts.slice(i, i + BATCH);
        await supabase.from("schedule_shifts").insert(
          batch.map(s => ({
            store_id: activeStore.id,
            import_id: importId,
            employee_id: empIdMap[s.employeeName] ?? null,
            date: s.date,
            start_time: s.start || "00:00",
            end_time: s.end || "00:00",
            is_lended: false,
            is_borrowed: false,
          }))
        );
      }

      toast.success(`Import klar: ${parsed.shifts.length} pass för ${parsed.employees.length} anställda`);
      onImported();
    } catch (e: unknown) {
      toast.error("Importfel: " + String(e));
    }
    setImporting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full sm:max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Importera SoftOne Go XML</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {step === 1 && (
            <div>
              <p className="text-sm text-muted-foreground mb-4">Välj en XML-fil exporterad från SoftOne Go. Filer med flera veckor stöds.</p>
              <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={handleFile} />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 hover:border-primary transition-colors text-muted-foreground hover:text-foreground"
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm font-medium">Välj XML-fil</span>
              </button>
            </div>
          )}

          {step === 2 && parsed && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-xl">
                <Check className="w-4 h-4 text-success" />
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{parsed.shifts.length}</span> pass &amp; <span className="font-semibold">{parsed.employees.length}</span> anställda hittades
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground mb-2">Koppla anställda till appanvändare</p>
                <p className="text-xs text-muted-foreground mb-3">Automatchning baserat på namn. Justera vid behov.</p>
                <div className="space-y-2 max-h-56 overflow-auto" data-scroll-container>
                  {parsed.employees.map(empName => (
                    <div key={empName} className="flex items-center gap-3 p-2.5 border border-border rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{empName}</p>
                        <p className="text-xs text-muted-foreground">Schemaanställd</p>
                      </div>
                      <select
                        value={mappings[empName] ?? ""}
                        onChange={e => setMappings(m => ({ ...m, [empName]: e.target.value || null }))}
                        className="h-9 px-2 rounded-lg border border-border bg-card text-xs w-44 focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">– Ej kopplad –</option>
                        {appUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.display_name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button onClick={() => setStep(1)} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Tillbaka</button>
                <button
                  onClick={importShifts}
                  disabled={importing}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70"
                >
                  {importing ? "Importerar..." : `Importera ${parsed.shifts.length} pass`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delivery Import Dialog ─────────────────────────────────────────────────
function DeliveryImportDialog({ activeStore, currentYear, onClose, onImported, holidays }: {
  activeStore: StoreType | null; currentYear: number;
  onClose: () => void; onImported: () => void;
  holidays: { date: string; name: string }[];
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csvData, setCsvData] = useState<{ date: string; items: { article: string; qty: number; unit: string }[] }[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [weekOverride, setWeekOverride] = useState<number | null>(null);
  const [specialWeekFiles, setSpecialWeekFiles] = useState<Record<number, { date: string; items: { article: string; qty: number; unit: string }[] }[]>>({});
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const specialFileRef = useRef<HTMLInputElement>(null);

  // Find special weeks in current year
  const specialWeeks = useMemo(() => {
    const result: { week: number; holidays: string[] }[] = [];
    for (let w = 1; w <= 52; w++) {
      const dates = getWeekDates(currentYear, w);
      const sp = isSpecialWeek(dates, holidays);
      if (sp.special) result.push({ week: w, holidays: sp.holidays });
    }
    return result;
  }, [currentYear, holidays]);

  function parseDeliveryCsv(text: string): { date: string; items: { article: string; qty: number; unit: string }[] }[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const delim = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes("datum") || h.includes("date"));
    const articleIdx = headers.findIndex(h => h.includes("artikel") || h.includes("produkt") || h.includes("namn") || h.includes("name"));
    const qtyIdx = headers.findIndex(h => h.includes("antal") || h.includes("qty") || h.includes("kvantitet"));
    const unitIdx = headers.findIndex(h => h.includes("enhet") || h.includes("unit"));

    const byDate: Record<string, { article: string; qty: number; unit: string }[]> = {};
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(delim).map(v => v.trim().replace(/^"|"$/g, ""));
      const date = normalizeDate(vals[dateIdx] ?? "");
      const article = vals[articleIdx] ?? `Artikel ${i}`;
      const qty = parseFloat(vals[qtyIdx] ?? "1") || 1;
      const unit = vals[unitIdx] ?? "st";
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({ article, qty, unit });
    }
    return Object.entries(byDate).map(([date, items]) => ({ date, items }));
  }

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>, isSpecial?: number) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const data = parseDeliveryCsv(text);
      if (isSpecial !== undefined) {
        setSpecialWeekFiles(prev => ({ ...prev, [isSpecial]: data }));
      } else {
        setCsvData(data);
        setStep(2);
      }
    };
    reader.readAsText(f, "UTF-8");
    e.target.value = "";
  }

  async function doImport() {
    if (!activeStore || csvData.length === 0) return;
    setImporting(true);
    try {
      for (const dayData of csvData) {
        if (!dayData.date || dayData.date === "Invalid Date") continue;
        const { data: plan } = await supabase.from("delivery_plans").insert({
          store_id: activeStore.id,
          delivery_date: dayData.date,
          is_default_template: isDefault,
          is_special_week: false,
          week_number: weekOverride ?? getWeekNumber(new Date(dayData.date)),
          year: currentYear,
        }).select().single();

        if (plan) {
          await supabase.from("delivery_items").insert(
            dayData.items.map(item => ({
              plan_id: plan.id,
              article_name: item.article,
              quantity: item.qty,
              unit: item.unit,
            }))
          );
        }
      }

      // Import special week files
      for (const [weekNum, weekData] of Object.entries(specialWeekFiles)) {
        for (const dayData of weekData) {
          const { data: plan } = await supabase.from("delivery_plans").insert({
            store_id: activeStore.id,
            delivery_date: dayData.date,
            is_special_week: true,
            is_default_template: false,
            week_number: parseInt(weekNum),
            year: currentYear,
          }).select().single();

          if (plan) {
            await supabase.from("delivery_items").insert(
              dayData.items.map(item => ({
                plan_id: plan.id,
                article_name: item.article,
                quantity: item.qty,
                unit: item.unit,
              }))
            );
          }
        }
      }

      toast.success("Leveransplan importerad");
      onImported();
    } catch (e: unknown) {
      toast.error("Importfel: " + String(e));
    }
    setImporting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full sm:max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Importera leveransplan</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Importera standard leveransplan (CSV). Gäller som mall för alla normala veckor.</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsv} />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 hover:border-primary transition-colors text-muted-foreground"
              >
                <Truck className="w-6 h-6" />
                <span className="text-sm font-medium">Välj standard leveransplan (CSV)</span>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3 bg-success/10 border border-success/20 rounded-xl">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{csvData.length}</span> leveransdagar hittades
                </p>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/50">
                  <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded border-border text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Standardmall</p>
                    <p className="text-xs text-muted-foreground">Används för alla vanliga veckor automatiskt</p>
                  </div>
                </label>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Tillhör specifik vecka (lämna tomt för automatisk)
                  </label>
                  <select
                    value={weekOverride ?? ""}
                    onChange={e => setWeekOverride(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Automatisk (baserat på datum)</option>
                    {Array.from({ length: 52 }, (_, i) => i + 1).map(w => (
                      <option key={w} value={w}>Vecka {w} {currentYear}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Special weeks */}
              {specialWeeks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Specialveckor {currentYear}</p>
                  <p className="text-xs text-muted-foreground">
                    Dessa veckor innehåller röda dagar. Du kan ladda upp en anpassad leveransplan (valfritt).
                  </p>
                  <div className="space-y-2">
                    {specialWeeks.map(sw => (
                      <div key={sw.week} className="flex items-center gap-3 p-3 border border-border rounded-xl bg-warning/5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">Vecka {sw.week}</p>
                          <p className="text-xs text-muted-foreground">{sw.holidays.join(", ")}</p>
                        </div>
                        {specialWeekFiles[sw.week] ? (
                          <div className="flex items-center gap-2 text-xs text-success">
                            <Check className="w-3.5 h-3.5" />
                            {specialWeekFiles[sw.week].length} dagar
                          </div>
                        ) : (
                          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted cursor-pointer text-xs font-medium">
                            <Upload className="w-3 h-3" />
                            Ladda upp
                            <input type="file" accept=".csv,.txt" className="hidden" onChange={e => handleCsv(e, sw.week)} />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button onClick={() => setStep(1)} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Tillbaka</button>
                <button
                  onClick={doImport}
                  disabled={importing}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70"
                >
                  {importing ? "Importerar..." : "Importera"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
