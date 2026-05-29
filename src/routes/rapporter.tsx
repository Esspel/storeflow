import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, ShoppingCart, ClipboardCheck, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, ChartBar as BarChart2 } from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase, type Task, type Incident } from "@/lib/supabase";
import { dedupRecurringSeries } from "@/lib/task-utils";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rapporter")({
  component: ReportsPage,
});

// Coop-specific category labels and colors
const CATEGORY_CONFIG: Record<string, { color: string }> = {
  "HACCP":             { color: "text-destructive" },
  "Livsmedelssäkerhet":{ color: "text-destructive" },
  "Kyl/Frys":          { color: "text-info" },
  "Varmkök":           { color: "text-warning-foreground" },
  "Drift":             { color: "text-primary" },
  "Lager":             { color: "text-primary" },
  "Personal":          { color: "text-success" },
  "Arbetsmiljö":       { color: "text-warning-foreground" },
  "Ekonomi":           { color: "text-success" },
  "Kassa":             { color: "text-success" },
  "Rengöring":         { color: "text-muted-foreground" },
  "Städning":          { color: "text-muted-foreground" },
  "Varupåfyllning":    { color: "text-info" },
};

type KundrunSummary = {
  id: string;
  completed_at: string | null;
  status: string;
  started_at: string;
  zone_defects: number;
  zone_oks: number;
  conducted_by_name: string | null;
};

