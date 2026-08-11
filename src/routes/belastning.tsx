import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChartBar as BarChart2, CircleCheck as CheckCircle2, Clock, RefreshCw, TriangleAlert as AlertTriangle, Users } from "lucide-react";
import { supabase, type AppUser } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/belastning")({
  component: BelastningPage,
});

type UserLoad = {
  user: AppUser;
  todo: number;
  progress: number;
  done: number;
  late: number;
  total: number;
};

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function weekLabel() {
  const { start, end } = getWeekBounds();
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `V${getWeekNumber(start)} · ${start.toLocaleDateString("sv-SE", opts)} – ${end.toLocaleDateString("sv-SE", opts)}`;
}

function getWeekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function LoadBar({ todo, progress, done, late, total }: { todo: number; progress: number; done: number; late: number; total: number }) {
  if (total === 0) return <div className="h-2 w-full rounded-full bg-muted" />;
  const donePct = (done / total) * 100;
  const progPct = (progress / total) * 100;
  const latePct = (late / total) * 100;
  const todoPct = (todo / total) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="bg-success transition-all" style={{ width: `${donePct}%` }} />
      <div className="bg-info transition-all" style={{ width: `${progPct}%` }} />
      <div className="bg-destructive transition-all" style={{ width: `${latePct}%` }} />
      <div className="bg-muted-foreground/30 transition-all" style={{ width: `${todoPct}%` }} />
    </div>
  );
}

