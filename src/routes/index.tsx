import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TriangleAlert as AlertTriangle,
  ArrowRight,
  ChartBar as BarChart3,
  ListChecks,
  Clock,
  TrendingUp,
  Repeat,
  CircleCheck as CheckCircle2,
  Circle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { getSimulatedNow } from "@/lib/time-simulation";

export const Route = createFileRoute("/")({
  component: HubPage,
});

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  recurrence_rule: string | null;
  parent_task_id: string | null;
  steps_total: number;
  steps_done: number;
  priority: string;
  recurrence_days: number[] | null;
};

type Stats = {
  todosCompleted: number;
  issuesCreated: number;
  openTasks: number;
  overdueTasks: number;
  openIncidents: number;
};

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Dagligen",
  every_other_day: "Varannan dag",
  weekly: "Varje vecka",
  monthly: "Varje månad",
  yearly: "Varje år",
};

const WEEKDAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function recurrenceLabel(task: TaskRow): string {
  const base = RECURRENCE_LABELS[task.recurrence_rule ?? ""] ?? task.recurrence_rule ?? "";
  if (task.recurrence_rule === "weekly" && task.recurrence_days && task.recurrence_days.length > 0) {
    const days = [...task.recurrence_days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join(", ");
    return `${base} · ${days}`;
  }
  return base;
}

function isEffectivelyLate(t: { status: string; due_date: string | null }, now: number): boolean {
  return t.status !== "done" && t.status !== "cancelled" && t.due_date != null && new Date(t.due_date).getTime() < now;
}

function HubPage() {
  const { user, activeStore } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [oneOffTasks, setOneOffTasks] = useState<TaskRow[]>([]);
  const [recurringTasks, setRecurringTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const isManager = user?.role === "manager" || user?.role === "admin";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const storeFilter = activeStore?.id ?? null;
      const now = getSimulatedNow();

      let tasksQ = supabase
        .from("tasks")
        .select("id, title, status, due_date, recurrence_rule, parent_task_id, priority, recurrence_days, steps:task_steps(id, is_done)")
        .order("created_at", { ascending: false });
      if (storeFilter) tasksQ = tasksQ.eq("store_id", storeFilter);
      const { data: rawTasks } = await tasksQ;

      let incQ = supabase.from("incidents").select("id, status, created_at");
      if (storeFilter) incQ = incQ.eq("store_id", storeFilter);
      const { data: incidents } = await incQ;

      const tasks = (rawTasks ?? []) as (Omit<TaskRow, "steps_total" | "steps_done"> & { steps: { id: string; is_done: boolean }[] })[];
      const mapped: TaskRow[] = tasks.map((t) => ({
        ...t,
        steps: undefined as never,
        steps_total: t.steps?.length ?? 0,
        steps_done: t.steps?.filter((s) => s.is_done).length ?? 0,
      }));

      const done = mapped.filter((t) => t.status === "done").length;
      const openTasks = mapped.filter((t) => (t.status === "todo" || t.status === "progress") && !isEffectivelyLate(t, now)).length;
      const overdueTasks = mapped.filter((t) => t.status === "late" || isEffectivelyLate(t, now)).length;

      const inc = (incidents ?? []) as { id: string; status: string; created_at: string }[];
      const openIncidents = inc.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length;

      setStats({ todosCompleted: done, issuesCreated: inc.length, openTasks, overdueTasks, openIncidents });

      const parentIdsWithChildren = new Set(mapped.filter((t) => t.parent_task_id).map((t) => t.parent_task_id!));
      setOneOffTasks(mapped.filter((t) => !t.recurrence_rule && !parentIdsWithChildren.has(t.id) && t.status !== "cancelled").slice(0, 5));
      setRecurringTasks(mapped.filter((t) => t.recurrence_rule && !t.parent_task_id).slice(0, 5));
      setLoading(false);
    };
    load();
  }, [user, activeStore]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-10 md:px-8 md:py-14">

      {/* Hero heading */}
      <div className="mb-8 md:mb-10">
        <h1 className="text-3xl font-black tracking-tight text-foreground md:text-5xl">
          Vad ska du göra idag?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          {activeStore
            ? `${activeStore.name} — allt du behöver för butikens dagliga drift.`
            : "Allt du behöver för butikens dagliga drift — på ett ställe."}
        </p>
      </div>

      {/* Main panel — inspired by StoreSprint two-column layout */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">

        {/* Top: two-column task preview */}
        <div className="grid grid-cols-1 divide-y divide-border/60 lg:grid-cols-2 lg:divide-x lg:divide-y-0">

          {/* Left: one-off tasks */}
          <div className="p-5 md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <h2 className="text-sm font-semibold text-foreground">Uppgifter idag</h2>
              </div>
              <Link to="/uppgifter" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Se alla <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />)}
              </div>
            ) : oneOffTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="mb-2 h-7 w-7 text-success/60" />
                <p className="text-xs font-medium text-muted-foreground">Inga aktiva uppgifter</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {oneOffTasks.map((t) => <TaskPreviewRow key={t.id} task={t} />)}
              </div>
            )}
          </div>

          {/* Right: recurring */}
          <div className="p-5 md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-success" />
                <h2 className="text-sm font-semibold text-foreground">Återkommande rutiner</h2>
              </div>
              <Link to="/uppgifter" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Se alla <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />)}
              </div>
            ) : recurringTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Repeat className="mb-2 h-7 w-7 text-muted-foreground/40" />
                <p className="text-xs font-medium text-muted-foreground">Inga återkommande rutiner</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {recurringTasks.map((t) => <TaskPreviewRow key={t.id} task={t} recurring />)}
              </div>
            )}
          </div>
        </div>

        {/* Bottom stats bar */}
        {stats && (
          <div className="grid grid-cols-2 divide-x divide-y divide-border/60 border-t border-border/60 md:grid-cols-4 md:divide-y-0">
            <StatCell label="Slutförda uppgifter" value={stats.todosCompleted} icon={CheckCircle2} />
            <StatCell label="Öppna uppgifter" value={stats.openTasks} icon={ListChecks} />
            <StatCell label="Försenade" value={stats.overdueTasks} icon={Clock} urgent={stats.overdueTasks > 0} />
            <StatCell label="Öppna avvikelser" value={stats.openIncidents} icon={AlertTriangle} urgent={stats.openIncidents > 0} />
          </div>
        )}
      </div>

      {/* Quick nav cards */}
      <div className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2",
        isManager ? "lg:grid-cols-3" : "max-w-2xl"
      )}>
        <QuickCard to="/uppgifter" icon={ListChecks} title="Dagens uppgifter" desc="Rutiner, checklistor och kontroller" tone="blue" />
        <QuickCard to="/avvikelser" icon={AlertTriangle} title="Avvikelser" desc="Rapportera och följ upp ärenden" tone="amber" />
        {isManager && <QuickCard to="/rapporter" icon={BarChart3} title="Rapporter" desc="KPI:er, trender och insikter" tone="green" />}
      </div>
    </div>
  );
}

