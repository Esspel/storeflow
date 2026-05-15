import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, ListChecks, TriangleAlert, FileText, CircleCheck as CheckCircle2, Circle as XCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, createNotification, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/testpanel")({
  component: TestPanel,
});

type Result = { ok: boolean; msg: string };

function TestPanel() {
  const { user, activeStore } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (user && user.role !== "admin") navigate({ to: "/" });
  }, [user]);

  if (!user || user.role !== "admin") return null;

  function addResult(ok: boolean, msg: string) {
    setResults((prev) => [{ ok, msg }, ...prev]);
  }

  async function testNotification() {
    setRunning(true);
    try {
      createNotification(user!.id, "test", "Testnotis", "Detta är en testnotis från testpanelen.", "/testpanel");
      addResult(true, "Notis skickad till din användare.");
    } catch (e) {
      addResult(false, `Notis misslyckades: ${e}`);
    }
    setRunning(false);
  }

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
      // Clean up
      if (data?.id) await supabase.from("tasks").delete().eq("id", data.id);
      addResult(true, `Uppgift skapades och raderades (id: ${data?.id}).`);
    }
    setRunning(false);
  }

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

  async function testTemplateUsage() {
    setRunning(true);
    const { data, error } = await supabase
      .from("checklist_templates")
      .select("id, title, items:checklist_template_items(*)")
      .limit(3);
    if (error) {
      addResult(false, `Mall-hämtning misslyckades: ${error.message}`);
    } else {
      addResult(true, `Hämtade ${(data ?? []).length} mallar. ${(data ?? []).map(t => t.title).join(", ") || "Inga mallar."}`);
    }
    setRunning(false);
  }

  async function testRlsPolicy() {
    setRunning(true);
    const { error: e1 } = await supabase.from("tasks").select("id").limit(1);
    const { error: e2 } = await supabase.from("incidents").select("id").limit(1);
    const { error: e3 } = await supabase.from("app_users").select("id").limit(1);
    const errors = [e1, e2, e3].filter(Boolean);
    if (errors.length === 0) {
      addResult(true, "RLS SELECT på tasks, incidents, app_users: OK");
    } else {
      addResult(false, `RLS fel: ${errors.map(e => e?.message).join("; ")}`);
    }
    setRunning(false);
  }

  const [customMsg, setCustomMsg] = useState("");
  async function sendCustomNotification() {
    if (!customMsg.trim()) return;
    setRunning(true);
    createNotification(user!.id, "test", customMsg.trim(), "", "/testpanel");
    addResult(true, `Anpassad notis skickad: "${customMsg}"`);
    setCustomMsg("");
    setRunning(false);
  }

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Testpanel"
        description="Admin-verktyg för att testa flöden och funktioner."
      />

      <div className="mt-2 mb-6 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
        Denna panel är endast synlig för administratörer. Testet skapar och raderar data direkt i databasen.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Notifications */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Notiser</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Testa att notifiering-systemet fungerar.</p>
          <Button size="sm" className="rounded-full w-full mb-3" onClick={testNotification} disabled={running}>
            Skicka testnotis
          </Button>
          <div className="space-y-2">
            <Label className="text-xs">Anpassat meddelande</Label>
            <div className="flex gap-2">
              <Input placeholder="Notis-text..." value={customMsg} onChange={e => setCustomMsg(e.target.value)} className="h-8 text-sm" />
              <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={sendCustomNotification} disabled={running || !customMsg.trim()}>
                Skicka
              </Button>
            </div>
          </div>
        </div>

        {/* Task creation */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Uppgifter</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Testar att skapa en uppgift i aktiv butik ({activeStore?.name ?? "ingen vald"}).
          </p>
          <Button size="sm" className="rounded-full w-full" onClick={testTaskCreation} disabled={running}>
            Testa uppgiftsskapande
          </Button>
        </div>

        {/* Incident creation */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Avvikelser</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Testar att skapa en avvikelse i aktiv butik ({activeStore?.name ?? "ingen vald"}).
          </p>
          <Button size="sm" className="rounded-full w-full" onClick={testIncidentCreation} disabled={running}>
            Testa avvikelseskapande
          </Button>
        </div>

        {/* Template usage */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 w-4 text-primary" />
            <h2 className="font-semibold">Mallar</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Testar att hämta och läsa mallar från databasen.</p>
          <Button size="sm" className="rounded-full w-full mb-2" onClick={testTemplateUsage} disabled={running}>
            Testa mallhämtning
          </Button>
        </div>

        {/* RLS check */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)] sm:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">RLS-policy-kontroll</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Verifierar att databas-behörigheter fungerar korrekt för inloggad session.</p>
          <Button size="sm" variant="outline" className="rounded-full" onClick={testRlsPolicy} disabled={running}>
            Kör RLS-kontroll
          </Button>
        </div>
      </div>

      {/* Results log */}
      {results.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Resultat</h3>
            <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => setResults([])}>
              Rensa
            </Button>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-xl px-4 py-3 text-sm",
                  r.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                )}
              >
                {r.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                }
                <span>{r.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
