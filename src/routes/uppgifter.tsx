import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { SquareCheck as CheckSquare, Plus, Search, ListFilter as Filter, Circle, CircleCheck as CheckCircle2, Clock, CircleAlert as AlertCircle, ChevronDown, X, MoveVertical as MoreVertical, CreditCard as Edit2, Trash2, RefreshCw, Calendar } from "lucide-react";
import { supabase, type Task, getSessionToken } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, formatDate, formatDateTime, statusColor, statusLabel, priorityColor } from "@/lib/utils";
import { toast } from "sonner";
import { addToOfflineQueue } from "@/lib/utils";

export const Route = createFileRoute("/uppgifter")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: UppgifterPage,
});

type StatusFilter = "alla" | "todo" | "progress" | "done" | "late";

function UppgifterPage() {
  const { user, activeStore } = useAuth();
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alla");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeStore) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*, app_users(display_name), task_steps(*), task_assignees(user_id, app_users(display_name))")
      .eq("store_id", activeStore.id)
      .order("created_at", { ascending: false });
    setTasks((data ?? []) as Task[]);
    setLoading(false);
  }, [activeStore]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeStore) return;
    const channel = supabase
      .channel(`tasks-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `store_id=eq.${activeStore.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore, load]);

  const filtered = useMemo(() => {
    let list = tasks;
    if (statusFilter !== "alla") list = list.filter(t => t.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    }
    return list;
  }, [tasks, search, statusFilter]);

  async function toggleStep(taskId: string, stepId: string, isDone: boolean) {
    if (!navigator.onLine) {
      addToOfflineQueue("toggle_step", { taskId, stepId, isDone: !isDone });
      toast.info("Sparas lokalt – synkas vid återanslutning");
    }
    await supabase.from("task_steps").update({ is_done: !isDone }).eq("id", stepId);
    // Check if all steps done -> auto-complete task
    const task = tasks.find(t => t.id === taskId);
    if (task?.task_steps && !isDone) {
      const allDone = task.task_steps.every(s => s.id === stepId ? true : s.is_done);
      if (allDone) {
        await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", taskId);
      }
    }
    load();
  }

  async function updateTaskStatus(id: string, status: Task["status"]) {
    await supabase.from("tasks").update({ status, ...(status === "done" ? { completed_at: new Date().toISOString() } : {}) }).eq("id", id);
    toast.success(status === "done" ? "Uppgift slutförd!" : "Status uppdaterad");
    load();
  }

  async function deleteTask(id: string) {
    if (!confirm("Ta bort uppgift?")) return;
    await supabase.from("tasks").delete().eq("id", id);
    toast.success("Uppgift borttagen");
    load();
  }

  const statusCounts = useMemo(() => ({
    alla: tasks.length,
    todo: tasks.filter(t => t.status === "todo").length,
    progress: tasks.filter(t => t.status === "progress").length,
    done: tasks.filter(t => t.status === "done").length,
    late: tasks.filter(t => t.status === "late").length,
  }), [tasks]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Uppgifter</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeStore?.name}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          {isMobile ? "Ny" : "Ny uppgift"}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {(["alla", "todo", "progress", "late", "done"] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {s === "alla" ? "Alla" : statusLabel(s)}
            <span className={cn("text-xs px-1.5 py-0.5 rounded-full",
              statusFilter === s ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              {statusCounts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Sök uppgifter..."
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-2/3 mb-2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center bg-card border border-border rounded-2xl">
            <CheckSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Inga uppgifter hittades</p>
          </div>
        ) : (
          filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              expanded={expandedTask === task.id}
              onExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
              onToggleStep={toggleStep}
              onStatusChange={updateTaskStatus}
              onEdit={() => setEditTask(task)}
              onDelete={() => deleteTask(task.id)}
              isManager={user?.role === "manager" || user?.role === "admin"}
            />
          ))
        )}
      </div>

      {(showCreate || editTask) && (
        <TaskDialog
          task={editTask}
          activeStore={activeStore}
          userId={user?.id ?? ""}
          onClose={() => { setShowCreate(false); setEditTask(null); }}
          onSave={() => { setShowCreate(false); setEditTask(null); load(); }}
        />
      )}
    </div>
  );
}