function ReportsPage() {
  const { user, activeStore } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role === "employee") navigate({ to: "/" });
  }, [user]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [kundrunSessions, setKundrunSessions] = useState<KundrunSummary[]>([]);
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

      if (!activeStore) {
        setTasks([]);
        setIncidents([]);
        setKundrunSessions([]);
        setLoading(false);
        return;
      }

      let tQ = supabase.from("tasks").select("*").eq("store_id", activeStore.id);
      let iQ = supabase.from("incidents").select("*").eq("store_id", activeStore.id);
      let kQ = supabase
        .from("kundrunda_sessions")
        .select("id, status, started_at, completed_at, conducted_by")
        .eq("store_id", activeStore.id)
        .order("started_at", { ascending: false });

      if (dateFrom) {
        tQ = tQ.gte("created_at", dateFrom);
        iQ = iQ.gte("created_at", dateFrom);
        kQ = kQ.gte("started_at", dateFrom);
      }
      if (dateTo) {
        tQ = tQ.lte("created_at", dateTo + "T23:59:59");
        iQ = iQ.lte("created_at", dateTo + "T23:59:59");
        kQ = kQ.lte("started_at", dateTo + "T23:59:59");
      }

      const [tasksRes, incidentsRes, kundrunRes] = await Promise.all([tQ, iQ, kQ]);

      setTasks((tasksRes.data ?? []) as Task[]);
      setIncidents((incidentsRes.data ?? []) as Incident[]);

      // Enrich kundrunda sessions with response counts
      const sessions = kundrunRes.data ?? [];
      if (sessions.length > 0) {
        const sessionIds = sessions.map((s: { id: string }) => s.id);
        const { data: responses } = await supabase
          .from("kundrunda_responses")
          .select("session_id, result")
          .in("session_id", sessionIds);

        // Get user names
        const userIds = [...new Set(sessions.map((s: { conducted_by: string | null }) => s.conducted_by).filter(Boolean))] as string[];
        const { data: users } = userIds.length > 0
          ? await supabase.from("app_users").select("id, display_name").in("id", userIds)
          : { data: [] };
        const userMap = Object.fromEntries((users ?? []).map((u: { id: string; display_name: string }) => [u.id, u.display_name]));

        const enriched: KundrunSummary[] = sessions.map((s: { id: string; status: string; started_at: string; completed_at: string | null; conducted_by: string | null }) => {
          const sResponses = (responses ?? []).filter((r: { session_id: string }) => r.session_id === s.id);
          return {
            id: s.id,
            status: s.status,
            started_at: s.started_at,
            completed_at: s.completed_at,
            zone_defects: sResponses.filter((r: { result: string }) => r.result === "avvikelse").length,
            zone_oks: sResponses.filter((r: { result: string }) => r.result === "ok").length,
            conducted_by_name: userMap[s.conducted_by ?? ""] ?? null,
          };
        });
        setKundrunSessions(enriched);
      } else {
        setKundrunSessions([]);
      }

      setLoading(false);
    };
    load();
  }, [activeStore, user, dateFrom, dateTo]);

  const { dedupedTasks, doneTasks, missedTasks } = useMemo(() => {
    const deduped = dedupRecurringSeries(tasks);
    let doneTasks = 0, missedTasks = 0;
    for (const t of deduped) {
      if (t.status === "done") doneTasks++;
      else if (t.status === "late") missedTasks++;
    }
    return { dedupedTasks: deduped, doneTasks, missedTasks };
  }, [tasks]);

  const totalTasks = dedupedTasks.length;
  const openIncidents = incidents.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length;
  const compliance = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const completedRundor = kundrunSessions.filter(s => s.status === "completed").length;
  const totalDefects = kundrunSessions.reduce((sum, s) => sum + s.zone_defects, 0);
  const avgDefectsPerRunda = completedRundor > 0 ? (totalDefects / completedRundor).toFixed(1) : "0";

  function exportTasksCSV() {
    const rows = [
      ["Titel", "Kategori", "Prioritet", "Status", "Förfallodatum", "Skapad"],
      ...tasks.map((t) => [
        t.title, t.category, t.priority, t.status,
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
        i.ref_number, i.title, i.category, i.priority, i.status,
        new Date(i.created_at).toLocaleDateString("sv-SE"),
      ]),
    ];
    downloadCSV(rows, `avvikelser-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function exportKundrunCSV() {
    const rows = [
      ["Datum", "Utförd av", "Status", "OK-svar", "Avvikelser"],
      ...kundrunSessions.map((s) => [
        new Date(s.started_at).toLocaleDateString("sv-SE"),
        s.conducted_by_name ?? "",
        s.status === "completed" ? "Genomförd" : s.status === "in_progress" ? "Pågår" : s.status,
        s.zone_oks,
        s.zone_defects,
      ]),
    ];
    downloadCSV(rows, `kundrunda-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`);
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
        actions={
          <Link to="/belastning">
            <Button variant="outline" size="sm" className="rounded-full gap-1.5">
              <BarChart2 className="h-4 w-4" />
              Belastning
            </Button>
          </Link>
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
        <Tabs defaultValue="tasks">
          <TabsList className="rounded-full bg-muted/60 p-1">
            <TabsTrigger value="tasks" className="rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm">Uppgifter</TabsTrigger>
            <TabsTrigger value="incidents" className="rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm">Avvikelser</TabsTrigger>
            <TabsTrigger value="kundrunda" className="rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm">Kundrundan</TabsTrigger>
          </TabsList>

          {/* UPPGIFTER */}
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
                ).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-sm)]">
                    <span className={cn("text-sm font-medium", CATEGORY_CONFIG[cat]?.color ?? "text-foreground")}>{cat}</span>
                    <span className="text-sm font-semibold text-primary">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {tasks.length === 0 && (
              <p className="mt-8 text-center text-sm text-muted-foreground">Inga uppgifter för vald period.</p>
            )}
          </TabsContent>

          {/* AVVIKELSER */}
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
            {incidents.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                {Object.entries(
                  incidents.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {} as Record<string, number>)
                ).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-sm)]">
                    <span className={cn("text-sm font-medium", CATEGORY_CONFIG[cat]?.color ?? "text-foreground")}>{cat}</span>
                    <span className="text-sm font-semibold text-primary">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {incidents.length === 0 && (
              <p className="mt-8 text-center text-sm text-muted-foreground">Inga avvikelser för vald period.</p>
            )}
          </TabsContent>

          {/* KUNDRUNDAN */}
          <TabsContent value="kundrunda" className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Genomförda kundrundesessioner och avvikelseutfall.
              </p>
              {kundrunSessions.length > 0 && (
                <Button variant="outline" size="sm" className="rounded-full" onClick={exportKundrunCSV}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Exportera CSV
                </Button>
              )}
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-card p-5 text-center shadow-[var(--shadow-sm)]">
                <p className="text-2xl font-black text-success">{completedRundor}</p>
                <p className="mt-1 text-xs text-muted-foreground">Genomförda rundor</p>
              </div>
              <div className="rounded-2xl bg-card p-5 text-center shadow-[var(--shadow-sm)]">
                <p className="text-2xl font-black text-warning-foreground">{totalDefects}</p>
                <p className="mt-1 text-xs text-muted-foreground">Totalt antal avvikelser</p>
              </div>
              <div className="rounded-2xl bg-card p-5 text-center shadow-[var(--shadow-sm)]">
                <p className="text-2xl font-black text-info">{avgDefectsPerRunda}</p>
                <p className="mt-1 text-xs text-muted-foreground">Snitt avvikelser/runda</p>
              </div>
              <div className="rounded-2xl bg-card p-5 text-center shadow-[var(--shadow-sm)]">
                <p className="text-2xl font-black text-muted-foreground">
                  {kundrunSessions.filter(s => s.status === "in_progress").length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Pågående rundor</p>
              </div>
            </div>

            {kundrunSessions.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Datum</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Utförd av</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">OK</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Avvikelser</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kundrunSessions.map((s, idx) => (
                      <tr key={s.id} className={cn("border-b border-border/40 last:border-0", idx % 2 === 1 && "bg-muted/10")}>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(s.started_at).toLocaleDateString("sv-SE", { dateStyle: "medium" })}
                        </td>
                        <td className="px-4 py-3 font-medium">{s.conducted_by_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          {s.status === "completed" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                              <CheckCircle2 className="h-3 w-3" /> Genomförd
                            </span>
                          ) : s.status === "in_progress" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                              Pågår
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{s.status}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-medium text-success">{s.zone_oks}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn("text-xs font-semibold", s.zone_defects > 0 ? "text-destructive" : "text-muted-foreground")}>
                            {s.zone_defects > 0 ? s.zone_defects : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
                <ShoppingCart className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">Inga kundrundesessioner för vald period</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
