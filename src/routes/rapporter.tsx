import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase, type Task, type Incident } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/rapporter")({
  component: ReportsPage,
});

function ReportsPage() {
  const { user, activeStore } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  if (user && user.role === "employee") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-5 py-20 text-center">
        <p className="text-sm font-medium text-muted-foreground">Du har inte behörighet att se rapporter.</p>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Always filter strictly by activeStore — no fallback to multi-store
      if (!activeStore) {
        setTasks([]);
        setIncidents([]);
        setLoading(false);
        return;
      }

      let tQ = supabase.from("tasks").select("*").eq("store_id", activeStore.id);
      let iQ = supabase.from("incidents").select("*").eq("store_id", activeStore.id);

      if (dateFrom) {
        tQ = tQ.gte("created_at", dateFrom);
        iQ = iQ.gte("created_at", dateFrom);
      }
      if (dateTo) {
        tQ = tQ.lte("created_at", dateTo + "T23:59:59");
        iQ = iQ.lte("created_at", dateTo + "T23:59:59");
      }

      const [tasksRes, incidentsRes] = await Promise.all([tQ, iQ]);

      setTasks((tasksRes.data ?? []) as Task[]);
      setIncidents((incidentsRes.data ?? []) as Incident[]);
      setLoading(false);
    };
    load();
  }, [activeStore, user, dateFrom, dateTo]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const missedTasks = tasks.filter((t) => t.status === "late").length;
  const openIncidents = incidents.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length;
  const compliance = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  function exportTasksCSV() {
    const rows = [
      ["Titel", "Kategori", "Prioritet", "Status", "Förfallodatum", "Skapad"],
      ...tasks.map((t) => [
        t.title,
        t.category,
        t.priority,
        t.status,
        t.due_date ? new Date(t.due_date).toLocaleDateString("sv-SE") : "",
        new Date(t.created_at).toLocaleDateString("sv-SE"),
      ]),
    ];
    downloadCSV(rows, `uppgifter-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function exportIncidentsCSV() {
    const rows = [
      ["Ref", "Titel", "Kategori", "Prioritet", "Status", "Skapad"],
      ...incidents.map((i) => [
        i.ref_number,
        i.title,
        i.category,
        i.priority,
        i.status,
        new Date(i.created_at).toLocaleDateString("sv-SE"),
      ]),
    ];
    downloadCSV(rows, `avvikelser-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function downloadCSV(rows: (string | number)[][], filename: string) {
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!activeStore) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-5 py-20 text-center">
        <p className="text-sm font-medium text-muted-foreground">Välj en butik för att se rapporter.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Rapporter"
        description={`KPI:er och insikter för ${activeStore.name}.`}
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
        <Tabs defaultValue="tasks">
          <TabsList className="rounded-full bg-muted/60 p-1">
            <TabsTrigger value="tasks" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Uppgifter</TabsTrigger>
            <TabsTrigger value="incidents" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Avvikelser</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-6">
            <div className="mb-3 flex justify-end">
              <Button variant="outline" size="sm" className="rounded-full" onClick={exportTasksCSV}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Exportera CSV
              </Button>
            </div>
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
            {tasks.length > 0 && (
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
            )}
            {tasks.length === 0 && (
              <p className="mt-8 text-center text-sm text-muted-foreground">Inga uppgifter för vald period.</p>
            )}
          </TabsContent>

          <TabsContent value="incidents" className="mt-6">
            <div className="mb-3 flex justify-end">
              <Button variant="outline" size="sm" className="rounded-full" onClick={exportIncidentsCSV}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Exportera CSV
              </Button>
            </div>
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
            {incidents.length === 0 && (
              <p className="mt-8 text-center text-sm text-muted-foreground">Inga avvikelser för vald period.</p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
