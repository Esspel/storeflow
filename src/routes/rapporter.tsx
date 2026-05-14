import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TriangleAlert as AlertTriangle, ChartBar as BarChart3, CircleCheck as CheckCircle2, ListChecks, Store, TrendingUp } from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase, type Task, type Incident, type Store as StoreType } from "@/lib/supabase";

export const Route = createFileRoute("/rapporter")({
  component: ReportsPage,
});

type StoreStat = {
  store: StoreType;
  tasksDone: number;
  tasksTodo: number;
  tasksTotal: number;
  incidentsOpen: number;
  incidentsResolved: number;
};

function ReportsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("tasks").select("*"),
      supabase.from("incidents").select("*"),
      supabase.from("stores").select("*").eq("is_active", true),
    ]).then(([tasksRes, incidentsRes, storesRes]) => {
      setTasks((tasksRes.data ?? []) as Task[]);
      setIncidents((incidentsRes.data ?? []) as Incident[]);
      setStores((storesRes.data ?? []) as StoreType[]);
      setLoading(false);
    });
  }, []);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const lateTasks = tasks.filter((t) => t.status === "late").length;
  const openIncidents = incidents.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length;
  const resolvedIncidents = incidents.filter((i) => i.status === "resolved").length;
  const compliance = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const storeStats: StoreStat[] = stores.map((store) => {
    const storeTasks = tasks.filter((t) => t.store_id === store.id);
    const storeIncidents = incidents.filter((i) => i.store_id === store.id);
    return {
      store,
      tasksDone: storeTasks.filter((t) => t.status === "done").length,
      tasksTodo: storeTasks.filter((t) => t.status !== "done").length,
      tasksTotal: storeTasks.length,
      incidentsOpen: storeIncidents.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length,
      incidentsResolved: storeIncidents.filter((i) => i.status === "resolved").length,
    };
  });

  const priorityCounts = {
    Kritisk: incidents.filter((i) => i.priority === "Kritisk").length,
    Hög: incidents.filter((i) => i.priority === "Hög").length,
    Medel: incidents.filter((i) => i.priority === "Medel").length,
    Låg: incidents.filter((i) => i.priority === "Låg").length,
  };

  const categoryMap = new Map<string, number>();
  for (const t of tasks) {
    const cat = t.category || "Övrigt";
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
  }
  const categoryStats = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Rapporter & Analys"
        description="Nyckeltal och prestanda för hela kedjan."
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Compliance" value={`${compliance}%`} delta={compliance >= 80 ? "Bra nivå" : "Under mål"} icon={TrendingUp} tone={compliance >= 80 ? "success" : "warning"} />
            <StatCard label="Uppgifter klara" value={`${doneTasks}/${totalTasks}`} hint="totalt" icon={CheckCircle2} tone="info" />
            <StatCard label="Försenade" value={String(lateTasks)} hint="uppgifter" icon={ListChecks} tone="warning" />
            <StatCard label="Öppna avvikelser" value={String(openIncidents)} hint={`${resolvedIncidents} lösta`} icon={AlertTriangle} tone={openIncidents > 5 ? "destructive" : "default"} />
          </div>

          <div className="mt-8">
            <Tabs defaultValue="stores">
              <TabsList className="rounded-full bg-muted/60 p-1">
                <TabsTrigger value="stores" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Per butik
                </TabsTrigger>
                <TabsTrigger value="tasks" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Uppgifter
                </TabsTrigger>
                <TabsTrigger value="incidents" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Avvikelser
                </TabsTrigger>
              </TabsList>

              <TabsContent value="stores" className="mt-4">
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground">Butik</th>
                        <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Uppgifter klara</th>
                        <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Compliance</th>
                        <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Öppna avvikelser</th>
                        <th className="hidden px-5 py-3.5 text-center text-xs font-medium text-muted-foreground md:table-cell">Lösta avvikelser</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {storeStats.map(({ store, tasksDone, tasksTotal, incidentsOpen, incidentsResolved }) => {
                        const storeCompliance = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : null;
                        return (
                          <tr key={store.id} className="hover:bg-muted/30">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                                  <Store className="h-3.5 w-3.5" />
                                </div>
                                <div>
                                  <p className="font-medium">{store.name}</p>
                                  <p className="text-xs text-muted-foreground">{store.region}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              {tasksTotal > 0 ? `${tasksDone}/${tasksTotal}` : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              {storeCompliance !== null ? (
                                <span className={storeCompliance >= 80 ? "font-medium text-success" : "font-medium text-warning"}>
                                  {storeCompliance}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              {incidentsOpen > 0 ? (
                                <span className="font-medium text-destructive">{incidentsOpen}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="hidden px-5 py-3.5 text-center text-muted-foreground md:table-cell">
                              {incidentsResolved}
                            </td>
                          </tr>
                        );
                      })}
                      {storeStats.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">
                            Ingen data tillgänglig
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="tasks" className="mt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
                    <h3 className="mb-4 font-semibold">Status fördelning</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Ej påbörjad", count: tasks.filter((t) => t.status === "todo").length, color: "bg-muted" },
                        { label: "Pågående", count: tasks.filter((t) => t.status === "progress").length, color: "bg-info/60" },
                        { label: "Klar", count: tasks.filter((t) => t.status === "done").length, color: "bg-success/60" },
                        { label: "Försenad", count: tasks.filter((t) => t.status === "late").length, color: "bg-destructive/60" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="flex items-center gap-3">
                          <div className="w-24 text-sm text-muted-foreground">{label}</div>
                          <div className="flex-1 overflow-hidden rounded-full bg-muted/40">
                            <div
                              className={`h-2 rounded-full ${color}`}
                              style={{ width: totalTasks > 0 ? `${(count / totalTasks) * 100}%` : "0%" }}
                            />
                          </div>
                          <span className="w-8 text-right text-sm font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
                    <h3 className="mb-4 font-semibold">Kategorier</h3>
                    {categoryStats.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Inga uppgifter ännu</p>
                    ) : (
                      <div className="space-y-3">
                        {categoryStats.map(([cat, count]) => (
                          <div key={cat} className="flex items-center gap-3">
                            <div className="flex-1 text-sm">{cat}</div>
                            <div className="w-24 overflow-hidden rounded-full bg-muted/40">
                              <div
                                className="h-2 rounded-full bg-primary/60"
                                style={{ width: `${(count / totalTasks) * 100}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-sm font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="incidents" className="mt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
                    <h3 className="mb-4 font-semibold">Prioritetsfördelning</h3>
                    <div className="space-y-3">
                      {Object.entries(priorityCounts).map(([prio, count]) => (
                        <div key={prio} className="flex items-center gap-3">
                          <div className="w-20 text-sm text-muted-foreground">{prio}</div>
                          <div className="flex-1 overflow-hidden rounded-full bg-muted/40">
                            <div
                              className={`h-2 rounded-full ${
                                prio === "Kritisk" ? "bg-destructive/70"
                                  : prio === "Hög" ? "bg-warning/70"
                                  : prio === "Medel" ? "bg-info/70"
                                  : "bg-muted-foreground/40"
                              }`}
                              style={{ width: incidents.length > 0 ? `${(count / incidents.length) * 100}%` : "0%" }}
                            />
                          </div>
                          <span className="w-8 text-right text-sm font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
                    <h3 className="mb-4 font-semibold">Status</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Ny", count: incidents.filter((i) => i.status === "open").length },
                        { label: "Pågår", count: incidents.filter((i) => i.status === "in_progress").length },
                        { label: "Eskalerad", count: incidents.filter((i) => i.status === "escalated").length },
                        { label: "Löst", count: incidents.filter((i) => i.status === "resolved").length },
                        { label: "Stängt", count: incidents.filter((i) => i.status === "closed").length },
                      ].map(({ label, count }) => (
                        <div key={label} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 border-t border-border/60 pt-4 flex items-center justify-between text-sm">
                      <span className="font-medium">Totalt</span>
                      <span className="font-semibold">{incidents.length}</span>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}
    </div>
  );
}
