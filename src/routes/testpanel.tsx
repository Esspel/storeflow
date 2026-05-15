import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell,
  ListChecks,
  TriangleAlert,
  FileText,
  CircleCheck as CheckCircle2,
  Circle as XCircle,
  Clock,
  Database,
  RefreshCw,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, createNotification, logAudit, type AuditLog } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/testpanel")({
  component: TestPanel,
});

// In-memory time offset (ms). Exported so other modules can use it for recurring task preview.
let _timeOffsetMs = 0;
export function getSimulatedDate(): Date {
  return new Date(Date.now() + _timeOffsetMs);
}

type Result = { ok: boolean; msg: string; ts: string };
type DbStats = {
  tasks: number;
  incidents: number;
  notifications: number;
  users: number;
  groups: number;
  templates: number;
};

function TestPanel() {
  const { user, activeStore } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<DbStats | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  // Time simulation
  const [timeAmount, setTimeAmount] = useState("1");
  const [timeUnit, setTimeUnit] = useState<"hours" | "days" | "weeks" | "months" | "years">("days");
  const [simulatedOffset, setSimulatedOffset] = useState(0);

  // Notification
  const [customMsg, setCustomMsg] = useState("");

  useEffect(() => {
    if (user && user.role !== "admin") navigate({ to: "/" });
  }, [user]);

  useEffect(() => {
    if (user?.role === "admin") loadStats();
  }, [user]);

  if (!user || user.role !== "admin") return null;

  function addResult(ok: boolean, msg: string) {
    const ts = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setResults((prev) => [{ ok, msg, ts }, ...prev].slice(0, 50));
  }

  async function loadStats() {
    const [t, i, n, u, g, tm] = await Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }),
      supabase.from("incidents").select("id", { count: "exact", head: true }),
      supabase.from("notifications").select("id", { count: "exact", head: true }),
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      supabase.from("user_groups").select("id", { count: "exact", head: true }),
      supabase.from("checklist_templates").select("id", { count: "exact", head: true }),
    ]);
    setStats({
      tasks: t.count ?? 0,
      incidents: i.count ?? 0,
      notifications: n.count ?? 0,
      users: u.count ?? 0,
      groups: g.count ?? 0,
      templates: tm.count ?? 0,
    });
  }

  // ---- Time simulation ----
  function applyTimeSimulation() {
    const amount = parseInt(timeAmount, 10);
    if (!amount || amount <= 0) return;
    const unitMs: Record<typeof timeUnit, number> = {
      hours: 3_600_000,
      days: 86_400_000,
      weeks: 604_800_000,
      months: 2_592_000_000,
      years: 31_536_000_000,
    };
    _timeOffsetMs += amount * unitMs[timeUnit];
    setSimulatedOffset(_timeOffsetMs);
    addResult(true, `Tid framflyttad +${amount} ${timeUnit}. Simulerad tid: ${getSimulatedDate().toLocaleString("sv-SE")}`);
  }

  function resetTime() {
    _timeOffsetMs = 0;
    setSimulatedOffset(0);
    addResult(true, "Simulerad tid återställd till aktuell tid.");
  }

  // ---- Notifications ----
  async function testNotification() {
    setRunning(true);
    createNotification(user!.id, "test", "Testnotis", "Detta är en testnotis från testpanelen.", "/testpanel");
    addResult(true, "Testnotis skickad.");
    setRunning(false);
  }

  async function testBulkNotifications() {
    setRunning(true);
    const rows = Array.from({ length: 5 }, (_, i) => ({
      user_id: user!.id,
      type: "test",
      title: `Bulk-notis ${i + 1}`,
      body: "Massa-test från testpanelen",
      link: "/testpanel",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) addResult(false, `Bulk-notiser misslyckades: ${error.message}`);
    else addResult(true, "5 bulk-notiser skickade.");
    setRunning(false);
  }

  async function clearAllNotifications() {
    setRunning(true);
    const { error } = await supabase.from("notifications").delete().eq("user_id", user!.id);
    if (error) addResult(false, `Rensning misslyckades: ${error.message}`);
    else addResult(true, "Alla dina notiser raderade.");
    setRunning(false);
  }

  async function sendCustomNotification() {
    if (!customMsg.trim()) return;
    setRunning(true);
    createNotification(user!.id, "test", customMsg.trim(), "", "/testpanel");
    addResult(true, `Anpassad notis skickad: "${customMsg}"`);
    setCustomMsg("");
    setRunning(false);
  }

  // ---- Tasks ----
  async function testTaskCreation() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const { data, error } = await supabase.from("tasks").insert({
      title: `[TEST] Uppgift ${new Date().toLocaleTimeString("sv-SE")}`,
      description: "Skapad av testpanelen",
      category: "Drift",
      priority: "Låg",
      store_id: activeStore.id,
      status: "todo",
      created_by: user!.id,
    }).select("id").maybeSingle();
    if (error) {
      addResult(false, `Uppgift misslyckades: ${error.message}`);
    } else {
      logAudit(user!.id, "task.test", "tasks", data?.id ?? null, {});
      if (data?.id) await supabase.from("tasks").delete().eq("id", data.id);
      addResult(true, `Uppgift skapades och raderades (id: ${data?.id}).`);
    }
    setRunning(false);
  }

  async function bulkCreateTasks() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const rows = Array.from({ length: 6 }, (_, i) => ({
      title: `[TEST] Bulk-uppgift ${i + 1}`,
      description: "Bulk-skapad av testpanelen",
      category: ["Drift", "Säkerhet", "Kundärenden", "Övrigt"][i % 4],
      priority: (["Låg", "Medel", "Hög", "Kritisk"] as const)[i % 4],
      store_id: activeStore.id,
      status: "todo" as const,
      created_by: user!.id,
    }));
    const { data, error } = await supabase.from("tasks").insert(rows).select("id");
    if (error) {
      addResult(false, `Bulk-uppgifter misslyckades: ${error.message}`);
    } else {
      addResult(true, `6 bulk-uppgifter skapade (${(data ?? []).map(d => d.id.slice(0, 6)).join(", ")}).`);
      await loadStats();
    }
    setRunning(false);
  }

  async function createOverdueTask() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const dueDate = new Date(Date.now() - 2 * 86_400_000).toISOString().split("T")[0];
    const { data, error } = await supabase.from("tasks").insert({
      title: "[TEST] Försenad uppgift",
      description: "Har passerat deadline",
      category: "Drift",
      priority: "Hög",
      store_id: activeStore.id,
      status: "late",
      due_date: dueDate,
      created_by: user!.id,
    }).select("id").maybeSingle();
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `Försenad uppgift skapad med due_date ${dueDate} (id: ${data?.id?.slice(0, 8)}).`);
    await loadStats();
    setRunning(false);
  }

  async function createTaskWithQuestions() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const { data: task, error } = await supabase.from("tasks").insert({
      title: "[TEST] Uppgift med frågor",
      description: "Test av frågefunktionalitet",
      category: "Drift",
      priority: "Medel",
      store_id: activeStore.id,
      status: "todo",
      created_by: user!.id,
    }).select("id").maybeSingle();
    if (error || !task?.id) { addResult(false, `Misslyckades: ${error?.message}`); setRunning(false); return; }
    await supabase.from("task_questions").insert([
      { task_id: task.id, label: "Är temperaturen kontrollerad?", is_required: true, sort_order: 1 },
      { task_id: task.id, label: "Kommentar (valfritt)", is_required: false, sort_order: 2 },
    ]);
    addResult(true, `Uppgift med 2 frågor skapad (id: ${task.id.slice(0, 8)}).`);
    await loadStats();
    setRunning(false);
  }

  async function createRecurringTask() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const simDate = getSimulatedDate().toISOString().split("T")[0];
    const { data, error } = await supabase.from("tasks").insert({
      title: "[TEST] Återkommande uppgift (dagligen)",
      description: `Skapad vid simulerad tid: ${simDate}`,
      category: "Drift",
      priority: "Medel",
      store_id: activeStore.id,
      status: "todo",
      created_by: user!.id,
      recurring: "daily",
      recurrence_rule: "daily",
      recurrence_interval: 1,
      due_date: simDate,
    }).select("id").maybeSingle();
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `Återkommande uppgift skapad med due_date ${simDate} (id: ${data?.id?.slice(0, 8)}).`);
    await loadStats();
    setRunning(false);
  }

  // ---- Incidents ----
  async function testIncidentCreation() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const ref = `TEST-${Date.now()}`;
    const { data, error } = await supabase.from("incidents").insert({
      ref_number: ref,
      title: `[TEST] Avvikelse ${new Date().toLocaleTimeString("sv-SE")}`,
      description: "Skapad av testpanelen",
      category: "Drift",
      store_id: activeStore.id,
      priority: "Låg",
      status: "open",
      reported_by: user!.id,
    }).select("id").maybeSingle();
    if (error) {
      addResult(false, `Avvikelse misslyckades: ${error.message}`);
    } else {
      if (data?.id) await supabase.from("incidents").delete().eq("id", data.id);
      addResult(true, `Avvikelse skapades och raderades (ref: ${ref}).`);
    }
    setRunning(false);
  }

  async function createEscalatedIncident() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const ref = `TEST-ESC-${Date.now()}`;
    const { data, error } = await supabase.from("incidents").insert({
      ref_number: ref,
      title: "[TEST] Eskalerad avvikelse",
      description: "Skapad som eskalerad via testpanelen",
      category: "Säkerhet",
      store_id: activeStore.id,
      priority: "Kritisk",
      status: "escalated",
      reported_by: user!.id,
    }).select("id").maybeSingle();
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `Eskalerad avvikelse skapad (ref: ${ref}, id: ${data?.id?.slice(0, 8)}).`);
    await loadStats();
    setRunning(false);
  }

  // ---- Templates ----
  async function testTemplateUsage() {
    setRunning(true);
    const { data, error } = await supabase
      .from("checklist_templates")
      .select("id, title, items:checklist_template_items(*), questions:checklist_template_questions(*)")
      .limit(3);
    if (error) {
      addResult(false, `Mall-hämtning misslyckades: ${error.message}`);
    } else {
      addResult(true, `Hämtade ${(data ?? []).length} mallar. ${(data ?? []).map(t => `"${t.title}" (${(t.items ?? []).length} steg, ${(t.questions ?? []).length} frågor)`).join("; ") || "Inga mallar."}`);
    }
    setRunning(false);
  }

  // ---- RLS ----
  async function testRlsPolicy() {
    setRunning(true);
    const checks = [
      supabase.from("tasks").select("id").limit(1),
      supabase.from("incidents").select("id").limit(1),
      supabase.from("app_users").select("id").limit(1),
      supabase.from("user_groups").select("id").limit(1),
      supabase.from("notifications").select("id").limit(1),
    ];
    const results = await Promise.all(checks);
    const errors = results.map((r, i) => r.error ? `tabell ${["tasks","incidents","app_users","user_groups","notifications"][i]}: ${r.error.message}` : null).filter(Boolean);
    if (errors.length === 0) addResult(true, "RLS SELECT på alla 5 tabeller: OK");
    else addResult(false, `RLS fel: ${errors.join("; ")}`);
    setRunning(false);
  }

  // ---- Debug / cleanup ----
  async function deleteTestData() {
    setRunning(true);
    const [t, i] = await Promise.all([
      supabase.from("tasks").delete().like("title", "[TEST]%"),
      supabase.from("incidents").delete().like("title", "[TEST]%"),
    ]);
    const errs = [t.error, i.error].filter(Boolean);
    if (errs.length) addResult(false, `Rensning: ${errs.map(e => e?.message).join("; ")}`);
    else addResult(true, "Alla [TEST]-uppgifter och [TEST]-avvikelser raderade.");
    await loadStats();
    setRunning(false);
  }

  async function loadAuditLog() {
    const { data, error } = await supabase
      .from("audit_log")
      .select("*, actor:app_users!actor_id(display_name)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) { addResult(false, `Audit log misslyckades: ${error.message}`); return; }
    setAuditLog((data ?? []) as AuditLog[]);
    setShowAudit(true);
  }

  const simulatedLabel = simulatedOffset > 0
    ? `Simulerad: ${getSimulatedDate().toLocaleString("sv-SE")}`
    : "Ingen tidsförskjutning aktiv";

  return (
    <div className="mx-auto max-w-[960px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Testpanel"
        description="Admin-verktyg för att testa flöden, simulera tid och granska data."
      />

      <div className="mt-2 mb-6 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
        Denna panel är endast synlig för administratörer. Testet kan skapa och radera data direkt i databasen.
      </div>

      {/* DB Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            { label: "Uppgifter", value: stats.tasks },
            { label: "Avvikelser", value: stats.incidents },
            { label: "Notiser", value: stats.notifications },
            { label: "Användare", value: stats.users },
            { label: "Grupper", value: stats.groups },
            { label: "Mallar", value: stats.templates },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-border/60 bg-card p-3 text-center shadow-[var(--shadow-sm)]">
              <p className="text-2xl font-black text-foreground">{value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Time Simulation */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)] sm:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Tidssimulering</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Flytta fram den simulerade klockan för att testa återkommande uppgifter och SLA-deadlines.
          </p>
          <div className={cn(
            "mb-4 rounded-lg px-3 py-2 text-xs font-medium",
            simulatedOffset > 0 ? "bg-warning/10 text-warning-foreground" : "bg-muted/60 text-muted-foreground"
          )}>
            {simulatedLabel}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[80px] space-y-1">
              <Label className="text-xs">Antal</Label>
              <Input
                type="number" min="1" value={timeAmount}
                onChange={(e) => setTimeAmount(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex-1 min-w-[120px] space-y-1">
              <Label className="text-xs">Enhet</Label>
              <Select value={timeUnit} onValueChange={(v) => setTimeUnit(v as typeof timeUnit)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Timmar</SelectItem>
                  <SelectItem value="days">Dagar</SelectItem>
                  <SelectItem value="weeks">Veckor</SelectItem>
                  <SelectItem value="months">Månader</SelectItem>
                  <SelectItem value="years">År</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="rounded-full h-9" onClick={applyTimeSimulation} disabled={running}>
              Simulera
            </Button>
            <Button size="sm" variant="outline" className="rounded-full h-9" onClick={resetTime} disabled={running}>
              Återställ
            </Button>
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Notiser</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Testa notifieringssystemet.</p>
          <div className="space-y-2">
            <Button size="sm" className="rounded-full w-full" onClick={testNotification} disabled={running}>
              Skicka testnotis
            </Button>
            <Button size="sm" variant="outline" className="rounded-full w-full" onClick={testBulkNotifications} disabled={running}>
              Skicka 5 bulk-notiser
            </Button>
            <Button size="sm" variant="outline" className="rounded-full w-full text-destructive hover:text-destructive" onClick={clearAllNotifications} disabled={running}>
              Rensa alla mina notiser
            </Button>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">Anpassat meddelande</Label>
            <div className="flex gap-2">
              <Input placeholder="Notis-text..." value={customMsg} onChange={(e) => setCustomMsg(e.target.value)} className="h-8 text-sm" />
              <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={sendCustomNotification} disabled={running || !customMsg.trim()}>
                Skicka
              </Button>
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Uppgifter</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Aktiv butik: <strong>{activeStore?.name ?? "ingen vald"}</strong>
          </p>
          <div className="space-y-2">
            <Button size="sm" className="rounded-full w-full" onClick={testTaskCreation} disabled={running}>
              Testa skapa + radera
            </Button>
            <Button size="sm" variant="outline" className="rounded-full w-full" onClick={bulkCreateTasks} disabled={running}>
              Bulk: skapa 6 uppgifter
            </Button>
            <Button size="sm" variant="outline" className="rounded-full w-full" onClick={createOverdueTask} disabled={running}>
              Skapa försenad uppgift
            </Button>
            <Button size="sm" variant="outline" className="rounded-full w-full" onClick={createTaskWithQuestions} disabled={running}>
              Skapa uppgift med frågor
            </Button>
            <Button size="sm" variant="outline" className="rounded-full w-full" onClick={createRecurringTask} disabled={running}>
              Återkommande (använder sim-tid)
            </Button>
          </div>
        </div>

        {/* Incidents */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Avvikelser</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Aktiv butik: <strong>{activeStore?.name ?? "ingen vald"}</strong>
          </p>
          <div className="space-y-2">
            <Button size="sm" className="rounded-full w-full" onClick={testIncidentCreation} disabled={running}>
              Testa skapa + radera
            </Button>
            <Button size="sm" variant="outline" className="rounded-full w-full" onClick={createEscalatedIncident} disabled={running}>
              Skapa eskalerad avvikelse
            </Button>
          </div>
        </div>

        {/* Templates */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Mallar</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Testa hämtning av mallar inklusive frågor.</p>
          <Button size="sm" className="rounded-full w-full" onClick={testTemplateUsage} disabled={running}>
            Hämta mallar
          </Button>
        </div>

        {/* Security & RLS */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">RLS-policy-kontroll</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Verifierar SELECT-behörigheter på 5 tabeller.</p>
          <Button size="sm" variant="outline" className="rounded-full w-full" onClick={testRlsPolicy} disabled={running}>
            Kör RLS-kontroll
          </Button>
        </div>

        {/* Debug */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)] sm:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Debug & Rensning</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={loadStats} disabled={running}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Uppdatera statistik
            </Button>
            <Button
              size="sm" variant="outline" className="rounded-full"
              onClick={() => { setShowAudit((v) => !v); if (!showAudit) loadAuditLog(); }}
              disabled={running}
            >
              {showAudit ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
              Visa audit-logg
            </Button>
            <Button
              size="sm" variant="outline"
              className="rounded-full text-destructive hover:text-destructive"
              onClick={deleteTestData} disabled={running}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Radera [TEST]-data
            </Button>
          </div>

          {showAudit && (
            <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
              <div className="border-b border-border/60 px-4 py-2.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">Senaste 30 händelser</p>
                <button onClick={() => setShowAudit(false)} className="text-xs text-muted-foreground hover:text-foreground">Stäng</button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {auditLog.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Inga händelser</p>
                ) : (
                  auditLog.map((entry) => (
                    <div key={entry.id} className="border-b border-border/40 px-4 py-2.5 last:border-0 hover:bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">{entry.action}</span>
                          <span className="text-xs text-muted-foreground">{entry.entity}</span>
                          {entry.entity_id && <span className="font-mono text-[10px] text-muted-foreground/60">{entry.entity_id.slice(0, 8)}</span>}
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground/60">
                          {new Date(entry.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                      {entry.actor && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">av {entry.actor.display_name}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results log */}
      {results.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Resultatlogg</h3>
            <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => setResults([])}>
              Rensa
            </Button>
          </div>
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm",
                  r.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                )}
              >
                {r.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                }
                <span className="flex-1">{r.msg}</span>
                <span className="shrink-0 text-xs opacity-60">{r.ts}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