function TaskCard({ task, expanded, onExpand, onToggleStep, onStatusChange, onEdit, onDelete, isManager }: {
  task: Task; expanded: boolean;
  onExpand: () => void;
  onToggleStep: (taskId: string, stepId: string, isDone: boolean) => void;
  onStatusChange: (id: string, status: Task["status"]) => void;
  onEdit: () => void;
  onDelete: () => void;
  isManager: boolean;
}) {
  const completedSteps = task.task_steps?.filter(s => s.is_done).length ?? 0;
  const totalSteps = task.task_steps?.length ?? 0;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-2xl overflow-hidden transition-all",
        task.status === "late" && "border-destructive/30",
        task.status === "done" && "opacity-70"
      )}
      data-swipe-hint
    >
      <div className="p-4 flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => onStatusChange(task.id, task.status === "done" ? "todo" : "done")}
          className={cn(
            "mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
            task.status === "done" ? "border-success bg-success text-success-foreground" :
            task.status === "late" ? "border-destructive" : "border-border hover:border-primary"
          )}
          aria-label="Markera som klar"
        >
          {task.status === "done" && <Check className="w-3 h-3" />}
          {task.status === "late" && <AlertCircle className="w-3 h-3 text-destructive" />}
        </button>

        <div className="flex-1 min-w-0" onClick={onExpand} style={{ cursor: "pointer" }}>
          <div className="flex items-start gap-2">
            <p className={cn("text-sm font-medium text-foreground flex-1", task.status === "done" && "line-through text-muted-foreground")}>
              {task.title}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", priorityColor(task.priority))}>
                {task.priority}
              </span>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">{task.category}</span>
            {task.due_date && (
              <span className={cn("text-xs flex items-center gap-0.5", task.status === "late" ? "text-destructive" : "text-muted-foreground")}>
                <Clock className="w-3 h-3" />
                {formatDate(task.due_date)}
              </span>
            )}
            {totalSteps > 0 && (
              <span className="text-xs text-muted-foreground">{completedSteps}/{totalSteps} steg</span>
            )}
          </div>
          {totalSteps > 0 && (
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {isManager && (
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>

      {/* Expanded steps */}
      {expanded && task.task_steps && task.task_steps.length > 0 && (
        <div className="border-t border-border px-4 py-3 space-y-2 bg-muted/20">
          {task.task_steps.sort((a, b) => a.sort_order - b.sort_order).map(step => (
            <label key={step.id} className="flex items-center gap-3 cursor-pointer group">
              <div className={cn(
                "w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-all",
                step.is_done ? "border-success bg-success" : "border-border group-hover:border-primary"
              )}>
                {step.is_done && <Check className="w-3 h-3 text-success-foreground" />}
              </div>
              <input
                type="checkbox"
                checked={step.is_done}
                onChange={() => onToggleStep(task.id, step.id, step.is_done)}
                className="sr-only"
              />
              <span className={cn("text-sm text-foreground", step.is_done && "line-through text-muted-foreground")}>
                {step.label}
              </span>
              {step.requires_photo && !step.is_done && (
                <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded font-medium ml-auto shrink-0">📷 Foto krävs</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>;
}

function TaskDialog({ task, activeStore, userId, onClose, onSave }: {
  task: Task | null;
  activeStore: { id: string; name: string } | null;
  userId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [category, setCategory] = useState(task?.category ?? "Drift");
  const [priority, setPriority] = useState(task?.priority ?? "Medel");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date?.slice(0, 16) ?? "");
  const [steps, setSteps] = useState<{ id?: string; label: string; is_done: boolean; sort_order: number }[]>(
    task?.task_steps?.map(s => ({ id: s.id, label: s.label, is_done: s.is_done, sort_order: s.sort_order })) ?? []
  );
  const [newStep, setNewStep] = useState("");
  const [saving, setSaving] = useState(false);

  function addStep() {
    if (!newStep.trim()) return;
    setSteps(s => [...s, { label: newStep.trim(), is_done: false, sort_order: s.length }]);
    setNewStep("");
  }

  async function save() {
    if (!title || !activeStore) { toast.error("Fyll i titel"); return; }
    setSaving(true);
    try {
      if (task) {
        await supabase.from("tasks").update({ title, category, priority, description, due_date: dueDate || null }).eq("id", task.id);
        // Update steps
        for (const step of steps) {
          if (step.id) await supabase.from("task_steps").update({ label: step.label }).eq("id", step.id);
          else await supabase.from("task_steps").insert({ task_id: task.id, label: step.label, is_done: false, sort_order: step.sort_order, requires_photo: false });
        }
        toast.success("Uppgift uppdaterad");
      } else {
        const { data: newTask } = await supabase.from("tasks").insert({
          title, category, priority, description, due_date: dueDate || null,
          store_id: activeStore.id, created_by: userId, status: "todo",
        }).select().single();
        if (newTask && steps.length > 0) {
          await supabase.from("task_steps").insert(steps.map((s, i) => ({
            task_id: newTask.id, label: s.label, is_done: false, sort_order: i, requires_photo: false,
          })));
        }
        toast.success("Uppgift skapad");
      }
      onSave();
    } catch (e: unknown) {
      toast.error("Fel: " + String(e));
    }
    setSaving(false);
  }

  const inputCls = "w-full h-10 px-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full sm:max-w-md max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">{task ? "Redigera uppgift" : "Ny uppgift"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titel *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Uppgiftens titel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {["Drift", "Städning", "Påfyllning", "Administration", "Säkerhet", "Övrigt"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prioritet</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Task["priority"])} className={inputCls}>
                {["Låg", "Medel", "Hög", "Kritisk"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Förfallodatum</label>
            <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Beskrivning</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Steg / Checklista</label>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-foreground bg-muted/50 px-3 py-2 rounded-xl">{s.label}</span>
                <button onClick={() => setSteps(ss => ss.filter((_, j) => j !== i))} className="p-1.5 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={newStep}
                onChange={e => setNewStep(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addStep()}
                placeholder="Lägg till steg..."
                className={cn(inputCls, "flex-1")}
              />
              <button onClick={addStep} className="px-3 h-10 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Avbryt</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
              {saving ? "Sparar..." : "Spara"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
