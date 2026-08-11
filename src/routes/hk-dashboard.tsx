import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  TriangleAlert as AlertTriangle,
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
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
  for (const yr of [today.getFullYear(), today.getFullYear() + 1]) {
    const holidays = getSwedishHolidays(yr);
    for (const h of holidays) {
      const diff = (h.date.getTime() - today.getTime()) / 86_400_000;
      if (diff >= -7 && diff <= 56) {
        result.push({ year: yr, week: isoWeekNumber(h.date), name: h.name });
      }
    }
  }
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
    <div className={cn("flex items-center gap-2", size === "sm" ? "w-20" : "w-28")}>
      <div className="flex-1 overflow-hidden rounded-full bg-muted h-1.5">
        <div
          className={cn("h-full rounded-full transition-[width]", color)}
          style={{ width: `${val}%` }}
        />
      </div>
      <span
        className={cn(
          "tabular-nums font-semibold shrink-0",
          size === "sm" ? "text-xs" : "text-sm",
          val >= 80 ? "text-success" : val >= 60 ? "text-warning-foreground" : "text-destructive",
        )}
      >
        {pct != null ? `${val}%` : "–"}
      </span>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        active
          ? "bg-success shadow-[0_0_6px_1px_oklch(var(--success)/0.5)]"
          : "bg-muted-foreground/40",
      )}
    />
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse motion-reduce:animate-none rounded-lg bg-muted", className)}
    />
  );
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

