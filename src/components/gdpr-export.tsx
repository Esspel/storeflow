import { useState } from "react";
import { Download, Search, Shield, Loader as Loader2, CircleAlert as AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

type ExportResult = {
  user: Record<string, unknown>;
  tasks_created: unknown[];
  tasks_assigned: unknown[];
  incidents_reported: unknown[];
  incidents_assigned: unknown[];
  incident_comments: unknown[];
  kundrunda_sessions: unknown[];
  kundrunda_responses: unknown[];
  audit_entries: unknown[];
  exported_at: string;
};

export function GdprExport() {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExportResult | null>(null);

  async function runExport() {
    setError("");
    setResult(null);
    const q = search.trim();
    if (!q) { setError("Ange ett användar-ID eller användarnamn."); return; }
    setLoading(true);

    // Resolve user by ID (uuid) or username
    const isUuid = /^[0-9a-f-]{36}$/i.test(q);
    const { data: user, error: userErr } = isUuid
      ? await supabase.from("app_users").select("*").eq("id", q).maybeSingle()
      : await supabase.from("app_users").select("*").eq("username", q.toLowerCase()).maybeSingle();

    if (userErr || !user) {
      setError("Ingen användare hittades med det angivna ID:t eller användarnamnet.");
      setLoading(false);
      return;
    }

    const userId = (user as { id: string }).id;

    // Fetch kundrunda sessions first so we can use the IDs for responses query
    const { data: sessionRows } = await supabase
      .from("kundrunda_sessions")
      .select("id, started_at, completed_at, total_score, max_score")
      .eq("conducted_by", userId);

    const sessionIds = (sessionRows ?? []).map((s: { id: string }) => s.id);

    const [
      tasksCreated,
      tasksAssigned,
      incidentsReported,
      incidentsAssigned,
      incidentComments,
      kundrundaResponses,
      auditEntries,
    ] = await Promise.all([
      supabase.from("tasks").select("id, title, status, created_at, store_id, due_date").eq("created_by", userId),
      supabase.from("task_assignees").select("task_id, created_at, task:tasks(id, title, status)").eq("user_id", userId),
      supabase.from("incidents").select("id, ref_number, title, category, status, created_at").eq("reported_by", userId),
      supabase.from("incidents").select("id, ref_number, title, status, created_at").eq("assigned_to", userId),
      supabase.from("incident_comments").select("id, content, created_at, incident_id").eq("author_id", userId),
      sessionIds.length > 0
        ? supabase.from("kundrunda_responses").select("id, checkpoint_id, result, defect_description, created_at").in("session_id", sessionIds)
        : Promise.resolve({ data: [] }),
      supabase.from("audit_log").select("action, entity, entity_id, meta, created_at").eq("actor_id", userId).order("created_at", { ascending: false }).limit(200),
    ]);

    const kundrundaSessions = { data: sessionRows };

    const exportData: ExportResult = {
      user: {
        id: (user as Record<string, unknown>).id,
        username: (user as Record<string, unknown>).username,
        display_name: (user as Record<string, unknown>).display_name,
        role: (user as Record<string, unknown>).role,
        employee_group: (user as Record<string, unknown>).employee_group,
        is_active: (user as Record<string, unknown>).is_active,
        last_login: (user as Record<string, unknown>).last_login,
        created_at: (user as Record<string, unknown>).created_at,
      },
      tasks_created: tasksCreated.data ?? [],
      tasks_assigned: tasksAssigned.data ?? [],
      incidents_reported: incidentsReported.data ?? [],
      incidents_assigned: incidentsAssigned.data ?? [],
      incident_comments: incidentComments.data ?? [],
      kundrunda_sessions: kundrundaSessions.data ?? [],
      kundrunda_responses: kundrundaResponses.data ?? [],
      audit_entries: auditEntries.data ?? [],
      exported_at: new Date().toISOString(),
    };

    setResult(exportData);
    setLoading(false);
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gdpr-export-${(result.user.username as string) ?? "user"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv() {
    if (!result) return;
    const sections: string[] = [];

    const addSection = (title: string, rows: unknown[]) => {
      if (!rows.length) return;
      const keys = Object.keys(rows[0] as object);
      sections.push(`\n# ${title}`);
      sections.push(keys.join(","));
      rows.forEach((row) => {
        sections.push(
          keys.map((k) => {
            const v = (row as Record<string, unknown>)[k];
            const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
            return `"${s.replace(/"/g, '""')}"`;
          }).join(",")
        );
      });
    };

    sections.push(`# GDPR-export: ${result.user.display_name} (${result.user.username})`);
    sections.push(`# Exporterad: ${result.exported_at}`);
    addSection("Skapade uppgifter", result.tasks_created);
    addSection("Tilldelade uppgifter", result.tasks_assigned);
    addSection("Rapporterade avvikelser", result.incidents_reported);
    addSection("Tilldelade avvikelser", result.incidents_assigned);
    addSection("Kommentarer", result.incident_comments);
    addSection("Kundrundor", result.kundrunda_sessions);
    addSection("Kundrunda-svar", result.kundrunda_responses);
    addSection("Aktivitetslogg", result.audit_entries);

    const blob = new Blob([sections.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gdpr-export-${(result.user.username as string) ?? "user"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalRecords = result
    ? result.tasks_created.length + result.tasks_assigned.length + result.incidents_reported.length +
      result.incident_comments.length + result.kundrunda_sessions.length + result.audit_entries.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">GDPR Artikel 20 — Rätt till dataportabilitet</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Generera en fullständig export av all data kopplad till en anställd. Exportfilen kan utlämnas till den berörda personen på begäran.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-1.5">
          <Label>Användar-ID eller användarnamn</Label>
          <Input
            placeholder="t.ex. anna.svensson eller UUID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runExport()}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={runExport} disabled={loading} className="w-full sm:w-auto">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Hämta data
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{result.user.display_name as string}</p>
                <p className="font-mono text-sm text-muted-foreground">{result.user.username as string}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadJson} className="rounded-full">
                  <Download className="mr-1.5 h-3.5 w-3.5" /> JSON
                </Button>
                <Button variant="outline" size="sm" onClick={downloadCsv} className="rounded-full">
                  <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Uppgifter skapade", count: result.tasks_created.length },
                { label: "Avvikelser", count: result.incidents_reported.length },
                { label: "Kundrundor", count: result.kundrunda_sessions.length },
                { label: "Loggposter", count: result.audit_entries.length },
              ].map(({ label, count }) => (
                <div key={label} className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums">{count}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              {totalRecords} poster totalt &mdash; exporterad {new Date(result.exported_at).toLocaleString("sv-SE")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