function TaskPreviewRow({ task, recurring = false }: { task: TaskRow; recurring?: boolean }) {
  const now = getSimulatedNow();
  const late = isEffectivelyLate(task, now);
  const done = task.status === "done";
  const progress = task.steps_total > 0 ? task.steps_done / task.steps_total : done ? 1 : 0;

  return (
    <Link
      to="/uppgifter"
      className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-lg"
    >
      <div className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        done ? "bg-success" : late ? "bg-destructive" : task.priority === "Kritisk" ? "bg-destructive" : "bg-border"
      )} />

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", done && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {recurring && task.recurrence_rule
            ? recurrenceLabel(task)
            : task.due_date
              ? new Date(task.due_date).toLocaleDateString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "Inget datum"
          }
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-20 shrink-0">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", done ? "bg-success" : "bg-primary")}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {done
        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        : <Circle className="h-4 w-4 shrink-0 text-border group-hover:text-muted-foreground transition-colors" />
      }
    </Link>
  );
}

function StatCell({ label, value, icon: Icon, urgent = false }: {
  label: string; value: number; icon: LucideIcon; urgent?: boolean;
}) {
  const fmt = value >= 1000 ? `${(value / 1000).toFixed(2)}k` : String(value);
  return (
    <div className="flex items-start gap-3 p-4 md:p-5">
      <div className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        urgent ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-black tracking-tight text-foreground md:text-2xl">{fmt}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight">{label}</p>
      </div>
      <TrendingUp className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
    </div>
  );
}

function QuickCard({ to, icon: Icon, title, desc, tone }: {
  to: string; icon: LucideIcon; title: string; desc: string; tone: "blue" | "amber" | "green";
}) {
  const colors = {
    blue: "bg-info/10 text-info",
    amber: "bg-warning/15 text-warning-foreground",
    green: "bg-success/10 text-success",
  };
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", colors[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