function KpiCard({
  label,
  value,
  sub,
  icon,
  trend,
  trendLabel,
  accent = "primary",
  loading,
}: KpiCardProps) {
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
      <div
        className={cn(
          "mb-3 flex h-9 w-9 items-center justify-center rounded-xl",
          accentMap[accent],
        )}
      >
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

// ─── Exceptions Sidebar Panel ────────────────────────────────────────────────

function ExceptionsSidebar({ storeIdFilter }: { storeIdFilter?: string[] }) {
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

      let storesQuery = supabase.from("stores").select("id, name, distrikt_namn, bolag");
      if (storeIdFilter && storeIdFilter.length > 0) {
        storesQuery = storesQuery.in("id", storeIdFilter);
      }
      const { data: stores } = await storesQuery;
      if (!stores || stores.length === 0) {
        setLoading(false);
        return;
      }

      const storeIds = stores.map((s) => s.id);

      const { data: schedules } = await supabase
        .from("schedule_imports")
        .select("store_id, week_number, year")
        .in("store_id", storeIds)
        .eq("year", upcomingYear)
        .eq("week_number", upcomingWeek);
      const storesWithSchedule = new Set((schedules ?? []).map((r) => r.store_id));

      const { data: plans } = await supabase
        .from("delivery_plans")
        .select("store_id, week_number, year")
        .in("store_id", storeIds)
        .eq("year", upcomingYear)
        .eq("week_number", upcomingWeek);
      const storesWithPlan = new Set((plans ?? []).map((r) => r.store_id));

      const isSpecialWeek = specialWeeks.some(
        (sw) => sw.week === upcomingWeek && sw.year === upcomingYear,
      );
      const holidayName =
        specialWeeks.find((sw) => sw.week === upcomingWeek && sw.year === upcomingYear)?.name ??
        null;

      const result: OperationalException[] = [];
      for (const store of stores) {
        const hasSched = storesWithSchedule.has(store.id);
        const hasPlan = storesWithPlan.has(store.id);
        if (!hasSched || (isSpecialWeek && !hasPlan)) {
          result.push({
            store_id: store.id,
            store_name: store.name,
            distrikt: (store as Record<string, unknown>).distrikt_namn as string | null,
            missing_schedule: !hasSched,
            missing_delivery_plan: isSpecialWeek && !hasPlan,
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
  }, [storeIdFilter?.join(",")]);

  const upcomingWeekLabel = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `v.${isoWeekNumber(d)}`;
  })();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-amber-50/60 dark:bg-amber-950/20 shrink-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600">
          <CalendarX className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">
            Operativa undantag
          </p>
          <p className="text-[10px] text-amber-700/70 dark:text-amber-400/70">
            {upcomingWeekLabel}
          </p>
        </div>
        {!loading && (
          <span
            className={cn(
              "text-xs font-bold tabular-nums rounded-full px-1.5 py-0.5",
              exceptions.length > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-success/10 text-success",
            )}
          >
            {exceptions.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border/40 p-3">
                <Skeleton className="mb-1.5 h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : exceptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="text-xs text-muted-foreground">
              Alla butiker är redo för {upcomingWeekLabel}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {exceptions.map((ex) => (
              <div key={ex.store_id} className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground leading-snug truncate">
                      {ex.store_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {ex.distrikt ?? "Okänt distrikt"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ex.missing_schedule && (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">
                          Saknar schema
                        </span>
                      )}
                      {ex.missing_delivery_plan && (
                        <span className="rounded-full bg-amber-200/70 dark:bg-amber-900/40 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                          Saknar leveransplan
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stores Sidebar Panel ─────────────────────────────────────────────────────

function StoresSidebar({
  distriktRows,
  allStores,
  selectedDistrikt,
  onSelectDistrikt,
  loading,
}: {
  distriktRows: DistriktRow[];
  allStores: StoreRow[];
  selectedDistrikt: string | null;
  onSelectDistrikt: (d: string | null) => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (d: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const storesByDistrikt: Record<string, StoreRow[]> = {};
  for (const s of allStores) {
    if (!storesByDistrikt[s.distrikt]) storesByDistrikt[s.distrikt] = [];
    storesByDistrikt[s.distrikt].push(s);
  }

  const sorted = [...distriktRows].sort((a, b) => b.completion_rate_pct - a.completion_rate_pct);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Store className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">Butiker per distrikt</p>
          <p className="text-[10px] text-muted-foreground">{allStores.length} butiker totalt</p>
        </div>
        {selectedDistrikt && (
          <button
            onClick={() => onSelectDistrikt(null)}
            className="text-[10px] text-primary hover:underline shrink-0"
          >
            Rensa
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            Inga distrikt hittades.
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {sorted.map((d, idx) => {
              const dStores = storesByDistrikt[d.distrikt] ?? [];
              const isExpanded = expanded.has(d.distrikt);
              const isSelected = selectedDistrikt === d.distrikt;
              return (
                <div key={d.distrikt}>
                  {/* Distrikt row */}
                  <div
                    className={cn(
                      "flex items-center gap-1 px-2 py-2 transition-colors",
                      isSelected ? "bg-primary-soft" : "hover:bg-muted/40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(d.distrikt)}
                      aria-label={
                        isExpanded ? `Dölj butiker i ${d.distrikt}` : `Visa butiker i ${d.distrikt}`
                      }
                      aria-expanded={isExpanded}
                      aria-controls={`distrikt-stores-${idx}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      className="flex flex-1 min-w-0 items-center gap-2 text-left"
                      onClick={() => onSelectDistrikt(isSelected ? null : d.distrikt)}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-xs font-semibold truncate",
                            isSelected ? "text-primary" : "text-foreground",
                          )}
                        >
                          {d.distrikt}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {d.store_count} butiker
                        </p>
                      </div>
                      <div className="shrink-0">
                        <RateBar pct={d.completion_rate_pct} size="sm" />
                      </div>
                    </button>
                  </div>

                  {/* Store list under distrikt */}
                  {isExpanded && (
                    <div
                      id={`distrikt-stores-${idx}`}
                      className="border-l-2 border-primary/20 ml-6 bg-muted/20"
                    >
                      {dStores.length === 0 ? (
                        <p className="px-3 py-2 text-[10px] text-muted-foreground">Ingen data</p>
                      ) : (
                        dStores.map((s) => (
                          <div
                            key={s.store_id}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 transition-colors"
                          >
                            <StatusDot active={s.active_24h} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-foreground truncate">
                                {s.store_name}
                              </p>
                              {(s.open_incidents > 0 || s.tasks_late > 0) && (
                                <div className="flex gap-2 text-[9px]">
                                  {s.open_incidents > 0 && (
                                    <span className="tabular-nums text-destructive font-medium">
                                      {s.open_incidents} avv.
                                    </span>
                                  )}
                                  {s.tasks_late > 0 && (
                                    <span className="tabular-nums text-warning-foreground font-medium">
                                      {s.tasks_late} sena
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-bold tabular-nums shrink-0",
                                (s.completion_rate_pct ?? 0) >= 80
                                  ? "text-success"
                                  : (s.completion_rate_pct ?? 0) >= 60
                                    ? "text-warning-foreground"
                                    : "text-destructive",
                              )}
                            >
                              {s.completion_rate_pct != null ? `${s.completion_rate_pct}%` : "–"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Main Page ────────────────────────────────────────────────────────────────

function HkDashboardPage() {
  const { user, userStores } = useAuth();
  const navigate = useNavigate();

  const hierarchyLevel = user?.hierarchy_level;
  const isDistrikt = hierarchyLevel === "distrikt";
  const isForening = hierarchyLevel === "forening";
  const isHkOrAdmin = user?.role === "admin" || hierarchyLevel === "hk";

  const isAllowed =
    user?.role === "admin" ||
    user?.role === "manager" ||
    hierarchyLevel === "hk" ||
    hierarchyLevel === "forening" ||
    hierarchyLevel === "distrikt";

  useEffect(() => {
    if (user && !isAllowed) navigate({ to: "/" });
  }, [user, isAllowed, navigate]);

  // Scope: which store IDs does this user see?
  const scopedStoreIds = isDistrikt || isForening ? userStores.map((s) => s.id) : undefined;

  const [national, setNational] = useState<NationalStats | null>(null);
  const [distrikt, setDistrikt] = useState<DistriktRow[]>([]);
  const [allStores, setAllStores] = useState<StoreRow[]>([]);
  const [selectedDistrikt, setSelectedDistrikt] = useState<string | null>(null);
  const [loadingNational, setLoadingNational] = useState(true);
  const [loadingDistrikt, setLoadingDistrikt] = useState(true);
  const [loadingAllStores, setLoadingAllStores] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadNational = useCallback(async () => {
    setLoadingNational(true);
    if (isHkOrAdmin) {
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
    } else if (scopedStoreIds && scopedStoreIds.length > 0) {
      // For forening/distrikt: compute stats from view_store_performance filtered by their stores
      const { data } = await supabase
        .from("view_store_performance")
        .select("*")
        .in("store_id", scopedStoreIds);
      if (data && data.length > 0) {
        const rows = data as Record<string, unknown>[];
        const total = rows.length;
        const active24h = rows.filter((r) => r.active_24h).length;
        const avgCompletion =
          rows.reduce((s, r) => s + (Number(r.completion_rate_pct) || 0), 0) / total;
        const totalIncidents = rows.reduce((s, r) => s + Number(r.open_incidents ?? 0), 0);
        const totalSessions = rows.reduce((s, r) => s + Number(r.sessions_last_7d ?? 0), 0);
        const totalLate = rows.reduce((s, r) => s + Number(r.tasks_late ?? 0), 0);
        const resHours = rows.filter((r) => r.avg_resolution_hours != null);
        const avgRes =
          resHours.length > 0
            ? resHours.reduce((s, r) => s + Number(r.avg_resolution_hours), 0) / resHours.length
            : 0;
        setNational({
          total_stores: total,
          active_stores_24h: active24h,
          national_completion: Math.round(avgCompletion),
          avg_resolution_hours: avgRes,
          total_open_incidents: totalIncidents,
          total_sessions_7d: totalSessions,
          total_tasks_late: totalLate,
        });
      }
    }
    setLoadingNational(false);
  }, [isHkOrAdmin, scopedStoreIds?.join(",")]);

  const loadDistrikt = useCallback(async () => {
    setLoadingDistrikt(true);
    if (isHkOrAdmin) {
      const { data, error } = await supabase.rpc("get_regional_performance");
      if (!error && data) {
        setDistrikt(
          (data as Record<string, unknown>[]).map((r) => ({
            distrikt: String(r.distrikt ?? r.region ?? "Övrigt"),
            store_count: Number(r.store_count ?? 0),
            total_sessions: Number(r.total_sessions ?? 0),
            completion_rate_pct: Number(r.completion_rate_pct ?? 0),
            open_incidents: Number(r.open_incidents ?? 0),
            avg_incident_resolution_hours:
              r.avg_incident_resolution_hours != null
                ? Number(r.avg_incident_resolution_hours)
                : null,
            active_stores_24h: Number(r.active_stores_24h ?? 0),
            last_session_at: (r.last_session_at as string | null) ?? null,
          })),
        );
      }
    } else if (scopedStoreIds && scopedStoreIds.length > 0) {
      // Build distrikt summary from scoped stores
      const { data } = await supabase
        .from("view_store_performance")
        .select("*")
        .in("store_id", scopedStoreIds);
      if (data) {
        const byDistrikt: Record<string, Record<string, unknown>[]> = {};
        for (const row of data as Record<string, unknown>[]) {
          const dk = String(row.distrikt ?? row.region ?? "Övrigt");
          if (!byDistrikt[dk]) byDistrikt[dk] = [];
          byDistrikt[dk].push(row);
        }
        setDistrikt(
          Object.entries(byDistrikt).map(([dk, rows]) => ({
            distrikt: dk,
            store_count: rows.length,
            total_sessions: rows.reduce((s, r) => s + Number(r.sessions_last_7d ?? 0), 0),
            completion_rate_pct: Math.round(
              rows.reduce((s, r) => s + Number(r.completion_rate_pct ?? 0), 0) / rows.length,
            ),
            open_incidents: rows.reduce((s, r) => s + Number(r.open_incidents ?? 0), 0),
            avg_incident_resolution_hours: null,
            active_stores_24h: rows.filter((r) => r.active_24h).length,
            last_session_at: null,
          })),
        );
      }
    }
    setLoadingDistrikt(false);
  }, [isHkOrAdmin, scopedStoreIds?.join(",")]);

  const loadAllStores = useCallback(async () => {
    setLoadingAllStores(true);
    let query = supabase
      .from("view_store_performance")
      .select("*")
      .order("completion_rate_pct", { ascending: false, nullsFirst: false });
    if (scopedStoreIds && scopedStoreIds.length > 0) {
      query = supabase
        .from("view_store_performance")
        .select("*")
        .in("store_id", scopedStoreIds)
        .order("completion_rate_pct", { ascending: false, nullsFirst: false });
    }
    const { data, error } = await query;
    if (!error && data) {
      setAllStores((data as Record<string, unknown>[]).map(mapStoreRow));
    }
    setLoadingAllStores(false);
  }, [scopedStoreIds?.join(",")]);

  useEffect(() => {
    if (!isAllowed) return;
    loadNational();
    loadDistrikt();
    loadAllStores();
  }, [user, isAllowed, loadNational, loadDistrikt, loadAllStores]);

  // Auto-expand distrikt user's single distrikt
  useEffect(() => {
    if (isDistrikt && distrikt.length === 1) {
      setSelectedDistrikt(distrikt[0].distrikt);
    }
  }, [isDistrikt, distrikt]);

  const handleRefresh = () => {
    setLastRefresh(new Date());
    loadNational();
    loadDistrikt();
    loadAllStores();
  };

  if (!isAllowed) return null;

  // Filtered stores for detail panel when a distrikt is selected
  const visibleStores = selectedDistrikt
    ? allStores.filter((s) => s.distrikt === selectedDistrikt)
    : allStores;

  const visibleStoreIds = visibleStores.map((s) => s.store_id);

  const scopeLabel = isDistrikt
    ? (distrikt[0]?.distrikt ?? "Ditt distrikt")
    : isForening
      ? "Din förening"
      : "Hela kedjan";

  const topStore = visibleStores[0] ?? null;
  const bottomStore = visibleStores[visibleStores.length - 1] ?? null;

  return (
    <div className="flex" style={{ height: "calc(100dvh - 3.5rem)" }}>
      {/* ── Left sidebar: stores by distrikt ── */}
      <aside className="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col border-r border-border/60 bg-card overflow-hidden">
        <StoresSidebar
          distriktRows={distrikt}
          allStores={allStores}
          selectedDistrikt={selectedDistrikt}
          onSelectDistrikt={setSelectedDistrikt}
          loading={loadingDistrikt || loadingAllStores}
        />
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[900px] px-4 py-6 md:px-6 md:py-8">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {isDistrikt
                  ? `Distrikt: ${distrikt[0]?.distrikt ?? "–"}`
                  : isForening
                    ? "Föreningsdashboard"
                    : "Dashboard"}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                {selectedDistrikt ? `Filtrerat på ${selectedDistrikt}` : scopeLabel}
                {" · "}
                {visibleStores.length} butiker
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:block">
                {lastRefresh.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button
                onClick={handleRefresh}
                disabled={loadingNational || loadingDistrikt}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 motion-reduce:animate-none",
                    (loadingNational || loadingDistrikt) && "animate-spin",
                  )}
                />
                <span className="hidden sm:inline">Uppdatera</span>
              </button>
            </div>
          </div>

          {/* Mobile: inline distrikt selector */}
          <div className="lg:hidden mb-4 overflow-x-auto">
            <div className="flex gap-2 pb-1">
              <button
                type="button"
                onClick={() => setSelectedDistrikt(null)}
                aria-pressed={selectedDistrikt === null}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedDistrikt === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                Alla
              </button>
              {distrikt.map((d) => (
                <button
                  key={d.distrikt}
                  type="button"
                  onClick={() =>
                    setSelectedDistrikt(selectedDistrikt === d.distrikt ? null : d.distrikt)
                  }
                  aria-pressed={selectedDistrikt === d.distrikt}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                    selectedDistrikt === d.distrikt
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d.distrikt}
                </button>
              ))}
            </div>
          </div>

          {/* KPI row */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Fullföljandegrad"
              value={national ? `${national.national_completion}%` : "–"}
              sub="Kundrundor 30 dagar"
              icon={<CheckCircle2 className="h-4.5 w-4.5" />}
              accent={
                (national?.national_completion ?? 0) >= 80
                  ? "success"
                  : (national?.national_completion ?? 0) >= 60
                    ? "warning"
                    : "destructive"
              }
              loading={loadingNational}
            />
            <KpiCard
              label="Genomsnittlig åtgärdstid"
              value={national ? fmtHours(national.avg_resolution_hours) : "–"}
              sub="Avvikelse → stängd"
              icon={<Clock className="h-4.5 w-4.5" />}
              accent={
                (national?.avg_resolution_hours ?? 999) <= 4
                  ? "success"
                  : (national?.avg_resolution_hours ?? 999) <= 24
                    ? "warning"
                    : "destructive"
              }
              loading={loadingNational}
            />
            <KpiCard
              label="Aktiva butiker (24 h)"
              value={national ? `${national.active_stores_24h} / ${national.total_stores}` : "–"}
              sub="Inloggad aktivitet"
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

          {/* Secondary stats */}
          <div className="mb-6 grid gap-3 grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">
                    {loadingNational ? (
                      <Skeleton className="h-5 w-10 inline-block" />
                    ) : (
                      (national?.total_sessions_7d ?? "–")
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Kundrundor (7 dagar)</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">
                    {loadingNational ? (
                      <Skeleton className="h-5 w-10 inline-block" />
                    ) : (
                      (national?.total_stores ?? "–")
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Aktiva butiker</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">
                    {loadingNational ? (
                      <Skeleton className="h-5 w-10 inline-block" />
                    ) : (
                      (national?.total_tasks_late ?? "–")
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Sena uppgifter</p>
                </div>
              </div>
            </div>
          </div>

          {/* Top / Bottom highlight */}
          {!loadingAllStores && visibleStores.length >= 2 && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-success">
                    Bäst {selectedDistrikt ? "i distrikt" : "nationellt"}
                  </span>
                </div>
                <p className="text-base font-bold text-foreground">{topStore?.store_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {topStore?.completion_rate_pct != null
                    ? `${topStore.completion_rate_pct}% fullföljandegrad`
                    : "Ingen data"}
                </p>
              </div>
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-destructive">
                    Behöver stöd
                  </span>
                </div>
                <p className="text-base font-bold text-foreground">{bottomStore?.store_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {bottomStore?.completion_rate_pct != null
                    ? `${bottomStore.completion_rate_pct}% fullföljandegrad`
                    : "Ingen data"}
                  {(bottomStore?.open_incidents ?? 0) > 0
                    ? ` · ${bottomStore?.open_incidents} avvikelser`
                    : ""}
                </p>
              </div>
            </div>
          )}

          {/* Store table */}
          <div className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
            <div className="border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold">
                {selectedDistrikt ? `Butiker i ${selectedDistrikt}` : "Alla butiker"}
              </h2>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/30">
              {loadingAllStores
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="px-4 py-3">
                      <Skeleton className="mb-2 h-5 w-40" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ))
                : visibleStores.map((s, idx) => (
                    <div key={s.store_id} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-sm text-foreground truncate">
                          {s.store_name}
                        </span>
                        <StatusDot active={s.active_24h} />
                      </div>
                      <div className="ml-7 flex items-center gap-3 flex-wrap">
                        <RateBar pct={s.completion_rate_pct} size="sm" />
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span className="tabular-nums">{s.sessions_last_7d} rundor/v</span>
                          {s.open_incidents > 0 && (
                            <span className="tabular-nums text-destructive font-medium">
                              {s.open_incidents} avv.
                            </span>
                          )}
                          {s.tasks_late > 0 && (
                            <span className="tabular-nums text-warning-foreground font-medium">
                              {s.tasks_late} sena
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              {!loadingAllStores && visibleStores.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Inga butiker.
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Butik
                    </th>
                    {!selectedDistrikt && (
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Distrikt
                      </th>
                    )}
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Fullföljandegrad
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Rundor/v
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Avvikelser
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Sena
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Senast
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Online
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAllStores
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/30">
                          <td className="px-4 py-3">
                            <Skeleton className="h-4 w-36" />
                          </td>
                          {!selectedDistrikt && (
                            <td className="px-3 py-3">
                              <Skeleton className="h-4 w-24" />
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <Skeleton className="h-4 w-24" />
                          </td>
                          <td className="px-3 py-3">
                            <Skeleton className="mx-auto h-4 w-8" />
                          </td>
                          <td className="px-3 py-3">
                            <Skeleton className="mx-auto h-4 w-8" />
                          </td>
                          <td className="px-3 py-3">
                            <Skeleton className="mx-auto h-4 w-8" />
                          </td>
                          <td className="px-3 py-3">
                            <Skeleton className="h-4 w-20" />
                          </td>
                          <td className="px-3 py-3">
                            <Skeleton className="mx-auto h-3 w-3 rounded-full" />
                          </td>
                        </tr>
                      ))
                    : visibleStores.map((s, idx) => (
                        <tr
                          key={s.store_id}
                          className={cn(
                            "border-b border-border/30 last:border-0 transition-colors hover:bg-muted/30",
                            idx === 0 && "bg-success/3",
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                                {idx + 1}
                              </span>
                              <span className="font-medium text-foreground">{s.store_name}</span>
                            </div>
                          </td>
                          {!selectedDistrikt && (
                            <td className="px-3 py-3 text-xs text-muted-foreground">
                              {s.distrikt}
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <RateBar pct={s.completion_rate_pct} size="sm" />
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums text-foreground/80">
                            {s.sessions_last_7d}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={cn(
                                "tabular-nums font-medium",
                                s.open_incidents > 0 ? "text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {s.open_incidents}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={cn(
                                "tabular-nums font-medium",
                                s.tasks_late > 0
                                  ? "text-warning-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {s.tasks_late}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {fmtDate(s.last_session_at)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <StatusDot active={s.active_24h} />
                          </td>
                        </tr>
                      ))}
                  {!loadingAllStores && visibleStores.length === 0 && (
                    <tr>
                      <td
                        colSpan={selectedDistrikt ? 7 : 8}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        Inga butiker hittades.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ── Right sidebar: operational exceptions ── */}
      <aside className="hidden xl:flex w-64 shrink-0 flex-col border-l border-border/60 bg-card overflow-hidden">
        <ExceptionsSidebar
          storeIdFilter={visibleStoreIds.length > 0 ? visibleStoreIds : scopedStoreIds}
        />
      </aside>
    </div>
  );
}
