import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, TrendingUp } from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase, type Task, type Incident, type Store as StoreType } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/rapporter")({
  component: ReportsPage,
});

type StoreStat = {
  store: StoreType;
  tasksDone: number;
  tasksMissed: number;
  tasksTotal: number;
  incidentsOpen: number;
  incidentsResolved: number;
};

function ReportsPage() {
  const { user, activeStore, userStores } = useAuth();
  const isAdmin = user?.role === "admin";

  if (user && user.role === "employee") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-5 py-20 text-center">
        <p className="text-sm font-medium text-muted-foreground">Du har inte behörighet att se rapporter.</p>
      </div>
    );
  }

  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const load = async () => {
      let tQ = supabase.from("tasks").select("*");
      let iQ = supabase.from("incidents").select("*");

      if (!isAdmin && activeStore) {
        tQ = tQ.eq("store_id", activeStore.id);
        iQ = iQ.eq("store_id", activeStore.id);
      } else if (!isAdmin && userStores.length > 0) {
        const ids = userStores.map((s) => s.id);
        tQ = tQ.in("store_id", ids);
        iQ = iQ.in("store_id", ids);
      }

      if (dateFrom) {
        tQ = tQ.gte("created_at", dateFrom);
        iQ = iQ.gte("created_at", dateFrom);
      }
      if (dateTo) {
        tQ = tQ.lte("created_at", dateTo + "T23:59:59");
        iQ = iQ.lte("created_at", dateTo + "T23:59:59");
      }

      const [tasksRes, incidentsRes, storesRes] = await Promise.all([
        tQ,
        iQ,
        isAdmin
          ? supabase.from("stores").select("*").eq("is_active", true)
          : supabase.from("stores").select("*").in("id", userStores.map((s) => s.id)),
      ]);

      setTasks((tasksRes.data ?? []) as Task[]);
      setIncidents((incidentsRes.data ?? []) as Incident[]);
      setStores((storesRes.data ?? []) as StoreType[]);
      setLoading(false);
    };
    load();
  }, [activeStore, user, dateFrom, dateTo]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const missedTasks = tasks.filter((t) => t.status === "late").length;
  const openIncidents = incidents.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length;
  const compliance = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const storeStats: StoreStat[] = stores.map((store) => {
    const st = tasks.filter((t) => t.store_id === store.id);
    const si = incidents.filter((i) => i.store_id === store.id);
    return {
      store,
      tasksDone: st.filter((t) => t.status === "done").length,
      tasksMissed: st.filter((t) => t.status === "late").length,
      tasksTotal: st.length,
      incidentsOpen: si.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length,
      incidentsResolved: si.filter((i) => i.status === "resolved").length,
    };
  });

  function exportCSV() {
    const rows = [
      ["Butik", "Uppgifter totalt", "Klara", "Missade", "Compliance %", "Öppna avv.", "Lösta avv."],
      ...storeStats.map((s) => [
        s.store.name,
        s.tasksTotal,
        s.tasksDone,
        s.tasksMissed,
        s.tasksTotal > 0 ? Math.round((s.tasksDone / s.tasksTotal) * 100) : 0,
        s.incidentsOpen,
        s.incidentsResolved,
      ]),
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storeflow-rapport-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Rapporter"
        description="KPI:er, trender och insikter."
        actions={
          <Button variant="outline" className="rounded-full" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" /> Exportera CSV
          </Button>
        }
      />

      {/* Date filter */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Från</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40 rounded-full text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Till</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40 rounded-full text-sm" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => { setDateFrom(""); setDateTo(""); }}>
            Rensa filter
          </Button>
        )}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Compliance" value={`${compliance}%`} tone={compliance >= 80 ? "success" : "warning"} />
        <StatCard label="Klara uppgifter" value={`${doneTasks}/${totalTasks}`} tone="default" />
        <StatCard label="Missade uppgifter" value={missedTasks} tone={missedTasks > 0 ? "destructive" : "default"} />
        <StatCard label="Öppna avvikelser" value={openIncidents} tone={openIncidents > 0 ? "warning" : "default"} />
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : (
        <Tabs defaultValue="stores">
          <TabsList className="rounded-full bg-muted/60 p-1">
            <TabsTrigger value="stores" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Per butik</TabsTrigger>
            <TabsTrigger value="tasks" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Uppgifter</TabsTrigger>
            <TabsTrigger value="incidents" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Avvikelser</TabsTrigger>
          </TabsList>

          <TabsContent value="stores" className="mt-6">
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground">Butik</th>
                    <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Uppgifter</th>
                    <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Compliance</th>
                    <th className="hidden px-5 py-3.5 text-center text-xs font-medium text-muted-foreground md:table-cell">Missade</th>
                    <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Öppna avv.</th>
                    <th className="hidden px-5 py-3.5 text-center text-xs font-medium text-muted-foreground sm:table-cell">Lösta avv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {storeStats.map(({ store, tasksDone, tasksMissed, tasksTotal, incidentsOpen, incidentsResolved }) => {
                    const comp = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
                    return (
                      <tr key={store.id} className="hover:bg-muted/30">
                        <td className="px-5 py-3.5 font-medium">{store.name}</td>
                        <td className="px-5 py-3.5 text-center">{tasksDone}/{tasksTotal}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`font-semibold ${comp >= 80 ? "text-success" : comp >= 60 ? "text-warning-foreground" : "text-destructive"}`}>
                            {comp}%
                          </span>
                        </td>
                        <td className="hidden px-5 py-3.5 text-center text-muted-foreground md:table-cell">{tasksMissed}</td>
                        <td className="px-5 py-3.5 text-center">{incidentsOpen > 0 ? <span className="text-destructive font-medium">{incidentsOpen}</span> : 0}</td>
                        <td className="hidden px-5 py-3.5 text-center text-muted-foreground sm:table-cell">{incidentsResolved}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="mt-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Ej påbörjad", value: tasks.filter(t => t.status === "todo").length, cls: "text-muted-foreground" },
                { label: "Pågående", value: tasks.filter(t => t.status === "progress").length, cls: "text-info" },
                { label: "Klara", value: tasks.filter(t => t.status === "done").length, cls: "text-success" },
                { label: "Försenade", value: tasks.filter(t => t.status === "late").length, cls: "text-destructive" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="rounded-2xl bg-card p-5 text-center shadow-[var(--shadow-sm)]">
                  <p className={`text-2xl font-black ${cls}`}>{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
              {Object.entries(
                tasks.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + 1; return acc; }, {} as Record<string, number>)
              ).map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-sm)]">
                  <span className="text-sm font-medium">{cat}</span>
                  <span className="text-sm font-semibold text-primary">{count}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="incidents" className="mt-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Ny", value: incidents.filter(i => i.status === "open").length, cls: "text-muted-foreground" },
                { label: "Pågår", value: incidents.filter(i => i.status === "in_progress").length, cls: "text-info" },
                { label: "Eskalerad", value: incidents.filter(i => i.status === "escalated").length, cls: "text-destructive" },
                { label: "Löst", value: incidents.filter(i => i.status === "resolved").length, cls: "text-success" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="rounded-2xl bg-card p-5 text-center shadow-[var(--shadow-sm)]">
                  <p className={`text-2xl font-black ${cls}`}>{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              {["Låg", "Medel", "Hög", "Kritisk"].map((prio) => (
                <div key={prio} className="flex items-center justify-between rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-sm)]">
                  <span className="text-sm font-medium">{prio}</span>
                  <span className="text-sm font-semibold text-primary">{incidents.filter(i => i.priority === prio).length}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
