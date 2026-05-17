import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { ChartBar as BarChart2, TrendingUp, TriangleAlert as AlertTriangle, SquareCheck as CheckSquare, Store, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase, getSessionToken } from "@/lib/supabase";
import { useAuth, useIsAdmin } from "@/lib/auth-context";
import { cn, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/rapporter")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: RapporterPage,
});

const CHART_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

interface StoreStats {
  store_id: string;
  store_name: string;
  completed_tasks: number;
  total_tasks: number;
  open_incidents: number;
  critical_incidents: number;
  kundrunda_avg: number;
}

function RapporterPage() {
  const { user, activeStore } = useAuth();
  const isAdmin = useIsAdmin();
  const [storeStats, setStoreStats] = useState<StoreStats | null>(null);
  const [taskTrend, setTaskTrend] = useState<{ week: string; completed: number; created: number }[]>([]);
  const [incidentsByCategory, setIncidentsByCategory] = useState<{ category: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeStore) { setLoading(false); return; }
    setLoading(true);

    const [tasksRes, incidentsRes, rundaRes] = await Promise.all([
      supabase.from("tasks").select("id, status, created_at").eq("store_id", activeStore.id),
      supabase.from("incidents").select("id, status, category, priority, created_at").eq("store_id", activeStore.id),
      supabase.from("kundrunda_sessions").select("total_score, max_score, status").eq("store_id", activeStore.id).eq("status", "completed"),
    ]);

    const tasks = tasksRes.data ?? [];
    const incidents = incidentsRes.data ?? [];
    const rundor = rundaRes.data ?? [];

    const completedTasks = tasks.filter(t => t.status === "done").length;
    const openIncidents = incidents.filter(i => ["open", "in_progress", "escalated"].includes(i.status)).length;
    const criticalIncidents = incidents.filter(i => i.priority === "Kritisk" && i.status !== "closed").length;
    const avgRunda = rundor.length > 0
      ? rundor.reduce((s, r) => s + (r.max_score > 0 ? r.total_score / r.max_score * 100 : 0), 0) / rundor.length
      : 0;

    setStoreStats({
      store_id: activeStore.id,
      store_name: activeStore.name,
      completed_tasks: completedTasks,
      total_tasks: tasks.length,
      open_incidents: openIncidents,
      critical_incidents: criticalIncidents,
      kundrunda_avg: Math.round(avgRunda),
    });

    // Task trend (last 6 weeks)
    const trend: { week: string; completed: number; created: number }[] = [];
    for (let w = 5; w >= 0; w--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - w * 7 - weekStart.getDay() + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekLabel = `v${getISOWeek(weekStart)}`;
      const created = tasks.filter(t => {
        const d = new Date(t.created_at);
        return d >= weekStart && d <= weekEnd;
      }).length;
      const completed = tasks.filter(t => {
        const d = new Date(t.created_at);
        return t.status === "done" && d >= weekStart && d <= weekEnd;
      }).length;
      trend.push({ week: weekLabel, completed, created });
    }
    setTaskTrend(trend);

    // Incidents by category
    const byCat: Record<string, number> = {};
    incidents.forEach(i => { byCat[i.category ?? "Övrigt"] = (byCat[i.category ?? "Övrigt"] ?? 0) + 1; });
    setIncidentsByCategory(Object.entries(byCat).map(([category, count]) => ({ category, count })));

    setLoading(false);
  }, [activeStore]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-6 text-center text-muted-foreground text-sm">Laddar rapporter...</div>;

  const completionRate = storeStats && storeStats.total_tasks > 0
    ? Math.round(storeStats.completed_tasks / storeStats.total_tasks * 100)
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Rapporter</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeStore?.name}</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* KPI cards */}
      {storeStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Uppgifter klara"
            value={`${storeStats.completed_tasks}/${storeStats.total_tasks}`}
            sub={`${completionRate}% slutfört`}
            color="text-success"
            bg="bg-success/10"
            icon={<CheckSquare className="w-5 h-5" />}
          />
          <KpiCard
            label="Öppna avvikelser"
            value={String(storeStats.open_incidents)}
            sub={`${storeStats.critical_incidents} kritiska`}
            color={storeStats.critical_incidents > 0 ? "text-destructive" : "text-warning-foreground"}
            bg={storeStats.critical_incidents > 0 ? "bg-destructive/10" : "bg-warning/10"}
            icon={<AlertTriangle className="w-5 h-5" />}
          />
          <KpiCard
            label="Kundrundan snitt"
            value={`${storeStats.kundrunda_avg}%`}
            sub={storeStats.kundrunda_avg >= 80 ? "Bra resultat" : "Behöver förbättring"}
            color={storeStats.kundrunda_avg >= 80 ? "text-success" : "text-warning-foreground"}
            bg={storeStats.kundrunda_avg >= 80 ? "bg-success/10" : "bg-warning/10"}
            icon={<BarChart2 className="w-5 h-5" />}
          />
          <KpiCard
            label="Butik"
            value={activeStore?.name?.split(" ")[0] ?? "–"}
            sub={activeStore?.koncept ?? activeStore?.city ?? ""}
            color="text-info"
            bg="bg-info/10"
            icon={<Store className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Task trend chart */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4">Uppgifter per vecka</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={taskTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="week" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
            <YAxis tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", fontSize: 12 }} />
            <Bar dataKey="created" name="Skapade" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="completed" name="Klara" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Incidents by category */}
      {incidentsByCategory.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Avvikelser per kategori</h2>
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={incidentsByCategory} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ category, percent }) => `${category} ${Math.round(percent * 100)}%`}>
                  {incidentsByCategory.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 shrink-0">
              {incidentsByCategory.map((item, i) => (
                <div key={item.category} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-foreground">{item.category}</span>
                  <span className="text-muted-foreground ml-auto pl-4">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, color, bg, icon }: { label: string; value: string; sub: string; color: string; bg: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", bg, color)}>
        {icon}
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      <p className={cn("text-xs font-medium mt-1", color)}>{sub}</p>
    </div>
  );
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
