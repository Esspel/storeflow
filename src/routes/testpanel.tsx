import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, ListChecks, TriangleAlert, FileText, CircleCheck as CheckCircle2, Circle as XCircle, Clock, Database, RefreshCw, Trash2, ChevronDown, ChevronUp, Image as ImageIcon, Wifi, WifiOff, Shield, Users, CalendarDays, Bug, FlaskConical, TriangleAlert as AlertTriangle, FileSearch, Upload } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, createNotification, logAudit, type AuditLog, deleteStorageFiles, compressImage } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { getTimeOffsetMs, setTimeOffsetMs, getSimulatedDate } from "@/lib/time-simulation";

export const Route = createFileRoute("/testpanel")({
  component: TestPanel,
});

type Result = { ok: boolean; msg: string; ts: string };
type DbStats = {
  tasks: number; incidents: number; notifications: number; users: number;
  groups: number; templates: number; scheduleImports: number;
  scheduleShifts: number; deliveryPlans: number; auditEntries: number;
  taskImages: number; incidentImages: number; sessions: number;
};

function Section({ icon: Icon, title, span2 = false, children }: {
  icon: React.ElementType; title: string; span2?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]",
      span2 && "sm:col-span-2"
    )}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, variant = "outline", danger = false }: {
  label: string; onClick: () => void; disabled: boolean; variant?: "default" | "outline"; danger?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={variant}
      className={cn("rounded-full w-full", danger && "text-destructive hover:text-destructive")}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

function TestPanel() {
  const { user, activeStore } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<DbStats | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"idle" | "connected" | "error">("idle");

  // Time simulation
  const [timeAmount, setTimeAmount] = useState("1");
  const [timeUnit, setTimeUnit] = useState<"hours" | "days" | "weeks" | "months" | "years">("days");
  const [simulatedOffset, setSimulatedOffset] = useState(() => getTimeOffsetMs());

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
    setResults((prev) => [{ ok, msg, ts }, ...prev].slice(0, 100));
  }

  async function loadStats() {
    const [t, i, n, u, g, tm, si, ss, dp, al, ti, ii, ses] = await Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }),
      supabase.from("incidents").select("id", { count: "exact", head: true }),
      supabase.from("notifications").select("id", { count: "exact", head: true }),
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      supabase.from("user_groups").select("id", { count: "exact", head: true }),
      supabase.from("checklist_templates").select("id", { count: "exact", head: true }),
      supabase.from("schedule_imports").select("id", { count: "exact", head: true }),
      supabase.from("schedule_shifts").select("id", { count: "exact", head: true }),
      supabase.from("delivery_plans").select("id", { count: "exact", head: true }),
      supabase.from("audit_log").select("id", { count: "exact", head: true }),
      supabase.from("task_images").select("id", { count: "exact", head: true }),
      supabase.from("incident_images").select("id", { count: "exact", head: true }),
      supabase.from("app_sessions").select("id", { count: "exact", head: true }),
    ]);
    setStats({
      tasks: t.count ?? 0, incidents: i.count ?? 0, notifications: n.count ?? 0,
      users: u.count ?? 0, groups: g.count ?? 0, templates: tm.count ?? 0,
      scheduleImports: si.count ?? 0, scheduleShifts: ss.count ?? 0,
      deliveryPlans: dp.count ?? 0, auditEntries: al.count ?? 0,
      taskImages: ti.count ?? 0, incidentImages: ii.count ?? 0,
      sessions: ses.count ?? 0,
    });
  }

  // ---- Time simulation ----
  function applyTimeSimulation() {
    const amount = parseInt(timeAmount, 10);
    if (!amount || amount <= 0) return;
    const unitMs: Record<typeof timeUnit, number> = {
      hours: 3_600_000, days: 86_400_000, weeks: 604_800_000,
      months: 2_592_000_000, years: 31_536_000_000,
    };
    const newOffset = getTimeOffsetMs() + amount * unitMs[timeUnit];
    setTimeOffsetMs(newOffset);
    setSimulatedOffset(newOffset);
    addResult(true, `Tid framflyttad +${amount} ${timeUnit}. Simulerad tid: ${getSimulatedDate().toLocaleString("sv-SE")}`);
  }

  async function resetTime() {
    await supabase.from("tasks").delete().not("parent_task_id", "is", null);
    setTimeOffsetMs(0);
    setSimulatedOffset(0);
    addResult(true, "Simulerad tid återställd. Simulerade uppgifter borttagna.");
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
    for (let i = 1; i <= 5; i++) {
      createNotification(user!.id, "test", `Bulk-notis ${i}`, "Massa-test från testpanelen", "/testpanel");
    }
    addResult(true, "5 bulk-notiser skickade.");
    await loadStats();
    setRunning(false);
  }

  async function clearMyNotifications() {
    setRunning(true);
    const { error } = await supabase.from("notifications").delete().eq("user_id", user!.id);
    if (error) addResult(false, `Rensning misslyckades: ${error.message}`);
    else addResult(true, "Alla dina notiser raderade.");
    await loadStats();
    setRunning(false);
  }

  async function clearAllNotificationsAllUsers() {
    setRunning(true);
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true });
    const { error } = await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) addResult(false, `Rensning misslyckades: ${error.message}`);
    else addResult(true, `${count ?? 0} notiser raderade för alla användare.`);
    await loadStats();
    setRunning(false);
  }

  async function clearReadNotificationsAllUsers() {
    setRunning(true);
    const { count, error } = await supabase.from("notifications").delete().eq("is_read", true);
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `Raderade ${count ?? "?"} lästa notiser.`);
    await loadStats();
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
      description: "Skapad av testpanelen", category: "Drift", priority: "Låg",
      store_id: activeStore.id, status: "todo", created_by: user!.id,
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
      store_id: activeStore.id, status: "todo" as const, created_by: user!.id,
    }));
    const { data, error } = await supabase.from("tasks").insert(rows).select("id");
    if (error) addResult(false, `Bulk-uppgifter misslyckades: ${error.message}`);
    else addResult(true, `6 bulk-uppgifter skapade (${(data ?? []).map(d => d.id.slice(0, 6)).join(", ")}).`);
    await loadStats();
    setRunning(false);
  }

  async function createOverdueTask() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const dueDate = new Date(Date.now() - 2 * 86_400_000).toISOString().split("T")[0];
    const { data, error } = await supabase.from("tasks").insert({
      title: "[TEST] Försenad uppgift", description: "Har passerat deadline",
      category: "Drift", priority: "Hög", store_id: activeStore.id,
      status: "late", due_date: dueDate, created_by: user!.id,
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
      title: "[TEST] Uppgift med frågor", description: "Test av frågefunktionalitet",
      category: "Drift", priority: "Medel", store_id: activeStore.id,
      status: "todo", created_by: user!.id,
    }).select("id").maybeSingle();
    if (error || !task?.id) { addResult(false, `Misslyckades: ${error?.message}`); setRunning(false); return; }
    await supabase.from("task_questions").insert([
      { task_id: task.id, label: "Är temperaturen kontrollerad?", question_type: "yes_no", is_required: true, sort_order: 1 },
      { task_id: task.id, label: "Kommentar (valfritt)", question_type: "text", is_required: false, sort_order: 2 },
    ]);
    await supabase.from("task_steps").insert([
      { task_id: task.id, label: "Kontrollera kylskåp", is_done: false, sort_order: 1 },
      { task_id: task.id, label: "Kontrollera frys", is_done: false, sort_order: 2 },
    ]);
    addResult(true, `Uppgift med 2 steg + 2 frågor skapad (id: ${task.id.slice(0, 8)}).`);
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
      category: "Drift", priority: "Medel", store_id: activeStore.id,
      status: "todo", created_by: user!.id,
      recurring: "daily", recurrence_rule: "daily", recurrence_interval: 1, due_date: simDate,
    }).select("id").maybeSingle();
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `Återkommande uppgift skapad med due_date ${simDate} (id: ${data?.id?.slice(0, 8)}).`);
    await loadStats();
    setRunning(false);
  }

  async function deleteAllTestTasks() {
    setRunning(true);
    const { data: testTasks } = await supabase.from("tasks").select("id").like("title", "[TEST]%");
    const ids = (testTasks ?? []).map(t => t.id);
    if (ids.length > 0) {
      const { data: imgRows } = await supabase.from("task_images").select("storage_path").in("task_id", ids);
      deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
      await supabase.from("tasks").delete().like("title", "[TEST]%");
    }
    addResult(true, `${ids.length} [TEST]-uppgifter raderade (inkl. bilder).`);
    await loadStats();
    setRunning(false);
  }

  async function checkOrphanedTaskImages() {
    setRunning(true);
    // Find task_image rows whose task_id no longer exists in tasks
    const { data: images } = await supabase.from("task_images").select("id, task_id, storage_path");
    if (!images || images.length === 0) { addResult(true, "Inga task_images-rader att kontrollera."); setRunning(false); return; }
    const taskIds = [...new Set(images.map(i => i.task_id))];
    const { data: tasks } = await supabase.from("tasks").select("id").in("id", taskIds);
    const existingIds = new Set((tasks ?? []).map(t => t.id));
    const orphaned = images.filter(i => !existingIds.has(i.task_id));
    if (orphaned.length === 0) {
      addResult(true, `Inga herrelösa task-bilder hittades (${images.length} totalt OK).`);
    } else {
      addResult(false, `${orphaned.length} herrelösa task-bildrader hittade! IDs: ${orphaned.map(o => o.id.slice(0, 8)).join(", ")}`);
    }
    setRunning(false);
  }

  async function purgeOrphanedTaskImages() {
    setRunning(true);
    const { data: images } = await supabase.from("task_images").select("id, task_id, storage_path");
    if (!images || images.length === 0) { addResult(true, "Inga bilder att rensa."); setRunning(false); return; }
    const taskIds = [...new Set(images.map(i => i.task_id))];
    const { data: tasks } = await supabase.from("tasks").select("id").in("id", taskIds);
    const existingIds = new Set((tasks ?? []).map(t => t.id));
    const orphaned = images.filter(i => !existingIds.has(i.task_id));
    if (orphaned.length === 0) { addResult(true, "Inga herrelösa bilder att rensa."); setRunning(false); return; }
    deleteStorageFiles(orphaned.map(o => o.storage_path));
    await supabase.from("task_images").delete().in("id", orphaned.map(o => o.id));
    addResult(true, `${orphaned.length} herrelösa task-bilder rensade (DB-rad + Storage-fil).`);
    await loadStats();
    setRunning(false);
  }

  async function checkOrphanedIncidentImages() {
    setRunning(true);
    const { data: images } = await supabase.from("incident_images").select("id, incident_id, storage_path");
    if (!images || images.length === 0) { addResult(true, "Inga incident_images-rader att kontrollera."); setRunning(false); return; }
    const incIds = [...new Set(images.map(i => i.incident_id))];
    const { data: incidents } = await supabase.from("incidents").select("id").in("id", incIds);
    const existingIds = new Set((incidents ?? []).map(i => i.id));
    const orphaned = images.filter(i => !existingIds.has(i.incident_id));
    if (orphaned.length === 0) {
      addResult(true, `Inga herrelösa incident-bilder hittades (${images.length} totalt OK).`);
    } else {
      addResult(false, `${orphaned.length} herrelösa incident-bildrader! IDs: ${orphaned.map(o => o.id.slice(0, 8)).join(", ")}`);
    }
    setRunning(false);
  }

  async function purgeOrphanedIncidentImages() {
    setRunning(true);
    const { data: images } = await supabase.from("incident_images").select("id, incident_id, storage_path");
    if (!images || images.length === 0) { addResult(true, "Inga bilder att rensa."); setRunning(false); return; }
    const incIds = [...new Set(images.map(i => i.incident_id))];
    const { data: incidents } = await supabase.from("incidents").select("id").in("id", incIds);
    const existingIds = new Set((incidents ?? []).map(i => i.id));
    const orphaned = images.filter(i => !existingIds.has(i.incident_id));
    if (orphaned.length === 0) { addResult(true, "Inga herrelösa incident-bilder att rensa."); setRunning(false); return; }
    deleteStorageFiles(orphaned.map(o => o.storage_path));
    await supabase.from("incident_images").delete().in("id", orphaned.map(o => o.id));
    addResult(true, `${orphaned.length} herrelösa incident-bilder rensade.`);
    await loadStats();
    setRunning(false);
  }

  async function testImageCompression() {
    // Create a synthetic canvas image to test compression pipeline
    setRunning(true);
    const canvas = document.createElement("canvas");
    canvas.width = 3000; canvas.height = 2000;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#4a9a6d"; ctx.fillRect(0, 0, 3000, 2000);
    ctx.fillStyle = "#ffffff"; ctx.font = "80px sans-serif";
    ctx.fillText("StoreFlow Test Image", 200, 1000);
    canvas.toBlob(async (blob) => {
      if (!blob) { addResult(false, "Kunde inte skapa testbild."); setRunning(false); return; }
      const original = new File([blob], "test.png", { type: "image/png" });
      const compressed = await compressImage(original);
      const ratio = Math.round((1 - compressed.size / original.size) * 100);
      addResult(true, `Bildkomprimering OK: ${(original.size / 1024).toFixed(0)} KB → ${(compressed.size / 1024).toFixed(0)} KB (−${ratio}%, format: ${compressed.type})`);
      setRunning(false);
    }, "image/png");
  }

  // ---- Incidents ----
  async function testIncidentCreation() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const ref = `TEST-${Date.now()}`;
    const { data, error } = await supabase.from("incidents").insert({
      ref_number: ref, title: `[TEST] Avvikelse ${new Date().toLocaleTimeString("sv-SE")}`,
      description: "Skapad av testpanelen", category: "Drift",
      store_id: activeStore.id, priority: "Låg", status: "open", reported_by: user!.id,
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
      ref_number: ref, title: "[TEST] Eskalerad avvikelse",
      description: "Skapad som eskalerad via testpanelen",
      category: "Säkerhet", store_id: activeStore.id, priority: "Kritisk",
      status: "escalated", reported_by: user!.id,
    }).select("id").maybeSingle();
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `Eskalerad avvikelse skapad (ref: ${ref}, id: ${data?.id?.slice(0, 8)}).`);
    await loadStats();
    setRunning(false);
  }

  async function deleteAllTestIncidents() {
    setRunning(true);
    const { data: rows, error } = await supabase.from("incidents").delete().like("title", "[TEST]%").select("id");
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `${(rows ?? []).length} [TEST]-avvikelser raderade.`);
    await loadStats();
    setRunning(false);
  }

  async function deleteAllIncidentsForStore() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const { data: incRows } = await supabase.from("incidents").select("id").eq("store_id", activeStore.id);
    const incIds = (incRows ?? []).map(r => r.id);
    if (incIds.length > 0) {
      const { data: imgRows } = await supabase.from("incident_images").select("storage_path").in("incident_id", incIds);
      deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
    }
    const { count, error } = await supabase.from("incidents").delete().eq("store_id", activeStore.id);
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `${count ?? incIds.length} avvikelser raderade för ${activeStore.name} (inkl. bilder).`);
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
    const tables = ["tasks", "incidents", "app_users", "user_groups", "notifications",
      "schedule_imports", "schedule_shifts", "delivery_plans", "checklist_templates", "audit_log"];
    const checks = tables.map(t => supabase.from(t as "tasks").select("id").limit(1));
    const results = await Promise.all(checks);
    const errors = results.map((r, i) => r.error ? `${tables[i]}: ${r.error.message}` : null).filter(Boolean);
    if (errors.length === 0) addResult(true, `RLS SELECT OK på alla ${tables.length} tabeller.`);
    else addResult(false, `RLS-fel: ${errors.join("; ")}`);
    setRunning(false);
  }

  async function testRlsInsertProtection() {
    // Try to insert a task as a different store — should either succeed (own store) or be blocked
    setRunning(true);
    const { data: otherStores } = await supabase.from("stores").select("id, name").limit(5);
    const otherStore = (otherStores ?? []).find(s => s.id !== activeStore?.id);
    if (!otherStore) { addResult(true, "Bara en butik i systemet — cross-store test ej möjligt."); setRunning(false); return; }
    const { error } = await supabase.from("tasks").insert({
      title: "[RLS-TEST] Cross-store task", category: "Drift", priority: "Låg",
      store_id: otherStore.id, status: "todo", created_by: user!.id,
    });
    if (error) {
      addResult(true, `RLS blockerade cross-store INSERT korrekt: ${error.message}`);
    } else {
      addResult(false, `VARNING: Cross-store INSERT LYCKADES för butik "${otherStore.name}" — kontrollera RLS!`);
      await supabase.from("tasks").delete().eq("title", "[RLS-TEST] Cross-store task");
    }
    setRunning(false);
  }

  // ---- Realtime ----
  async function testRealtimeConnection() {
    setRunning(true);
    setRealtimeStatus("idle");
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }
    const timeout = setTimeout(() => {
      setRealtimeStatus("error");
      addResult(false, "Realtime-timeout: Ingen SUBSCRIBED-händelse inom 5 sekunder.");
      setRunning(false);
    }, 5000);
    const ch = supabase
      .channel("testpanel-rt-probe-" + Date.now())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          setRealtimeStatus("connected");
          addResult(true, "Realtime WebSocket ansluten och prenumererar korrekt.");
          setRunning(false);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          setRealtimeStatus("error");
          addResult(false, `Realtime-fel: ${status}`);
          setRunning(false);
        }
      });
    realtimeRef.current = ch;
  }

  async function testRealtimePing() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const start = Date.now();
    const { data, error } = await supabase.from("tasks").insert({
      title: "[RT-PING] Realtidspingtest", category: "Drift", priority: "Låg",
      store_id: activeStore.id, status: "todo", created_by: user!.id,
    }).select("id").maybeSingle();
    const insertMs = Date.now() - start;
    if (error) { addResult(false, `Ping-insert misslyckades: ${error.message}`); setRunning(false); return; }
    if (data?.id) await supabase.from("tasks").delete().eq("id", data.id);
    addResult(true, `Realtime-ping: DB insert/delete rundtur tog ${insertMs} ms.`);
    setRunning(false);
  }

  // ---- Data integrity ----
  async function checkDataIntegrity() {
    setRunning(true);
    const issues: string[] = [];

    // Tasks with no store
    const { count: noStore } = await supabase.from("tasks").select("id", { count: "exact", head: true }).is("store_id", null);
    if ((noStore ?? 0) > 0) issues.push(`${noStore} uppgifter saknar store_id`);

    // Recurring tasks with no recurrence_rule
    const { count: badRec } = await supabase.from("tasks").select("id", { count: "exact", head: true })
      .not("recurring", "is", null).is("recurrence_rule", null);
    if ((badRec ?? 0) > 0) issues.push(`${badRec} återkommande uppgifter saknar recurrence_rule`);

    // Incidents with no store
    const { count: noStoreInc } = await supabase.from("incidents").select("id", { count: "exact", head: true }).is("store_id", null);
    if ((noStoreInc ?? 0) > 0) issues.push(`${noStoreInc} avvikelser saknar store_id`);

    // Expired sessions
    const { count: expiredSessions } = await supabase.from("app_sessions").select("id", { count: "exact", head: true })
      .lt("expires_at", new Date().toISOString());
    if ((expiredSessions ?? 0) > 0) issues.push(`${expiredSessions} utgångna sessioner i databasen`);

    // Employee mappings without app_user
    const { count: unmapped } = await supabase.from("employee_mappings").select("id", { count: "exact", head: true }).is("app_user_id", null);
    if ((unmapped ?? 0) > 0) issues.push(`${unmapped} anställda mappningar saknar app_user_id`);

    if (issues.length === 0) addResult(true, "Dataintegritet OK — inga problem hittades.");
    else issues.forEach(i => addResult(false, `Integritetsproblem: ${i}`));
    setRunning(false);
  }

  async function purgeExpiredSessions() {
    setRunning(true);
    const { count, error } = await supabase.from("app_sessions").delete().lt("expires_at", new Date().toISOString());
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `${count ?? 0} utgångna sessioner raderade.`);
    await loadStats();
    setRunning(false);
  }

  async function purgeOldAuditLog() {
    setRunning(true);
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { count, error } = await supabase.from("audit_log").delete().lt("created_at", cutoff);
    if (error) addResult(false, `Misslyckades: ${error.message}`);
    else addResult(true, `${count ?? 0} audit-logg-poster äldre än 30 dagar raderade.`);
    await loadStats();
    setRunning(false);
  }

  // ---- Schedule ----
  async function checkScheduleData() {
    setRunning(true);
    const [imports, shifts, employees, deliveries] = await Promise.all([
      supabase.from("schedule_imports").select("id, week_number, year, filename, store_id").order("imported_at", { ascending: false }).limit(5),
      supabase.from("schedule_shifts").select("id", { count: "exact", head: true }),
      supabase.from("schedule_employees").select("id", { count: "exact", head: true }),
      supabase.from("delivery_plans").select("id, week_number, year, filename").order("imported_at", { ascending: false }).limit(5),
    ]);
    addResult(true, `Schema: ${shifts.count ?? 0} pass, ${employees.count ?? 0} anställda i ${(imports.data ?? []).length} importer.`);
    (imports.data ?? []).forEach(imp => addResult(true, `  Import: v${imp.week_number}/${imp.year} — ${imp.filename}`));
    addResult(true, `Leveransplan: ${(deliveries.data ?? []).length} planer.`);
    (deliveries.data ?? []).forEach(d => addResult(true, `  Leverans: v${d.week_number}/${d.year} — ${d.filename}`));
    setRunning(false);
  }

  async function deleteAllScheduleImports() {
    if (!activeStore) { addResult(false, "Välj en aktiv butik först."); return; }
    setRunning(true);
    const { count: shiftCount } = await supabase.from("schedule_imports")
      .select("id", { count: "exact", head: true }).eq("store_id", activeStore.id);
    await supabase.from("schedule_imports").delete().eq("store_id", activeStore.id);
    addResult(true, `${shiftCount ?? 0} schemaimporter (+ alla pass) raderade för ${activeStore.name}.`);
    await loadStats();
    setRunning(false);
  }

  // ---- Users ----
  async function listInactiveUsers() {
    setRunning(true);
    const { data, error } = await supabase.from("app_users").select("id, display_name, username, role, last_login")
      .eq("is_active", false);
    if (error) { addResult(false, `Misslyckades: ${error.message}`); setRunning(false); return; }
    if ((data ?? []).length === 0) addResult(true, "Inga inaktiva användare.");
    else (data ?? []).forEach(u => addResult(false, `Inaktiv: ${u.display_name} (${u.username}) — roll: ${u.role}, senast inloggad: ${u.last_login ? new Date(u.last_login).toLocaleDateString("sv-SE") : "aldrig"}`));
    setRunning(false);
  }

  async function listNeverLoggedIn() {
    setRunning(true);
    const { data, error } = await supabase.from("app_users").select("id, display_name, username, role, created_at")
      .is("last_login", null).eq("is_active", true);
    if (error) { addResult(false, `Misslyckades: ${error.message}`); setRunning(false); return; }
    if ((data ?? []).length === 0) addResult(true, "Alla aktiva användare har loggat in minst en gång.");
    else (data ?? []).forEach(u => addResult(false, `Aldrig inloggad: ${u.display_name} (${u.username}) — skapad: ${new Date(u.created_at).toLocaleDateString("sv-SE")}`));
    setRunning(false);
  }

  async function listUsersWithoutStore() {
    setRunning(true);
    const { data: allUsers } = await supabase.from("app_users").select("id, display_name, username").eq("is_active", true);
    const { data: storeLinks } = await supabase.from("user_stores").select("user_id");
    const linkedIds = new Set((storeLinks ?? []).map(s => s.user_id));
    const unlinked = (allUsers ?? []).filter(u => !linkedIds.has(u.id));
    if (unlinked.length === 0) addResult(true, "Alla aktiva användare är kopplade till minst en butik.");
    else unlinked.forEach(u => addResult(false, `Ingen butik: ${u.display_name} (${u.username})`));
    setRunning(false);
  }

  // ---- File format inspector ----
  type FileInspection = {
    name: string;
    type: "csv" | "xml";
    encoding: string;
    sizeKb: number;
    columns?: string[];
    rowCount?: number;
    sampleRows?: Record<string, string>[];
    rootTags?: string[];
    recordTag?: string;
    sampleFields?: { tag: string; sample: string }[];
    recordCount?: number;
    error?: string;
  };

  const [fileInspections, setFileInspections] = useState<FileInspection[]>([]);
  const fileInspectorRef = useRef<HTMLInputElement>(null);

  async function inspectFile(file: File): Promise<FileInspection> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isXml = ext === "xml";
    const isCsv = ext === "csv";
    const sizeKb = Math.round(file.size / 1024 * 10) / 10;

    // Detect encoding
    const buf = await file.arrayBuffer();
    const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const hasReplacement = utf8Text.includes("\uFFFD");
    const encoding = hasReplacement ? "Windows-1252 (ISO-8859-1)" : "UTF-8";
    const text = hasReplacement
      ? (() => { try { return new TextDecoder("windows-1252").decode(buf); } catch { return utf8Text; } })()
      : utf8Text;

    if (isXml) {
      try {
        const doc = new DOMParser().parseFromString(text, "text/xml");
        if (doc.querySelector("parsererror")) {
          return { name: file.name, type: "xml", encoding, sizeKb, error: "Ogiltig XML — parsererror." };
        }
        const root = doc.documentElement.tagName;
        // Find repeating tags by counting tag occurrences at second level
        const children = Array.from(doc.documentElement.children);
        const tagCounts: Record<string, number> = {};
        children.forEach(c => { tagCounts[c.tagName] = (tagCounts[c.tagName] ?? 0) + 1; });
        // Also check grandchildren
        const grandChildCounts: Record<string, number> = {};
        children.forEach(c => Array.from(c.children).forEach(gc => { grandChildCounts[gc.tagName] = (grandChildCounts[gc.tagName] ?? 0) + 1; }));

        // Find the record tag (most repeated)
        let recordTag = "";
        let recordCount = 0;
        let sampleEl: Element | null = null;

        const allTags = { ...tagCounts, ...grandChildCounts };
        for (const [tag, count] of Object.entries(allTags)) {
          if (count > recordCount) { recordCount = count; recordTag = tag; }
        }

        if (recordTag) {
          sampleEl = doc.querySelector(recordTag);
        }

        const sampleFields = sampleEl
          ? Array.from(sampleEl.children).slice(0, 15).map(c => ({ tag: c.tagName, sample: c.textContent?.trim().slice(0, 60) ?? "" }))
          : [];

        const rootTags = [root, ...Object.keys(tagCounts).slice(0, 5)];
        return { name: file.name, type: "xml", encoding, sizeKb, rootTags, recordTag, recordCount, sampleFields };
      } catch (e) {
        return { name: file.name, type: "xml", encoding, sizeKb, error: String(e) };
      }
    }

    if (isCsv) {
      try {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) return { name: file.name, type: "csv", encoding, sizeKb, error: "Tom fil." };

        // Detect delimiter: try ; then , then \t
        const firstLine = lines[0];
        const delim = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";

        const parseRow = (line: string) => {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQuotes = !inQuotes; continue; }
            if (c === delim && !inQuotes) { result.push(current.trim()); current = ""; continue; }
            current += c;
          }
          result.push(current.trim());
          return result;
        };

        const columns = parseRow(lines[0]);
        const rowCount = lines.length - 1;
        const sampleRows = lines.slice(1, 4).map(l => {
          const vals = parseRow(l);
          const row: Record<string, string> = {};
          columns.forEach((col, i) => { row[col] = vals[i] ?? ""; });
          return row;
        });

        return { name: file.name, type: "csv", encoding, sizeKb, columns, rowCount, sampleRows };
      } catch (e) {
        return { name: file.name, type: "csv", encoding, sizeKb, error: String(e) };
      }
    }

    return { name: file.name, type: "csv", encoding, sizeKb, error: "Okänt filformat. Endast CSV och XML stöds." };
  }

  async function handleInspectorFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setFileInspections([]);
    const results = await Promise.all(files.map(inspectFile));
    setFileInspections(results);
    if (fileInspectorRef.current) fileInspectorRef.current.value = "";
  }

  // ---- Debug / cleanup ----
  async function deleteTestData() {
    setRunning(true);
    const { data: testTaskRows } = await supabase.from("tasks").select("id").like("title", "[TEST]%");
    const ids = (testTaskRows ?? []).map(t => t.id);
    if (ids.length > 0) {
      const { data: imgRows } = await supabase.from("task_images").select("storage_path").in("task_id", ids);
      deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
    }
    const [t, i] = await Promise.all([
      supabase.from("tasks").delete().like("title", "[TEST]%"),
      supabase.from("incidents").delete().like("title", "[TEST]%"),
    ]);
    const errs = [t.error, i.error].filter(Boolean);
    if (errs.length) addResult(false, `Rensning: ${errs.map(e => e?.message).join("; ")}`);
    else addResult(true, `Alla [TEST]-uppgifter och [TEST]-avvikelser raderade (${ids.length} uppgifter, bilder inräknade).`);
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

  const statItems = stats ? [
    { label: "Uppgifter", value: stats.tasks },
    { label: "Avvikelser", value: stats.incidents },
    { label: "Notiser", value: stats.notifications },
    { label: "Användare", value: stats.users },
    { label: "Mallar", value: stats.templates },
    { label: "Schema-importer", value: stats.scheduleImports },
    { label: "Pass", value: stats.scheduleShifts },
    { label: "Leveransplaner", value: stats.deliveryPlans },
    { label: "Task-bilder", value: stats.taskImages },
    { label: "Inc.-bilder", value: stats.incidentImages },
    { label: "Sessioner", value: stats.sessions },
    { label: "Audit-poster", value: stats.auditEntries },
  ] : [];

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Testpanel"
        description="Admin-verktyg för att testa flöden, simulera tid, granska data och rensa upp."
      />

      <div className="mt-2 mb-6 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Denna panel är endast synlig för administratörer. Åtgärder kan skapa och permanent radera data i databasen.</span>
      </div>

      {/* DB Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-12">
          {statItems.map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-border/60 bg-card p-3 text-center shadow-[var(--shadow-sm)]">
              <p className="text-xl font-black text-foreground">{value}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">

        {/* Time Simulation */}
        <Section icon={Clock} title="Tidssimulering" span2>
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
              <Input type="number" min="1" value={timeAmount} onChange={(e) => setTimeAmount(e.target.value)} className="h-9 text-sm" />
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
            <Button size="sm" className="rounded-full h-9" onClick={applyTimeSimulation} disabled={running}>Simulera</Button>
            <Button size="sm" variant="outline" className="rounded-full h-9" onClick={resetTime} disabled={running}>Återställ + rensa</Button>
          </div>
        </Section>

        {/* Notifications */}
        <Section icon={Bell} title="Notiser">
          <p className="mb-3 text-xs text-muted-foreground">Testa och rensa notifieringssystemet.</p>
          <div className="space-y-2">
            <ActionBtn label="Skicka testnotis" onClick={testNotification} disabled={running} variant="default" />
            <ActionBtn label="Skicka 5 bulk-notiser" onClick={testBulkNotifications} disabled={running} />
            <ActionBtn label="Rensa mina notiser" onClick={clearMyNotifications} disabled={running} danger />
            <ActionBtn label="Radera alla lästa notiser (alla användare)" onClick={clearReadNotificationsAllUsers} disabled={running} danger />
            <ActionBtn label="Radera ALLA notiser (alla användare)" onClick={clearAllNotificationsAllUsers} disabled={running} danger />
          </div>
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">Anpassat meddelande</Label>
            <div className="flex gap-2">
              <Input placeholder="Notis-text..." value={customMsg} onChange={(e) => setCustomMsg(e.target.value)} className="h-8 text-sm" />
              <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={sendCustomNotification} disabled={running || !customMsg.trim()}>Skicka</Button>
            </div>
          </div>
        </Section>

        {/* Tasks */}
        <Section icon={ListChecks} title="Uppgifter">
          <p className="mb-3 text-xs text-muted-foreground">
            Aktiv butik: <strong>{activeStore?.name ?? "ingen vald"}</strong>
          </p>
          <div className="space-y-2">
            <ActionBtn label="Testa skapa + radera" onClick={testTaskCreation} disabled={running} variant="default" />
            <ActionBtn label="Bulk: skapa 6 uppgifter" onClick={bulkCreateTasks} disabled={running} />
            <ActionBtn label="Skapa försenad uppgift" onClick={createOverdueTask} disabled={running} />
            <ActionBtn label="Skapa uppgift med steg + frågor" onClick={createTaskWithQuestions} disabled={running} />
            <ActionBtn label="Återkommande (använder sim-tid)" onClick={createRecurringTask} disabled={running} />
            <ActionBtn label="Radera alla [TEST]-uppgifter" onClick={deleteAllTestTasks} disabled={running} danger />
          </div>
        </Section>

        {/* Incidents */}
        <Section icon={TriangleAlert} title="Avvikelser">
          <p className="mb-3 text-xs text-muted-foreground">
            Aktiv butik: <strong>{activeStore?.name ?? "ingen vald"}</strong>
          </p>
          <div className="space-y-2">
            <ActionBtn label="Testa skapa + radera" onClick={testIncidentCreation} disabled={running} variant="default" />
            <ActionBtn label="Skapa eskalerad avvikelse" onClick={createEscalatedIncident} disabled={running} />
            <ActionBtn label="Radera alla [TEST]-avvikelser" onClick={deleteAllTestIncidents} disabled={running} danger />
            <ActionBtn label={`Radera ALLA avvikelser för ${activeStore?.name ?? "aktiv butik"}`} onClick={deleteAllIncidentsForStore} disabled={running || !activeStore} danger />
          </div>
        </Section>

        {/* Storage & Images */}
        <Section icon={ImageIcon} title="Bilder & Lagring">
          <p className="mb-3 text-xs text-muted-foreground">
            Testa bildkomprimering och hitta/rensa herrelösa filer i Storage.
          </p>
          <div className="space-y-2">
            <ActionBtn label="Testa bildkomprimering (syntetisk bild)" onClick={testImageCompression} disabled={running} variant="default" />
            <ActionBtn label="Kontrollera herrelösa task-bilder" onClick={checkOrphanedTaskImages} disabled={running} />
            <ActionBtn label="Rensa herrelösa task-bilder (DB + Storage)" onClick={purgeOrphanedTaskImages} disabled={running} danger />
            <ActionBtn label="Kontrollera herrelösa incident-bilder" onClick={checkOrphanedIncidentImages} disabled={running} />
            <ActionBtn label="Rensa herrelösa incident-bilder (DB + Storage)" onClick={purgeOrphanedIncidentImages} disabled={running} danger />
          </div>
        </Section>

        {/* Realtime */}
        <Section icon={realtimeStatus === "connected" ? Wifi : realtimeStatus === "error" ? WifiOff : Wifi} title="Realtid & WebSocket">
          <p className="mb-3 text-xs text-muted-foreground">
            Verifiera att Supabase Realtime-kanalen ansluter och att DB-operationer är snabba.
          </p>
          <div className={cn(
            "mb-3 rounded-lg px-3 py-2 text-xs font-medium",
            realtimeStatus === "connected" ? "bg-success/10 text-success"
              : realtimeStatus === "error" ? "bg-destructive/10 text-destructive"
                : "bg-muted/60 text-muted-foreground"
          )}>
            Status: {realtimeStatus === "connected" ? "Ansluten" : realtimeStatus === "error" ? "Fel" : "Ej testad"}
          </div>
          <div className="space-y-2">
            <ActionBtn label="Testa WebSocket-anslutning" onClick={testRealtimeConnection} disabled={running} variant="default" />
            <ActionBtn label="Mät DB-rundtur (insert/delete)" onClick={testRealtimePing} disabled={running} />
          </div>
        </Section>

        {/* Templates */}
        <Section icon={FileText} title="Mallar">
          <p className="mb-3 text-xs text-muted-foreground">Testa hämtning av mallar inklusive steg och frågor.</p>
          <div className="space-y-2">
            <ActionBtn label="Hämta mallar (visa detaljer)" onClick={testTemplateUsage} disabled={running} variant="default" />
          </div>
        </Section>

        {/* Security & RLS */}
        <Section icon={Shield} title="Säkerhet & RLS">
          <p className="mb-3 text-xs text-muted-foreground">Verifiera SELECT-behörigheter och testa att cross-store INSERT blockeras.</p>
          <div className="space-y-2">
            <ActionBtn label="Kör RLS SELECT-kontroll (10 tabeller)" onClick={testRlsPolicy} disabled={running} variant="default" />
            <ActionBtn label="Testa cross-store INSERT-blockering" onClick={testRlsInsertProtection} disabled={running} />
          </div>
        </Section>

        {/* Users */}
        <Section icon={Users} title="Användare">
          <p className="mb-3 text-xs text-muted-foreground">Granska användarkvalitet och kopplingsproblem.</p>
          <div className="space-y-2">
            <ActionBtn label="Lista inaktiva användare" onClick={listInactiveUsers} disabled={running} variant="default" />
            <ActionBtn label="Lista användare som aldrig loggat in" onClick={listNeverLoggedIn} disabled={running} />
            <ActionBtn label="Lista användare utan butiksknytning" onClick={listUsersWithoutStore} disabled={running} />
          </div>
        </Section>

        {/* Schedule */}
        <Section icon={CalendarDays} title="Schema & Leveransplan">
          <p className="mb-3 text-xs text-muted-foreground">Inspektera importerade scheman och leveransplaner.</p>
          <div className="space-y-2">
            <ActionBtn label="Visa senaste 5 importer" onClick={checkScheduleData} disabled={running} variant="default" />
            <ActionBtn label={`Radera ALLA schemaimporter för ${activeStore?.name ?? "aktiv butik"}`} onClick={deleteAllScheduleImports} disabled={running || !activeStore} danger />
          </div>
        </Section>

        {/* Data integrity */}
        <Section icon={Bug} title="Dataintegritet">
          <p className="mb-3 text-xs text-muted-foreground">Hitta inkonsistens i databasen: null-referens, saknade FK, utgångna poster.</p>
          <div className="space-y-2">
            <ActionBtn label="Kör integritetscheck" onClick={checkDataIntegrity} disabled={running} variant="default" />
            <ActionBtn label="Rensa utgångna sessioner" onClick={purgeExpiredSessions} disabled={running} danger />
            <ActionBtn label="Rensa audit-logg äldre än 30 dagar" onClick={purgeOldAuditLog} disabled={running} danger />
          </div>
        </Section>

        {/* File Format Inspector */}
        <Section icon={FileSearch} title="Filformatsinspektör" span2>
          <p className="mb-3 text-xs text-muted-foreground">
            Ladda upp CSV- eller XML-filer för att se struktur, kolumner, taggar och exempelvärden. Hjälper till att konfigurera importers korrekt.
          </p>
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/30 px-6 py-8 transition hover:border-primary/40 hover:bg-muted/50"
            onClick={() => fileInspectorRef.current?.click()}
          >
            <Upload className="mb-2 h-7 w-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">Välj en eller flera CSV/XML-filer</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Klicka för att bläddra — flera filer kan väljas</p>
            <input ref={fileInspectorRef} type="file" accept=".csv,.xml,text/csv,text/xml" multiple className="hidden" onChange={handleInspectorFiles} />
          </div>

          {fileInspections.length > 0 && (
            <div className="mt-4 space-y-4">
              {fileInspections.map((ins, i) => (
                <div key={i} className="rounded-xl border border-border/60 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-2.5 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        ins.type === "csv" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                      )}>{ins.type}</span>
                      <span className="text-sm font-medium">{ins.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{ins.sizeKb} KB</span>
                      <span className={cn("rounded-full px-2 py-0.5", ins.encoding.includes("Windows") ? "bg-warning/15 text-warning-foreground" : "bg-success/10 text-success")}>{ins.encoding}</span>
                    </div>
                  </div>

                  {ins.error ? (
                    <div className="px-4 py-3 text-sm text-destructive">{ins.error}</div>
                  ) : ins.type === "csv" ? (
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">{ins.columns?.length} kolumner ({ins.rowCount} rader)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ins.columns?.map((col, ci) => (
                            <span key={ci} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">{col || `(tom ${ci + 1})`}</span>
                          ))}
                        </div>
                      </div>
                      {(ins.sampleRows ?? []).length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Exempelrader</p>
                          <div className="overflow-x-auto rounded-lg border border-border/50">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="border-b border-border/50 bg-muted/40">
                                  {ins.columns?.map((col, ci) => (
                                    <th key={ci} className="px-2.5 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{col || `(${ci + 1})`}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/40">
                                {ins.sampleRows?.map((row, ri) => (
                                  <tr key={ri} className="hover:bg-muted/20">
                                    {ins.columns?.map((col, ci) => (
                                      <td key={ci} className="px-2.5 py-1.5 font-mono text-muted-foreground max-w-[200px] truncate">{row[col] || "—"}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Struktur</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ins.rootTags?.map((tag, ti) => (
                            <span key={ti} className="rounded-full bg-orange-100 text-orange-700 px-2.5 py-0.5 text-[11px] font-medium">{`<${tag}>`}</span>
                          ))}
                        </div>
                      </div>
                      {ins.recordTag && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">
                            Postelement: <span className="font-mono text-orange-700">{ins.recordTag}</span> ({ins.recordCount} poster)
                          </p>
                          {(ins.sampleFields ?? []).length > 0 && (
                            <div className="overflow-hidden rounded-lg border border-border/50">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="border-b border-border/50 bg-muted/40">
                                    <th className="px-2.5 py-1.5 text-left font-medium text-muted-foreground">Tagg</th>
                                    <th className="px-2.5 py-1.5 text-left font-medium text-muted-foreground">Exempelvärde</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                  {ins.sampleFields?.map((f, fi) => (
                                    <tr key={fi} className="hover:bg-muted/20">
                                      <td className="px-2.5 py-1.5 font-mono text-orange-700">&lt;{f.tag}&gt;</td>
                                      <td className="px-2.5 py-1.5 text-muted-foreground">{f.sample || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Debug */}
        <Section icon={Database} title="Debug & Rensning" span2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={loadStats} disabled={running}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Uppdatera statistik
            </Button>
            <Button size="sm" variant="outline" className="rounded-full"
              onClick={() => { setShowAudit((v) => !v); if (!showAudit) loadAuditLog(); }}
              disabled={running}
            >
              {showAudit ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
              Visa audit-logg
            </Button>
            <Button size="sm" variant="outline" className="rounded-full text-destructive hover:text-destructive"
              onClick={deleteTestData} disabled={running}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Radera all [TEST]-data
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
                ) : auditLog.map((entry) => (
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
                    {entry.actor && <p className="mt-0.5 text-[10px] text-muted-foreground">av {entry.actor.display_name}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Results log */}
      {results.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Resultatlogg ({results.length})</h3>
            <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => setResults([])}>Rensa</Button>
          </div>
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div key={i} className={cn(
                "flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm",
                r.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              )}>
                {r.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                }
                <span className="flex-1 font-mono text-xs">{r.msg}</span>
                <span className="shrink-0 text-xs opacity-60">{r.ts}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