function BelastningPage() {
  const { activeStore, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;

  const [loads, setLoads] = useState<UserLoad[]>([]);
  const [unassigned, setUnassigned] = useState({ todo: 0, progress: 0, done: 0, late: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStore) { setLoading(false); return; }
    fetchData();
  }, [activeStore]);

  const fetchData = async () => {
    if (!activeStore) return;
    setLoading(true);

    const { start, end } = getWeekBounds();
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    // Fetch all store users
    const { data: userStoreRows } = await supabase
      .from("user_stores")
      .select("user:app_users(*)")
      .eq("store_id", activeStore.id);

    const storeUsers = ((userStoreRows ?? []) as unknown as { user: AppUser }[])
      .map((r) => r.user)
      .filter((u) => u?.is_active);

    // Fetch tasks for this week for the store (direct assigned_to)
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id,status,assigned_to,due_date")
      .eq("store_id", activeStore.id)
      .not("status", "eq", "cancelled")
      .gte("due_date", startStr)
      .lte("due_date", endStr);

    // Also fetch task_assignees for multi-assign tasks
    const taskIds = (tasks ?? []).map((t) => t.id);
    let assigneeRows: { task_id: string; user_id: string | null }[] = [];
    if (taskIds.length > 0) {
      const { data: ar } = await supabase
        .from("task_assignees")
        .select("task_id,user_id")
        .in("task_id", taskIds)
        .not("user_id", "is", null);
      assigneeRows = (ar ?? []) as { task_id: string; user_id: string | null }[];
    }

    // Build map: userId → { todo, progress, done, late }
    const userMap = new Map<string, { todo: number; progress: number; done: number; late: number }>();
    const init = () => ({ todo: 0, progress: 0, done: 0, late: 0 });

    for (const t of tasks ?? []) {
      // Direct assignment
      if (t.assigned_to) {
        if (!userMap.has(t.assigned_to)) userMap.set(t.assigned_to, init());
        const entry = userMap.get(t.assigned_to)!;
        (entry as Record<string, number>)[t.status as string] = ((entry as Record<string, number>)[t.status as string] ?? 0) + 1;
      }
      // Multi-assign
      const extras = assigneeRows.filter((a) => a.task_id === t.id && a.user_id && a.user_id !== t.assigned_to);
      for (const a of extras) {
        const uid = a.user_id!;
        if (!userMap.has(uid)) userMap.set(uid, init());
        const entry = userMap.get(uid)!;
        (entry as Record<string, number>)[t.status as string] = ((entry as Record<string, number>)[t.status as string] ?? 0) + 1;
      }
    }

    // Unassigned tasks
    const unassignedTasks = (tasks ?? []).filter(
      (t) => !t.assigned_to && !assigneeRows.some((a) => a.task_id === t.id),
    );
    const unasgn = init();
    for (const t of unassignedTasks) {
      (unasgn as Record<string, number>)[t.status as string] = ((unasgn as Record<string, number>)[t.status as string] ?? 0) + 1;
    }
    setUnassigned({
      ...unasgn,
      total: unasgn.todo + unasgn.progress + unasgn.done + unasgn.late,
    });

    // Build loads sorted by total desc
    const result: UserLoad[] = storeUsers
      .map((u) => {
        const counts = userMap.get(u.id) ?? init();
        return {
          user: u,
          ...counts,
          total: counts.todo + counts.progress + counts.done + counts.late,
        };
      })
      .sort((a, b) => b.total - a.total);

    setLoads(result);
    setLoading(false);
  };

  const maxTotal = Math.max(1, ...loads.map((l) => l.total));

  if (!isManager) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
        <PageHeader title="Medarbetarbelastning" description="Uppgifter per person denna vecka" />
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-24 text-center">
          <div>
            <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-foreground">Åtkomst nekad</p>
            <p className="mt-1 text-sm text-muted-foreground">Endast chefer och admins kan se denna vy.</p>
          </div>
        </div>
      </div>
    );
  }

  const totalTasks = loads.reduce((s, l) => s + l.total, 0) + unassigned.total;
  const totalDone = loads.reduce((s, l) => s + l.done, 0) + unassigned.done;
  const totalLate = loads.reduce((s, l) => s + l.late, 0) + unassigned.late;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Medarbetarbelastning"
        description={weekLabel()}
        actions={
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Uppdatera
          </Button>
        }
      />

      {/* Summary stats */}
      {!loading && loads.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Totalt" value={totalTasks} tone="default" />
          <StatCard label="Klara" value={totalDone} tone="success" />
          <StatCard label="Sena" value={totalLate} tone="destructive" />
          <StatCard label="Personal" value={loads.length} tone="default" />
        </div>
      )}

      <div>
        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-success" /><span>Klar</span></div>
          <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-info" /><span>Pågår</span></div>
          <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-destructive" /><span>Sen</span></div>
          <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" /><span>Att göra</span></div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : loads.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-24 text-center">
            <BarChart2 className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-foreground">Inga uppgifter denna vecka</p>
            <p className="mt-1 text-sm text-muted-foreground">Inga uppgifter med förfallodatum i veckan hittades.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {loads.map((load) => {
              const completionPct = load.total > 0 ? Math.round((load.done / load.total) * 100) : 0;
              const relativeWidth = Math.round((load.total / maxTotal) * 100);
              return (
                <div
                  key={load.user.id}
                  className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {load.user.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{load.user.display_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{load.user.role === "admin" ? "Admin" : load.user.role === "manager" ? "Chef" : "Anställd"}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-bold tabular-nums text-foreground">{load.total}</p>
                      <p className="text-xs text-muted-foreground">uppgifter</p>
                    </div>
                  </div>

                  {/* Relative width bar */}
                  <div className="mb-2">
                    <div style={{ width: `${relativeWidth}%` }}>
                      <LoadBar
                        todo={load.todo}
                        progress={load.progress}
                        done={load.done}
                        late={load.late}
                        total={load.total}
                      />
                    </div>
                  </div>

                  {/* Counts */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {load.done > 0 && (
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-3 w-3" />{load.done} klara
                      </span>
                    )}
                    {load.progress > 0 && (
                      <span className="flex items-center gap-1 text-info">
                        <Clock className="h-3 w-3" />{load.progress} pågår
                      </span>
                    )}
                    {load.late > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" />{load.late} sena
                      </span>
                    )}
                    {load.todo > 0 && (
                      <span>{load.todo} att göra</span>
                    )}
                    {load.total === 0 && (
                      <span className="italic">Inga uppgifter denna vecka</span>
                    )}
                  </div>

                  {load.total > 0 && (
                    <div className="mt-2 flex items-center justify-between">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${completionPct}%` }} />
                      </div>
                      <span className="ml-3 shrink-0 text-xs font-medium text-muted-foreground">{completionPct}% klar</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned */}
            {unassigned.total > 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
                      ?
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Ej tilldelade</p>
                      <p className="text-xs text-muted-foreground">Uppgifter utan ansvarig</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-muted-foreground">{unassigned.total}</p>
                </div>
                <LoadBar {...unassigned} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
