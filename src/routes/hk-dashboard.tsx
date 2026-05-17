import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  TriangleAlert as AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarX,
  ChevronRight,
  CircleCheck as CheckCircle2,
  Clock,
  RefreshCw,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { getSwedishHolidays, isoWeekNumber } from "@/lib/swedish-holidays";

export const Route = createFileRoute("/hk-dashboard")({
  component: HkDashboardPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type NationalStats = {
  total_stores: number;
  active_stores_24h: number;
  national_completion: number;
  avg_resolution_hours: number;
  total_open_incidents: number;
  total_sessions_7d: number;
  total_tasks_late: number;
};

type DistriktRow = {
  distrikt: string;
  store_count: number;
  total_sessions: number;
  completion_rate_pct: number;
  open_incidents: number;
  avg_incident_resolution_hours: number | null;
  active_stores_24h: number;
  last_session_at: string | null;
};

type StoreRow = {
  store_id: string;
  store_name: string;
  distrikt: string;
  completion_rate_pct: number | null;
  sessions_last_7d: number;
  open_incidents: number;
  avg_resolution_hours: number | null;
  sla_breaches: number;
  tasks_late: number;
  last_session_at: string | null;
  active_24h: boolean;
};

type OperationalException = {
  store_id: string;
  store_name: string;
  distrikt: string | null;
  missing_schedule: boolean;
  missing_delivery_plan: boolean;
  special_week: boolean;
  holiday_name: string | null;
  week_number: number;
  year: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtHours(h: number | null | undefined): string {
  if (h == null) return "–";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 1) return "< 1 h sedan";
  if (diffH < 24) return `${Math.round(diffH)} h sedan`;
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function getUpcomingSpecialWeeks(): Array<{ year: number; week: number; name: string }> {
  const today = new Date();
  const result: Array<{ year: number; week: number; name: string }> = [];
  // Check current year and next year for holidays in the next 8 weeks
  for (const yr of [today.getFullYear(), today.getFullYear() + 1]) {
    const holidays = getSwedishHolidays(yr);
    for (const h of holidays) {
      const diff = (h.date.getTime() - today.getTime()) / 86_400_000;
      if (diff >= -7 && diff <= 56) {
        result.push({ year: yr, week: isoWeekNumber(h.date), name: h.name });
      }
    }
  }
  // Deduplicate by week+year
  const seen = new Set<string>();
  return result.filter((r) => {
    const k = `${r.year}-${r.week}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function RateBar({ pct, size = "md" }: { pct: number | null; size?: "sm" | "md" }) {
  const val = pct ?? 0;
  const color = val >= 80 ? "bg-success" : val >= 60 ? "bg-warning" : "bg-destructive";
  return (
    <div className={cn("flex items-center gap-2", size === "sm" ? "w-24" : "w-32")}>
      <div className="flex-1 overflow-hidden rounded-full bg-muted h-1.5">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${val}%` }} />
      </div>
      <span className={cn("tabular-nums font-semibold", size === "sm" ? "text-xs" : "text-sm",
        val >= 80 ? "text-success" : val >= 60 ? "text-warning-foreground" : "text-destructive"
      )}>
        {pct != null ? `${val}%` : "–"}
      </span>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={cn(
      "inline-block h-2 w-2 rounded-full",
      active ? "bg-success shadow-[0_0_6px_1px_oklch(var(--success)/0.5)]" : "bg-muted-foreground/40",
    )} />
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

type KpiCardProps = {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  accent?: "primary" | "success" | "warning" | "destructive";
  loading?: boolean;
};

function KpiCard({ label, value, sub, icon, trend, trendLabel, accent = "primary", loading }: KpiCardProps) {
  const accentMap = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
        <Skeleton className="mb-3 h-8 w-8 rounded-lg" />
        <Skeleton className="mb-2 h-7 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]">
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl", accentMap[accent])}>
        {icon}
      </div>
      <div className="space-y-0.5">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {(sub || trendLabel) && (
          <div className="flex items-center gap-1.5 pt-1">
            {trend === "up" && <TrendingUp className="h-3 w-3 text-success" />}
            {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
            <span className="text-xs text-muted-foreground/80">{trendLabel ?? sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Operational Exceptions Panel ────────────────────────────────────────────

function OperationalExceptionsPanel({ storeIdFilter }: { storeIdFilter?: string[] }) {
  const [exceptions, setExceptions] = useState<OperationalException[]>([]);
  const [loading, setLoading] = useState(true);
  const specialWeeks = getUpcomingSpecialWeeks();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const today = new Date();
      const nextWeekDate = new Date(today);
      nextWeekDate.setDate(today.getDate() + 7);
      const upcomingYear = nextWeekDate.getFullYear();
      const upcomingWeek = isoWeekNumber(nextWeekDate);

      // Fetch all stores (possibly filtered)
      let storesQuery = supabase
        .from("stores")
        .select("id, name, distrikt_namn, bolag");
      if (storeIdFilter && storeIdFilter.length > 0) {
        storesQuery = storesQuery.in("id", storeIdFilter);
      }
      const { data: stores } = await storesQuery;
      if (!stores || stores.length === 0) { setLoading(false); return; }

      const storeIds = stores.map((s) => s.id);

      // Fetch schedules for upcoming week
      const { data: schedules } = await supabase
        .from("schedule_imports")
        .select("store_id, week_number, year")
        .in("store_id", storeIds)
        .eq("year", upcomingYear)
        .eq("week_number", upcomingWeek);
      const storesWithSchedule = new Set((schedules ?? []).map((r) => r.store_id));

      // Fetch delivery plans for upcoming week
      const { data: plans } = await supabase
        .from("delivery_plans")
        .select("store_id, week_number, year")
        .in("store_id", storeIds)
        .eq("year", upcomingYear)
        .eq("week_number", upcomingWeek);
      const storesWithPlan = new Set((plans ?? []).map((r) => r.store_id));

      const isSpecialWeek = specialWeeks.some((sw) => sw.week === upcomingWeek && sw.year === upcomingYear);
      const holidayName = specialWeeks.find((sw) => sw.week === upcomingWeek && sw.year === upcomingYear)?.name ?? null;

      const result: OperationalException[] = [];
      for (const store of stores) {
        const hasSched = storesWithSchedule.has(store.id);
        const hasPlan = storesWithPlan.has(store.id);
        const needsPlan = isSpecialWeek;
        if (!hasSched || (needsPlan && !hasPlan)) {
          result.push({
            store_id: store.id,
            store_name: store.name,
            distrikt: (store as Record<string, unknown>).distrikt_namn as string | null,
            missing_schedule: !hasSched,
            missing_delivery_plan: needsPlan && !hasPlan,
            special_week: isSpecialWeek,
            holiday_name: holidayName,
            week_number: upcomingWeek,
            year: upcomingYear,
          });
        }
      }
      setExceptions(result);
      setLoading(false);
    }
    load();
  }, [storeIdFilter]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
        <div className="border-b border-border/60 px-4 py-3.5">
          <Skeleton className="h-5 w-56" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border-b border-border/30 px-4 py-3.5">
            <Skeleton className="mb-2 h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  const upcomingWeekLabel = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `v.${isoWeekNumber(d)} ${d.getFullYear()}`;
  })();

  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-700/40 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2.5 border-b border-amber-200/60 dark:border-amber-700/30 px-4 py-3.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
          <CalendarX className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
            Operativa undantag – {upcomingWeekLabel}
          </span>
          {exceptions.length > 0 && exceptions[0].special_week && exceptions[0].holiday_name && (
            <span className="ml-2 rounded-full bg-amber-200/70 dark:bg-amber-800/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              {exceptions[0].holiday_name}
            </span>
          )}
        </div>
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          {exceptions.length} butik{exceptions.length !== 1 ? "er" : ""}
        </span>
      </div>

      {exceptions.length === 0 ? (
        <div className="flex items-center gap-2.5 px-4 py-4">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <span className="text-sm text-muted-foreground">
            Alla butiker har schema och leveransplan inladdade för {upcomingWeekLabel}.
          </span>
        </div>
      ) : (
        <div className="divide-y divide-amber-200/40 dark:divide-amber-700/20">
          {exceptions.map((ex) => (
            <div key={ex.store_id} className="flex items-start gap-3 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{ex.store_name}</p>
                <p className="text-xs text-muted-foreground">{ex.distrikt ?? "Okänt distrikt"}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {ex.missing_schedule && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    Saknar schema
                  </span>
                )}
                {ex.missing_delivery_plan && (
                  <span className="rounded-full bg-amber-200/70 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    Saknar leveransplan
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function mapStoreRow(r: Record<string, unknown>): StoreRow {
  return {
    store_id: String(r.store_id),
    store_name: String(r.store_name ?? "–"),
    distrikt: String(r.distrikt ?? r.region ?? "–"),
    completion_rate_pct: r.completion_rate_pct != null ? Number(r.completion_rate_pct) : null,
    sessions_last_7d: Number(r.sessions_last_7d ?? 0),
    open_incidents: Number(r.open_incidents ?? 0),
    avg_resolution_hours: r.avg_resolution_hours != null ? Number(r.avg_resolution_hours) : null,
    sla_breaches: Number(r.sla_breaches ?? 0),
    tasks_late: Number(r.tasks_late ?? 0),
    last_session_at: (r.last_session_at as string | null) ?? null,
    active_24h: Boolean(r.active_24h),
  };
}

function HkDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [national, setNational] = useState<NationalStats | null>(null);
  const [distrikt, setDistrikt] = useState<DistriktRow[]>([]);
  const [allStores, setAllStores] = useState<StoreRow[]>([]);
  const [drillDistrikt, setDrillDistrikt] = useState<string | null>(null);
  const [drillStores, setDrillStores] = useState<StoreRow[]>([]);
  const [loadingNational, setLoadingNational] = useState(true);
  const [loadingDistrikt, setLoadingDistrikt] = useState(true);
  const [loadingAllStores, setLoadingAllStores] = useState(true);
  const [loadingDrillStores, setLoadingDrillStores] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const isAllowed =
    user?.role === "admin" ||
    user?.role === "manager" ||
    user?.hierarchy_level === "hk" ||
    user?.hierarchy_level === "forening" ||
    user?.hierarchy_level === "distrikt";

  useEffect(() => {
    if (user && !isAllowed) navigate({ to: "/" });
  }, [user, isAllowed, navigate]);

  const loadNational = useCallback(async () => {
    setLoadingNational(true);
    const { data, error } = await supabase.rpc("get_national_stats");
    if (!error && data && Array.isArray(data) && data.length > 0) {
      const row = data[0] as Record<string, unknown>;
      setNational({
        total_stores: Number(row.total_stores ?? 0),
        active_stores_24h: Number(row.active_stores_24h ?? 0),
        national_completion: Number(row.national_completion ?? 0),
        avg_resolution_hours: Number(row.avg_resolution_hours ?? 0),
        total_open_incidents: Number(row.total_open_incidents ?? 0),
        total_sessions_7d: Number(row.total_sessions_7d ?? 0),
        total_tasks_late: Number(row.total_tasks_late ?? 0),
      });
    }
    setLoadingNational(false);
  }, []);

  const loadDistrikt = useCallback(async () => {
    setLoadingDistrikt(true);
    const { data, error } = await supabase.rpc("get_regional_performance");
    if (!error && data) {
      setDistrikt(
        (data as Record<string, unknown>[]).map((r) => ({
          distrikt: String(r.distrikt ?? r.region ?? "Övrigt"),
          store_count: Number(r.store_count ?? 0),
          total_sessions: Number(r.total_sessions ?? 0),
          completion_rate_pct: Number(r.completion_rate_pct ?? 0),
          open_incidents: Number(r.open_incidents ?? 0),
          avg_incident_resolution_hours: r.avg_incident_resolution_hours != null ? Number(r.avg_incident_resolution_hours) : null,
          active_stores_24h: Number(r.active_stores_24h ?? 0),
          last_session_at: (r.last_session_at as string | null) ?? null,
        })),
      );
    }
    setLoadingDistrikt(false);
  }, []);

  const loadAllStores = useCallback(async () => {
    setLoadingAllStores(true);
    const { data, error } = await supabase
      .from("view_store_performance")
      .select("*")
      .order("completion_rate_pct", { ascending: false, nullsFirst: false });
    if (!error && data) {
      setAllStores((data as Record<string, unknown>[]).map(mapStoreRow));
    }
    setLoadingAllStores(false);
  }, []);

  const loadDrillStores = useCallback(async (d: string) => {
    setLoadingDrillStores(true);
    const { data, error } = await supabase.rpc("get_store_performance_by_region", { p_region: d });
    if (!error && data) {
      setDrillStores((data as Record<string, unknown>[]).map(mapStoreRow));
    }
    setLoadingDrillStores(false);
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    loadNational();
    loadDistrikt();
    loadAllStores();
  }, [user, isAllowed, loadNational, loadDistrikt, loadAllStores]);

  const handleRefresh = () => {
    setLastRefresh(new Date());
    loadNational();
    loadDistrikt();
    loadAllStores();
    if (drillDistrikt) loadDrillStores(drillDistrikt);
  };

  const handleDrillDown = (d: string) => {
    setDrillDistrikt(d);
    setDrillStores([]);
    loadDrillStores(d);
  };

  const handleBack = () => {
    setDrillDistrikt(null);
    setDrillStores([]);
  };

  if (!isAllowed) return null;

  // ─── Drill-down view ──────────────────────────────────────────────────────
  if (drillDistrikt) {
    const topStore = drillStores[0] ?? null;
    const bottomStore = drillStores[drillStores.length - 1] ?? null;
    const drillStoreIds = drillStores.map((s) => s.store_id);

    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Alla distrikt</span>
            <span className="sm:hidden">Tillbaka</span>
          </button>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
          <span className="text-sm font-semibold text-foreground">{drillDistrikt}</span>
        </div>

        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Distrikt: {drillDistrikt}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loadingDrillStores ? "Laddar butiksdata..." : `${drillStores.length} butiker`}
          </p>
        </div>

        {/* Operational exceptions for this distrikt */}
        {!loadingDrillStores && drillStoreIds.length > 0 && (
          <div className="mb-6">
            <OperationalExceptionsPanel storeIdFilter={drillStoreIds} />
          </div>
        )}

        {/* Top / Bottom highlight */}
        {!loadingDrillStores && drillStores.length >= 2 && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-xs font-semibold uppercase tracking-wide text-success">Bäst i distrikt</span>
              </div>
              <p className="text-base font-bold text-foreground">{topStore?.store_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {topStore?.completion_rate_pct != null ? `${topStore.completion_rate_pct}% fullföljandegrad` : "Ingen data"}
                {topStore?.sessions_last_7d ? ` · ${topStore.sessions_last_7d} rundor/vecka` : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-xs font-semibold uppercase tracking-wide text-destructive">Behöver stöd</span>
              </div>
              <p className="text-base font-bold text-foreground">{bottomStore?.store_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {bottomStore?.completion_rate_pct != null ? `${bottomStore.completion_rate_pct}% fullföljandegrad` : "Ingen data"}
                {(bottomStore?.open_incidents ?? 0) > 0 ? ` · ${bottomStore?.open_incidents} öppna avvikelser` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Store ranking */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
          <div className="border-b border-border/60 px-4 sm:px-5 py-3.5">
            <h2 className="text-sm font-semibold">Butiksrankning</h2>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/30">
            {loadingDrillStores
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-4 py-3">
                    <Skeleton className="mb-2 h-5 w-40" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))
              : drillStores.map((s, idx) => (
                  <div key={s.store_id} className={cn("px-4 py-3.5", idx === 0 && "bg-success/3")}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-foreground text-sm">{s.store_name}</span>
                      <StatusDot active={s.active_24h} />
                    </div>
                    <div className="ml-8.5 pl-0.5">
                      <RateBar pct={s.completion_rate_pct} size="sm" />
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{s.sessions_last_7d} rundor/v</span>
                        {s.open_incidents > 0 && <span className="text-destructive font-medium">{s.open_incidents} avv.</span>}
                        {s.sla_breaches > 0 && <span className="text-destructive font-medium">{s.sla_breaches} SLA-brott</span>}
                        {s.tasks_late > 0 && <span className="text-warning-foreground font-medium">{s.tasks_late} sena</span>}
                        {s.last_session_at && <span>{fmtDate(s.last_session_at)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
            {!loadingDrillStores && drillStores.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Inga butiker hittades i distrikt {drillDistrikt}.
              </div>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Butik</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fullföljandegrad</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rundor/v</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avvikelser</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">SLA-brott</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sena uppgifter</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Senaste runda</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Online</th>
                </tr>
              </thead>
              <tbody>
                {loadingDrillStores
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="px-5 py-3"><Skeleton className="h-4 w-36" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                        <td className="px-4 py-3"><Skeleton className="mx-auto h-4 w-8" /></td>
                        <td className="px-4 py-3"><Skeleton className="mx-auto h-4 w-8" /></td>
                        <td className="px-4 py-3"><Skeleton className="mx-auto h-4 w-8" /></td>
                        <td className="px-4 py-3"><Skeleton className="mx-auto h-4 w-8" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                        <td className="px-4 py-3"><Skeleton className="mx-auto h-3 w-3 rounded-full" /></td>
                      </tr>
                    ))
                  : drillStores.map((s, idx) => (
                      <tr
                        key={s.store_id}
                        className={cn(
                          "border-b border-border/30 last:border-0 transition-colors hover:bg-muted/30",
                          idx === 0 && "bg-success/3",
                        )}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                              {idx + 1}
                            </span>
                            <span className="font-medium text-foreground">{s.store_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <RateBar pct={s.completion_rate_pct} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-foreground/80">{s.sessions_last_7d}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("tabular-nums font-medium", s.open_incidents > 0 ? "text-destructive" : "text-muted-foreground")}>
                            {s.open_incidents}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("tabular-nums font-medium", s.sla_breaches > 0 ? "text-destructive" : "text-muted-foreground")}>
                            {s.sla_breaches}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("tabular-nums font-medium", s.tasks_late > 0 ? "text-warning-foreground" : "text-muted-foreground")}>
                            {s.tasks_late}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(s.last_session_at)}</td>
                        <td className="px-4 py-3 text-center"><StatusDot active={s.active_24h} /></td>
                      </tr>
                    ))}
                {!loadingDrillStores && drillStores.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Inga butiker hittades i distrikt {drillDistrikt}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ─── National overview ────────────────────────────────────────────────────
  const sortedDistrikt = [...distrikt].sort((a, b) => b.completion_rate_pct - a.completion_rate_pct);
  const storesByDistrikt: Record<string, StoreRow[]> = {};
  for (const s of allStores) {
    if (!storesByDistrikt[s.distrikt]) storesByDistrikt[s.distrikt] = [];
    storesByDistrikt[s.distrikt].push(s);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <PageHeader
            title="HK-Dashboard"
            description="Nationell operativ status för hela kedjan."
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:block">
            Uppdaterad {lastRefresh.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={handleRefresh}
            disabled={loadingNational || loadingDistrikt}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (loadingNational || loadingDistrikt) && "animate-spin")} />
            <span className="hidden sm:inline">Uppdatera</span>
          </button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Nationell fullföljandegrad"
          value={national ? `${national.national_completion}%` : "–"}
          sub="Kundrundor senaste 30 dagar"
          icon={<CheckCircle2 className="h-4.5 w-4.5" />}
          accent={
            (national?.national_completion ?? 0) >= 80 ? "success"
            : (national?.national_completion ?? 0) >= 60 ? "warning"
            : "destructive"
          }
          loading={loadingNational}
        />
        <KpiCard
          label="Genomsnittlig åtgärdstid"
          value={national ? fmtHours(national.avg_resolution_hours) : "–"}
          sub="Avvikelse → stängd (30 dagar)"
          icon={<Clock className="h-4.5 w-4.5" />}
          accent={
            (national?.avg_resolution_hours ?? 999) <= 4 ? "success"
            : (national?.avg_resolution_hours ?? 999) <= 24 ? "warning"
            : "destructive"
          }
          loading={loadingNational}
        />
        <KpiCard
          label="Aktiva butiker (24 h)"
          value={national ? `${national.active_stores_24h} / ${national.total_stores}` : "–"}
          sub="Inloggad aktivitet senaste dygnet"
          icon={<Wifi className="h-4.5 w-4.5" />}
          accent="primary"
          loading={loadingNational}
        />
        <KpiCard
          label="Öppna avvikelser"
          value={national ? String(national.total_open_incidents) : "–"}
          sub={national ? `${national.total_tasks_late} sena uppgifter` : undefined}
          icon={<AlertTriangle className="h-4.5 w-4.5" />}
          accent={(national?.total_open_incidents ?? 0) > 0 ? "warning" : "success"}
          loading={loadingNational}
        />
      </div>

      {/* ── Secondary stats ── */}
      <div className="mb-8 grid gap-3 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">
                {loadingNational ? <Skeleton className="h-6 w-12 inline-block" /> : national?.total_sessions_7d ?? "–"}
              </p>
              <p className="text-xs text-muted-foreground">Genomförda Kundrundor (7 dagar)</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">
                {loadingNational ? <Skeleton className="h-6 w-12 inline-block" /> : national?.total_stores ?? "–"}
              </p>
              <p className="text-xs text-muted-foreground">Aktiva butiker totalt</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">
                {loadingNational ? <Skeleton className="h-6 w-12 inline-block" /> : national?.total_tasks_late ?? "–"}
              </p>
              <p className="text-xs text-muted-foreground">Sena uppgifter nationellt</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Operativa undantag (nationell vy) ── */}
      <div className="mb-8">
        <OperationalExceptionsPanel />
      </div>

      {/* ── Butiker per distrikt ── */}
      <div className="space-y-4">
        {(loadingDistrikt || loadingAllStores)
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
                <div className="border-b border-border/60 px-4 py-3.5">
                  <Skeleton className="h-5 w-32" />
                </div>
                {Array.from({ length: 2 }).map((__, j) => (
                  <div key={j} className="border-b border-border/30 px-4 py-3.5">
                    <Skeleton className="mb-2 h-4 w-48" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ))
          : sortedDistrikt.length === 0
            ? (
              <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground shadow-[var(--shadow-sm)]">
                Inga distrikt hittades. Kontrollera att butikerna har ett distrikt inställt i adminpanelen.
              </div>
            )
            : sortedDistrikt.map((d) => {
                const dStores = storesByDistrikt[d.distrikt] ?? [];
                return (
                  <div key={d.distrikt} className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
                    {/* Distrikt header */}
                    <button
                      className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/20"
                      onClick={() => handleDrillDown(d.distrikt)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <Store className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">{d.distrikt}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{d.store_count} butiker</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <RateBar pct={d.completion_rate_pct} size="sm" />
                        {d.open_incidents > 0 && (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                            {d.open_incidents} avv.
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    </button>

                    {/* Stores in this distrikt */}
                    <div className="divide-y divide-border/30">
                      {dStores.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-muted-foreground">
                          Inga butiker med data i detta distrikt.
                        </div>
                      ) : dStores.map((s, idx) => (
                        <div key={s.store_id} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-foreground">{s.store_name}</span>
                              <StatusDot active={s.active_24h} />
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 text-xs text-muted-foreground">
                              <span>{s.sessions_last_7d} rundor/v</span>
                              {s.open_incidents > 0 && <span className="text-destructive font-medium">{s.open_incidents} avv.</span>}
                              {s.tasks_late > 0 && <span className="text-warning-foreground font-medium">{s.tasks_late} sena</span>}
                              {s.last_session_at && <span>Senast: {fmtDate(s.last_session_at)}</span>}
                            </div>
                          </div>
                          <RateBar pct={s.completion_rate_pct} size="sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
        }
      </div>
    </div>
  );
}
