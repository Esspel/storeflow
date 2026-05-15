import { createFileRoute, Link } from "@tanstack/react-router";
import { TriangleAlert as AlertTriangle, ArrowRight, ChartBar as BarChart3, ListChecks, Clock, CircleCheck as CheckCircle2, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  component: HubPage,
});

type Action = {
  to: string;
  title: string;
  desc: string;
  cta: string;
  icon: LucideIcon;
  tone: "pink" | "mint" | "blue" | "amber";
};

const toneBg: Record<Action["tone"], string> = {
  pink: "bg-accent",
  mint: "bg-primary-soft",
  blue: "bg-info/15",
  amber: "bg-warning/20",
};
const toneFg: Record<Action["tone"], string> = {
  pink: "text-accent-foreground",
  mint: "text-primary",
  blue: "text-info",
  amber: "text-warning-foreground",
};

function ActionCard({ a, large = false }: { a: Action; large?: boolean }) {
  return (
    <Link
      to={a.to}
      className={cn(
        "group flex flex-col items-center rounded-3xl bg-card text-center shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
        large ? "p-8 md:p-10" : "p-6 md:p-7",
      )}
    >
      <div className={cn("flex items-center justify-center rounded-full", toneBg[a.tone], large ? "h-20 w-20" : "h-16 w-16")}>
        <a.icon className={cn(toneFg[a.tone], large ? "h-9 w-9" : "h-7 w-7")} />
      </div>
      <h3 className={cn("mt-5 font-bold tracking-tight", large ? "text-xl md:text-2xl" : "text-lg")}>
        {a.title}
      </h3>
      <p className="mt-1.5 max-w-[28ch] text-sm text-muted-foreground">{a.desc}</p>
      <div className="mt-auto w-full pt-6">
        <span className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition-colors group-hover:bg-primary/90">
          {a.cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

type Stats = {
  openTasks: number;
  overdueTasks: number;
  openIncidents: number;
  completionRate: number;
  recentIncidents: { id: string; title: string; status: string; created_at: string }[];
};

function HubPage() {
  const { user, activeStore, userStores } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const isManager = user?.role === "manager" || user?.role === "admin";

  const actions: Action[] = [
    { to: "/uppgifter", title: "Dagens uppgifter", desc: "Se och slutför dina rutiner och checklistor", cta: "Till uppgifter", icon: ListChecks, tone: "pink" },
    { to: "/avvikelser", title: "Avvikelser", desc: "Rapportera och följ upp ärenden i butiken", cta: "Till avvikelser", icon: AlertTriangle, tone: "mint" },
    ...(isManager ? [{ to: "/rapporter", title: "Rapporter", desc: "KPI:er, trender och insikter", cta: "Till rapporter", icon: BarChart3, tone: "blue" as const }] : []),
  ];

  useEffect(() => {
    const load = async () => {
      const storeFilter = user?.role === "admin" ? null : activeStore?.id ?? null;

      let tasksQ = supabase.from("tasks").select("status");
      if (storeFilter) tasksQ = tasksQ.eq("store_id", storeFilter);
      const { data: tasks } = await tasksQ;

      let incQ = supabase.from("incidents").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(5);
      if (storeFilter) incQ = incQ.eq("store_id", storeFilter);
      const { data: incidents } = await incQ;

      const all = tasks ?? [];
      const done = all.filter((t) => t.status === "done").length;
      const openTasks = all.filter((t) => t.status === "todo" || t.status === "progress").length;
      const overdueTasks = all.filter((t) => t.status === "late").length;
      const total = all.length;
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

      const inc = (incidents ?? []) as { id: string; title: string; status: string; created_at: string }[];
      const openIncidents = inc.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length;

      setStats({ openTasks, overdueTasks, openIncidents, completionRate, recentIncidents: inc.slice(0, 3) });
    };
    load();
  }, [user, activeStore]);

  const storeLine = activeStore ? `${activeStore.name}${activeStore.region ? ` · ${activeStore.region}` : ""}` : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-12 md:px-8 md:py-20">
      <div className="text-center">
        {storeLine && <p className="text-sm font-medium text-primary">{storeLine}</p>}
        <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground md:text-6xl">
          Vad ska du göra idag?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
          Allt du behöver för butikens dagliga drift — på ett ställe.
        </p>
      </div>

      <div className={cn(
        "mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-5 md:mt-16",
        actions.length === 2 ? "sm:grid-cols-2 max-w-3xl" : "sm:grid-cols-3"
      )}>
        {actions.map((a) => <ActionCard key={a.to} a={a} large />)}
      </div>

      {/* Live stats */}
      {stats && (
        <div className="mx-auto mt-10 max-w-5xl grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            icon={ListChecks} label="Öppna uppgifter"
            value={stats.openTasks} tone="blue"
          />
          <StatTile
            icon={Clock} label="Försenade"
            value={stats.overdueTasks} tone={stats.overdueTasks > 0 ? "red" : "blue"}
          />
          <StatTile
            icon={AlertTriangle} label="Öppna avvikelser"
            value={stats.openIncidents} tone={stats.openIncidents > 0 ? "amber" : "blue"}
          />
          <StatTile
            icon={TrendingUp} label="Slutförandegrad"
            value={`${stats.completionRate}%`} tone="green"
          />
        </div>
      )}

      {/* Recent incidents */}
      {stats && stats.recentIncidents.length > 0 && (
        <div className="mx-auto mt-8 max-w-5xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Senaste avvikelser</h2>
            <Link to="/avvikelser" className="text-sm font-medium text-primary hover:underline">Visa alla</Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
            {stats.recentIncidents.map((inc, i) => (
              <div key={inc.id} className={cn("flex items-center justify-between px-5 py-3.5", i > 0 && "border-t border-border/40")}>
                <div>
                  <p className="text-sm font-medium">{inc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inc.created_at).toLocaleDateString("sv-SE")}
                  </p>
                </div>
                <IncidentStatusBadge status={inc.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string | number; tone: "blue" | "red" | "amber" | "green" }) {
  const colors = {
    blue: "bg-info/10 text-info",
    red: "bg-destructive/10 text-destructive",
    amber: "bg-warning/15 text-warning-foreground",
    green: "bg-success/10 text-success",
  };
  return (
    <div className="flex flex-col items-center rounded-2xl bg-card p-5 shadow-[var(--shadow-sm)] text-center">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", colors[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function IncidentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "Ny", cls: "bg-info/15 text-info" },
    in_progress: { label: "Pågår", cls: "bg-warning/15 text-warning-foreground" },
    escalated: { label: "Eskalerad", cls: "bg-destructive/10 text-destructive" },
    resolved: { label: "Löst", cls: "bg-success/15 text-success" },
    closed: { label: "Stängt", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", s.cls)}>{s.label}</span>;
}
