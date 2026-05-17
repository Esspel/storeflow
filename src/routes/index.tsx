import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SquareCheck as CheckSquare, TriangleAlert as AlertTriangle, ClipboardList, Calendar, MessageSquare, TrendingUp, Users, Clock, ArrowRight, CircleCheck as CheckCircle2, Circle, CircleAlert as AlertCircle } from "lucide-react";
import { supabase, type Task, type Incident } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDate, statusColor, statusLabel, priorityColor } from "@/lib/utils";
import { getSessionToken } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (!getSessionToken()) throw redirect({ to: "/login" });
  },
  component: DashboardPage,
});

interface Stats {
  tasksTodo: number;
  tasksLate: number;
  openIncidents: number;
  criticalIncidents: number;
}

function DashboardPage() {
  const { user, activeStore } = useAuth();
  const [stats, setStats] = useState<Stats>({ tasksTodo: 0, tasksLate: 0, openIncidents: 0, criticalIncidents: 0 });
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activeStore) { setIsLoading(false); return; }
    loadDashboard(activeStore.id);

    const channel = supabase
      .channel(`dashboard-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `store_id=eq.${activeStore.id}` }, () => loadDashboard(activeStore.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents", filter: `store_id=eq.${activeStore.id}` }, () => loadDashboard(activeStore.id))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeStore]);

  async function loadDashboard(storeId: string) {
    setIsLoading(true);
    const [tasksRes, incidentsRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("store_id", storeId).in("status", ["todo", "progress", "late"]).order("created_at", { ascending: false }).limit(5),
      supabase.from("incidents").select("*").eq("store_id", storeId).in("status", ["open", "in_progress", "escalated"]).order("created_at", { ascending: false }).limit(5),
    ]);

    const tasks = (tasksRes.data ?? []) as Task[];
    const incidents = (incidentsRes.data ?? []) as Incident[];

    setRecentTasks(tasks);
    setRecentIncidents(incidents);
    setStats({
      tasksTodo: tasks.filter(t => t.status === "todo").length,
      tasksLate: tasks.filter(t => t.status === "late").length,
      openIncidents: incidents.length,
      criticalIncidents: incidents.filter(i => i.priority === "Kritisk").length,
    });
    setIsLoading(false);
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 10) return "God morgon";
    if (h < 12) return "God förmiddag";
    if (h < 17) return "God eftermiddag";
    return "God kväll";
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          {greeting()}, {user?.display_name?.split(" ")[0]}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {activeStore ? activeStore.name : "Välj en butik för att börja"}
          {" · "}{formatDate(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Uppgifter att göra"
          value={stats.tasksTodo}
          icon={<CheckSquare className="w-5 h-5" />}
          color="text-blue-600 bg-blue-50"
          to="/uppgifter"
        />
        <StatCard
          label="Försenade"
          value={stats.tasksLate}
          icon={<Clock className="w-5 h-5" />}
          color="text-red-600 bg-red-50"
          to="/uppgifter"
        />
        <StatCard
          label="Öppna avvikelser"
          value={stats.openIncidents}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="text-orange-600 bg-orange-50"
          to="/avvikelser"
        />
        <StatCard
          label="Kritiska"
          value={stats.criticalIncidents}
          icon={<AlertCircle className="w-5 h-5" />}
          color="text-red-600 bg-red-50"
          to="/avvikelser"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { to: "/uppgifter", label: "Uppgifter", icon: CheckSquare, desc: "Hantera dagens uppgifter" },
          { to: "/avvikelser", label: "Avvikelser", icon: AlertTriangle, desc: "Rapportera avvikelser" },
          { to: "/kundrunda", label: "Kundrunda", icon: ClipboardList, desc: "Starta en kundrundan" },
          { to: "/schema", label: "Schema", icon: Calendar, desc: "Se veckans schema" },
          { to: "/moten", label: "Möten", icon: MessageSquare, desc: "Planera och dokumentera" },
          { to: "/rapporter", label: "Rapporter", icon: TrendingUp, desc: "Analysera prestanda" },
        ].map(item => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all group"
            >
              <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Icon className="w-4.5 h-4.5 text-primary group-hover:text-primary-foreground transition-colors" />
              </div>
              <p className="font-semibold text-sm text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </Link>
          );
        })}
      </div>

      {/* Recent tasks + incidents */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Tasks */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">Senaste uppgifter</h3>
            <Link to="/uppgifter" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Visa alla <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {isLoading ? (
              <LoadingRows count={3} />
            ) : recentTasks.length === 0 ? (
              <EmptyState message="Inga aktiva uppgifter" />
            ) : (
              recentTasks.map(task => (
                <div key={task.id} className="px-4 py-3 flex items-center gap-3">
                  {task.status === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : task.status === "late" ? (
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.category}</p>
                  </div>
                  <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", statusColor(task.status))}>
                    {statusLabel(task.status)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Incidents */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">Öppna avvikelser</h3>
            <Link to="/avvikelser" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Visa alla <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {isLoading ? (
              <LoadingRows count={3} />
            ) : recentIncidents.length === 0 ? (
              <EmptyState message="Inga öppna avvikelser" />
            ) : (
              recentIncidents.map(inc => (
                <div key={inc.id} className="px-4 py-3 flex items-center gap-3">
                  <AlertTriangle className={cn("w-4 h-4 shrink-0",
                    inc.priority === "Kritisk" ? "text-destructive" : "text-warning-foreground"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inc.title}</p>
                    <p className="text-xs text-muted-foreground">{inc.ref_number}</p>
                  </div>
                  <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", priorityColor(inc.priority))}>
                    {inc.priority}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, to }: { label: string; value: number; icon: React.ReactNode; color: string; to: string }) {
  return (
    <Link to={to} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-2", color)}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Link>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
          <div className="w-4 h-4 rounded-full bg-muted shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-muted rounded w-3/4" />
            <div className="h-2.5 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 text-center text-sm text-muted-foreground">{message}</div>
  );
}
