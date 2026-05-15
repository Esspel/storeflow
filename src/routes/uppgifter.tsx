import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CircleCheck as CheckCircle2, Circle, Clock, ImagePlus, ListChecks,
  Plus, Repeat, Store, X, Search, AlertTriangle,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, type Task, type TaskStep, type Store as StoreType, logAudit, createNotification } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/uppgifter")({
  component: TasksPage,
});

const RECURRENCE_OPTIONS = [
  { value: "", label: "Ingen" },
  { value: "daily", label: "Dagligen" },
  { value: "every_other_day", label: "Varannan dag" },
  { value: "weekly", label: "Varje vecka" },
  { value: "monthly", label: "Varje månad" },
  { value: "yearly", label: "Varje år" },
];

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function priorityClass(p: string) {
  switch (p) {
    case "Kritisk": return "bg-destructive/10 text-destructive";
    case "Hög": return "bg-warning/20 text-warning-foreground";
    case "Medel": return "bg-info/15 text-info";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusBadge(s: string) {
  if (s === "done") return <Badge className="bg-success/15 text-success hover:bg-success/20">Klar</Badge>;
  if (s === "progress") return <Badge className="bg-info/15 text-info hover:bg-info/20">Pågående</Badge>;
  if (s === "late") return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/15">Försenad</Badge>;
  return <Badge variant="secondary">Ej påbörjad</Badge>;
}

type TaskWithSteps = Task & { steps: TaskStep[]; store?: StoreType };

function TasksPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  const [tasks, setTasks] = useState<TaskWithSteps[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [filterStore, setFilterStore] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    category: "Drift",
    priority: "Medel",
    store_id: activeStore?.id ?? "",
    due_date: "",
    recurrence_rule: "",
    recurrence_days: [] as number[],
    recurrence_interval: 1,
    recurrence_start: "",
    recurrence_end: "",
    steps: [""],
  });
  const [saving, setSaving] = useState(false);

  const fetchTasks = async () => {
    let q = supabase.from("tasks").select("*, store:stores(*), steps:task_steps(*)").order("created_at", { ascending: false });
    if (!isAdmin && activeStore) {
      q = q.eq("store_id", activeStore.id);
    } else if (!isAdmin && userStores.length > 0) {
      q = q.in("store_id", userStores.map((s) => s.id));
    }
    const { data } = await q;
    if (data) setTasks(data as TaskWithSteps[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    const storeList = isAdmin
      ? supabase.from("stores").select("*").eq("is_active", true)
      : supabase.from("stores").select("*").in("id", userStores.map((s) => s.id));
    storeList.then(({ data }) => { if (data) setStores(data); });
    // Reset store filter on activeStore change
    setNewTask((p) => ({ ...p, store_id: activeStore?.id ?? "" }));
  }, [activeStore, user]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchTasks())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_steps" }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore]);

  const toggleStep = async (taskId: string, stepId: string, current: boolean) => {
    await supabase.from("task_steps").update({ is_done: !current }).eq("id", stepId);
    setTasks((prev) =>
      prev.map((t) =>
        t.id !== taskId ? t
          : { ...t, steps: t.steps.map((s) => s.id === stepId ? { ...s, is_done: !s.is_done } : s) }
      )
    );
  };

  const completeTask = async (task: TaskWithSteps) => {
    const isDone = task.status === "done";
    const newStatus = isDone ? "todo" : "done";
    await supabase.from("tasks").update({
      status: newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
    }).eq("id", task.id);
    if (newStatus === "done") {
      await supabase.from("task_steps").update({ is_done: true }).eq("task_id", task.id);
      logAudit(user?.id ?? null, "task.complete", "tasks", task.id, { title: task.title });
      // Notify assigned user
      if (task.assigned_to && task.assigned_to !== user?.id) {
        createNotification(task.assigned_to, "task_done", `Uppgift klar: ${task.title}`, "", "/uppgifter");
      }
    } else {
      await supabase.from("task_steps").update({ is_done: false }).eq("task_id", task.id);
    }
    fetchTasks();
  };

  const createTask = async () => {
    if (!newTask.title.trim()) return;
    if (!isManager) return; // employees can't create
    setSaving(true);
    const { data: task } = await supabase.from("tasks").insert({
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      category: newTask.category,
      priority: newTask.priority,
      store_id: newTask.store_id || null,
      due_date: newTask.due_date || null,
      recurring: newTask.recurrence_rule || null,
      recurrence_rule: newTask.recurrence_rule || null,
      recurrence_days: newTask.recurrence_days.length > 0 ? newTask.recurrence_days : null,
      recurrence_interval: newTask.recurrence_interval,
      recurrence_start: newTask.recurrence_start || null,
      recurrence_end: newTask.recurrence_end || null,
      created_by: user?.id,
      assigned_to: user?.id,
      status: "todo",
    }).select().maybeSingle();

    if (task) {
      const validSteps = newTask.steps.filter((s) => s.trim());
      if (validSteps.length > 0) {
        await supabase.from("task_steps").insert(
          validSteps.map((label, i) => ({ task_id: task.id, label, sort_order: i, requires_photo: label.toLowerCase().includes("foto") }))
        );
      }
      logAudit(user?.id ?? null, "task.create", "tasks", task.id, { title: task.title });
      await fetchTasks();
    }
    setSaving(false);
    setShowCreate(false);
    setNewTask({ title: "", description: "", category: "Drift", priority: "Medel", store_id: activeStore?.id ?? "", due_date: "", recurrence_rule: "", recurrence_days: [], recurrence_interval: 1, recurrence_start: "", recurrence_end: "", steps: [""] });
  };

  const filters = [
    { value: "all", label: "Alla" },
    { value: "todo", label: "Ej påbörjad" },
    { value: "progress", label: "Pågående" },
    { value: "done", label: "Klar" },
    { value: "late", label: "Försenad" },
  ];

  const visible = tasks.filter((t) => {
    if (tab !== "all" && t.status !== tab) return false;
    if (filterStore !== "all" && t.store_id !== filterStore) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Uppgifter & Checklistor"
        description="Standardiserade rutiner för alla butiker."
        actions={
          isManager ? (
            <Button className="rounded-full" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Ny uppgift
            </Button>
          ) : undefined
        }
      />

      {/* Filters row */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-full bg-muted/60 p-1">
            {filters.map((f) => (
              <TabsTrigger
                key={f.value} value={f.value}
                className="gap-2 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                {f.label}
                <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-medium text-muted-foreground">
                  {f.value === "all" ? tasks.length : tasks.filter((t) => t.status === f.value).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Sök uppgifter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-full pl-9 text-sm w-44"
            />
          </div>
          {(isAdmin || userStores.length > 1) && stores.length > 1 && (
            <Select value={filterStore} onValueChange={setFilterStore}>
              <SelectTrigger className="h-9 w-44 rounded-full text-sm"><SelectValue placeholder="Alla butiker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla butiker</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1,2,3].map(i => <div key={i} className="h-48 animate-pulse rounded-2xl bg-card" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <ListChecks className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Inga uppgifter hittades</p>
          {isManager && (
            <Button className="mt-4 rounded-full" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Skapa uppgift
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((t) => {
            const doneSteps = t.steps?.filter((s) => s.is_done).length ?? 0;
            const totalSteps = t.steps?.length ?? 0;
            return (
              <article key={t.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)]">
                <header className="flex items-start justify-between gap-3 border-b border-border/60 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", priorityClass(t.priority))}>{t.priority}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t.category}</span>
                      {t.recurrence_rule && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Repeat className="h-3 w-3" /> {RECURRENCE_OPTIONS.find(r => r.value === t.recurrence_rule)?.label ?? t.recurrence_rule}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold leading-tight">{t.title}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {t.store && <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" />{t.store.name}</span>}
                      {t.due_date && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(t.due_date).toLocaleDateString("sv-SE")}</span>}
                    </div>
                  </div>
                  {statusBadge(t.status)}
                </header>

                {totalSteps > 0 && (
                  <div className="p-5">
                    <div className="mb-3 flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium"><ListChecks className="h-3.5 w-3.5" /> Checkpoints</span>
                      <span className="text-muted-foreground">{doneSteps} / {totalSteps} klara</span>
                    </div>
                    <ul className="space-y-2">
                      {t.steps.map((step) => (
                        <li key={step.id} className="flex items-start gap-3">
                          <Checkbox checked={step.is_done} onCheckedChange={() => toggleStep(t.id, step.id, step.is_done)} className="mt-0.5" />
                          <span className={cn("flex-1 text-sm", step.is_done && "text-muted-foreground line-through")}>{step.label}</span>
                          {step.requires_photo && (
                            <button type="button" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary">
                              <ImagePlus className="h-3 w-3" /> Verifiera
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex items-center justify-end border-t border-border/60 pt-4">
                      <Button
                        size="sm"
                        variant={t.status === "done" ? "default" : "ghost"}
                        className="gap-1.5 rounded-full text-xs"
                        onClick={() => completeTask(t)}
                      >
                        {t.status === "done"
                          ? <><CheckCircle2 className="h-3.5 w-3.5" /> Markera öppen</>
                          : <><Circle className="h-3.5 w-3.5" /> Markera klar</>
                        }
                      </Button>
                    </div>
                  </div>
                )}

                {totalSteps === 0 && (
                  <div className="flex items-center justify-end border-t border-border/60 px-5 py-3">
                    <Button
                      size="sm" variant={t.status === "done" ? "default" : "ghost"}
                      className="gap-1.5 rounded-full text-xs"
                      onClick={() => completeTask(t)}
                    >
                      {t.status === "done"
                        ? <><CheckCircle2 className="h-3.5 w-3.5" /> Markera öppen</>
                        : <><Circle className="h-3.5 w-3.5" /> Markera klar</>
                      }
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* CREATE DIALOG */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Ny uppgift</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Titel *</Label>
              <Input placeholder="Uppgiftens titel" value={newTask.title}
                onChange={(e) => setNewTask(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={newTask.category} onValueChange={(v) => setNewTask(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Drift", "Säkerhet", "Visual Merchandising", "Kundärenden", "Övrigt"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioritet</Label>
                <Select value={newTask.priority} onValueChange={(v) => setNewTask(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Låg", "Medel", "Hög", "Kritisk"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Butik</Label>
                <Select value={newTask.store_id} onValueChange={(v) => setNewTask(p => ({ ...p, store_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Välj butik" /></SelectTrigger>
                  <SelectContent>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Förfallodatum</Label>
                <Input type="datetime-local" value={newTask.due_date}
                  onChange={(e) => setNewTask(p => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>

            {/* Recurrence */}
            <div className="space-y-1.5">
              <Label>Återkommande</Label>
              <Select value={newTask.recurrence_rule} onValueChange={(v) => setNewTask(p => ({ ...p, recurrence_rule: v }))}>
                <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {newTask.recurrence_rule === "weekly" && (
              <div className="space-y-1.5">
                <Label>Veckodagar</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day, idx) => (
                    <button
                      key={idx} type="button"
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                        newTask.recurrence_days.includes(idx)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border/60 text-muted-foreground hover:border-primary/50"
                      )}
                      onClick={() => {
                        const days = newTask.recurrence_days.includes(idx)
                          ? newTask.recurrence_days.filter(d => d !== idx)
                          : [...newTask.recurrence_days, idx];
                        setNewTask(p => ({ ...p, recurrence_days: days }));
                      }}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {newTask.recurrence_rule && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Startdatum</Label>
                  <Input type="date" value={newTask.recurrence_start}
                    onChange={(e) => setNewTask(p => ({ ...p, recurrence_start: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Slutdatum</Label>
                  <Input type="date" value={newTask.recurrence_end}
                    onChange={(e) => setNewTask(p => ({ ...p, recurrence_end: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Steps */}
            <div className="space-y-1.5">
              <Label>Checkpoints</Label>
              <div className="space-y-2">
                {newTask.steps.map((step, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder={`Checkpoint ${i + 1}`} value={step}
                      onChange={(e) => setNewTask(p => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? e.target.value : s) }))}
                    />
                    {newTask.steps.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => setNewTask(p => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full rounded-full" onClick={() => setNewTask(p => ({ ...p, steps: [...p.steps, ""] }))}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Lägg till checkpoint
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Avbryt</Button>
            <Button onClick={createTask} disabled={saving || !newTask.title}>{saving ? "Sparar..." : "Skapa uppgift"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
