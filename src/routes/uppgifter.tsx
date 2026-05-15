import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  CircleCheck as CheckCircle2, Circle, Clock, Download, ImagePlus, ListChecks,
  Plus, Repeat, Store, X, Search, FileText, Users, Image as ImageIcon,
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
import {
  supabase, type Task, type TaskStep, type Store as StoreType, type AppUser,
  type ChecklistTemplate, type ChecklistTemplateItem, type TaskAssignee, type TaskImage, type UserGroup,
  logAudit, createNotification, notifyUsers, uploadAttachment, getPublicUrl,
} from "@/lib/supabase";
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

type TaskFull = Task & {
  steps: TaskStep[];
  store?: StoreType;
  assignees?: (TaskAssignee & { user?: AppUser; group?: UserGroup })[];
  images?: TaskImage[];
};

const emptyForm = (storeId: string) => ({
  title: "",
  description: "",
  category: "Drift",
  priority: "Medel",
  store_id: storeId,
  due_date: "",
  recurrence_rule: "",
  recurrence_days: [] as number[],
  recurrence_interval: 1,
  recurrence_start: "",
  recurrence_end: "",
  steps: [""] as string[],
  assigneeUserIds: [] as string[],
  assigneeGroupIds: [] as string[],
});

function TasksPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const [tasks, setTasks] = useState<TaskFull[]>([]);
  const [storeUsers, setStoreUsers] = useState<AppUser[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [templates, setTemplates] = useState<(ChecklistTemplate & { items: ChecklistTemplateItem[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState(emptyForm(activeStore?.id ?? ""));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTasks = async () => {
    let q = supabase
      .from("tasks")
      .select("*, store:stores(*), steps:task_steps(*), assignees:task_assignees(*, user:app_users(id,display_name,username), group:user_groups(id,name)), images:task_images(*)")
      .order("created_at", { ascending: false });

    if (activeStore) {
      q = q.eq("store_id", activeStore.id);
    } else if (userStores.length > 0) {
      q = q.in("store_id", userStores.map((s) => s.id));
    }

    const { data } = await q;
    if (data) setTasks(data as TaskFull[]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchTasks();

    const storeQ = user?.role === "admin"
      ? supabase.from("stores").select("*").eq("is_active", true)
      : supabase.from("stores").select("*").in("id", userStores.map((s) => s.id));
    storeQ.then(({ data }) => { if (data) setStores(data as StoreType[]); });

    supabase.from("checklist_templates").select("*, items:checklist_template_items(*)").then(({ data }) => {
      if (data) setTemplates(data as (ChecklistTemplate & { items: ChecklistTemplateItem[] })[]);
    });

    // Load users for this store
    if (activeStore) {
      supabase.from("user_stores").select("user_id, user:app_users(*)").eq("store_id", activeStore.id)
        .then(({ data }) => {
          if (data) setStoreUsers((data as { user: AppUser }[]).map(d => d.user).filter(Boolean));
        });
      supabase.from("user_groups").select("*").eq("store_id", activeStore.id)
        .then(({ data }) => { if (data) setGroups(data as UserGroup[]); });
    } else {
      supabase.from("app_users").select("*").eq("is_active", true)
        .then(({ data }) => { if (data) setStoreUsers(data as AppUser[]); });
      supabase.from("user_groups").select("*")
        .then(({ data }) => { if (data) setGroups(data as UserGroup[]); });
    }

    setNewTask(emptyForm(activeStore?.id ?? ""));
  }, [activeStore, user]);

  const applyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    const steps = (tmpl.items ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((it) => it.label);
    setNewTask((p) => ({
      ...p,
      title: p.title || tmpl.title,
      category: tmpl.category || p.category,
      steps: steps.length > 0 ? steps : [""],
    }));
  };

  const toggleStep = async (taskId: string, stepId: string, current: boolean) => {
    await supabase.from("task_steps").update({ is_done: !current }).eq("id", stepId);
    setTasks((prev) =>
      prev.map((t) =>
        t.id !== taskId ? t
          : { ...t, steps: t.steps.map((s) => s.id === stepId ? { ...s, is_done: !s.is_done } : s) }
      )
    );
  };

  const completeTask = async (task: TaskFull) => {
    const isDone = task.status === "done";
    const newStatus = isDone ? "todo" : "done";
    await supabase.from("tasks").update({
      status: newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
    }).eq("id", task.id);
    if (newStatus === "done") {
      await supabase.from("task_steps").update({ is_done: true }).eq("task_id", task.id);
      logAudit(user?.id ?? null, "task.complete", "tasks", task.id, { title: task.title });
      // Notify creator and assignees
      const notifyIds = new Set<string>();
      if (task.created_by && task.created_by !== user?.id) notifyIds.add(task.created_by);
      task.assignees?.forEach(a => { if (a.user_id && a.user_id !== user?.id) notifyIds.add(a.user_id); });
      notifyUsers([...notifyIds], "task_done", `Uppgift klar: ${task.title}`, `Slutförd av ${user?.display_name}`, "/uppgifter");
    } else {
      await supabase.from("task_steps").update({ is_done: false }).eq("task_id", task.id);
    }
    fetchTasks();
  };

  const createTask = async () => {
    setSaveError("");
    if (!newTask.title.trim()) { setSaveError("Titel är obligatorisk."); return; }
    if (!isManager) return;
    setSaving(true);

    const { data: task, error } = await supabase.from("tasks").insert({
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
      assigned_to: newTask.assigneeUserIds[0] ?? user?.id,
      status: "todo",
    }).select().maybeSingle();

    if (error) {
      setSaveError("Kunde inte spara uppgiften. Försök igen.");
      setSaving(false);
      return;
    }

    if (task) {
      // Steps
      const validSteps = newTask.steps.filter((s) => s.trim());
      if (validSteps.length > 0) {
        await supabase.from("task_steps").insert(
          validSteps.map((label, i) => ({
            task_id: task.id,
            label,
            sort_order: i,
            requires_photo: label.toLowerCase().includes("foto"),
          }))
        );
      }

      // Assignees
      const assigneeRows: { task_id: string; user_id?: string; group_id?: string }[] = [];
      newTask.assigneeUserIds.forEach(uid => assigneeRows.push({ task_id: task.id, user_id: uid }));
      newTask.assigneeGroupIds.forEach(gid => assigneeRows.push({ task_id: task.id, group_id: gid }));
      if (assigneeRows.length > 0) {
        await supabase.from("task_assignees").insert(assigneeRows);
      }

      // Images
      if (uploadFiles.length > 0) {
        for (const file of uploadFiles) {
          const path = await uploadAttachment(file, `tasks/${task.id}`);
          if (path) {
            await supabase.from("task_images").insert({ task_id: task.id, storage_path: path, uploaded_by: user?.id });
          }
        }
      }

      logAudit(user?.id ?? null, "task.create", "tasks", task.id, { title: task.title });

      // Notify assigned users
      const notifyIds = new Set<string>();
      newTask.assigneeUserIds.forEach(uid => { if (uid !== user?.id) notifyIds.add(uid); });
      // Expand groups to get member user IDs
      if (newTask.assigneeGroupIds.length > 0) {
        const { data: members } = await supabase
          .from("user_group_members")
          .select("user_id")
          .in("group_id", newTask.assigneeGroupIds);
        members?.forEach(m => { if (m.user_id !== user?.id) notifyIds.add(m.user_id); });
      }
      if (notifyIds.size > 0) {
        notifyUsers([...notifyIds], "task_assigned", `Ny uppgift tilldelad: ${task.title}`, `Tilldelad av ${user?.display_name}`, "/uppgifter");
      }
    }

    await fetchTasks();
    setSaving(false);
    setShowCreate(false);
    setNewTask(emptyForm(activeStore?.id ?? ""));
    setUploadFiles([]);
  };

  const exportCSV = () => {
    const rows = [
      ["Titel", "Beskrivning", "Kategori", "Prioritet", "Status", "Butik", "Tilldelade", "Förfallodatum", "Återkommande", "Checkpoints", "Slutförd", "Skapad"],
      ...tasks.map((t) => [
        t.title,
        t.description ?? "",
        t.category,
        t.priority,
        t.status,
        t.store?.name ?? "",
        t.assignees?.map(a => a.user?.display_name ?? a.group?.name ?? "").filter(Boolean).join(", ") || "",
        t.due_date ? new Date(t.due_date).toLocaleDateString("sv-SE") : "",
        RECURRENCE_OPTIONS.find(r => r.value === t.recurrence_rule)?.label ?? "",
        t.steps?.map(s => `${s.is_done ? "[x]" : "[ ]"} ${s.label}`).join(" | ") || "",
        t.completed_at ? new Date(t.completed_at).toLocaleDateString("sv-SE") : "",
        new Date(t.created_at).toLocaleDateString("sv-SE"),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uppgifter-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const availableTemplates = templates;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Uppgifter"
        description={activeStore ? `Uppgifter för ${activeStore.name}` : "Standardiserade rutiner för alla butiker."}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" /> Exportera CSV
            </Button>
            {isManager && (
              <Button className="rounded-full" onClick={() => { setShowCreate(true); setSaveError(""); }}>
                <Plus className="mr-2 h-4 w-4" /> Ny uppgift
              </Button>
            )}
          </div>
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
                      {t.assignees && t.assignees.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {t.assignees.map(a => a.user?.display_name ?? a.group?.name).filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  {statusBadge(t.status)}
                </header>

                {/* Images */}
                {t.images && t.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto px-5 pt-3">
                    {t.images.map(img => (
                      <img key={img.id} src={getPublicUrl(img.storage_path)} alt="" className="h-16 w-16 rounded-lg object-cover border border-border/60" />
                    ))}
                  </div>
                )}

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
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                              <ImagePlus className="h-3 w-3" /> Foto
                            </span>
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
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setSaveError(""); setUploadFiles([]); } }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Ny uppgift</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            {/* Template selector */}
            {availableTemplates.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Använd mall</Label>
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger><SelectValue placeholder="Välj mall att fylla i från..." /></SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title} {t.category ? `(${t.category})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Titel *</Label>
              <Input placeholder="Uppgiftens titel" value={newTask.title}
                onChange={(e) => setNewTask(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivning</Label>
              <Input placeholder="Valfri beskrivning" value={newTask.description}
                onChange={(e) => setNewTask(p => ({ ...p, description: e.target.value }))} />
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
                <Select value={newTask.store_id || "__none"} onValueChange={(v) => setNewTask(p => ({ ...p, store_id: v === "__none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Välj butik" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Ingen</SelectItem>
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

            {/* Assignees */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Tilldela personer</Label>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                {storeUsers.map(u => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                    <Checkbox
                      checked={newTask.assigneeUserIds.includes(u.id)}
                      onCheckedChange={() => {
                        setNewTask(p => ({
                          ...p,
                          assigneeUserIds: p.assigneeUserIds.includes(u.id)
                            ? p.assigneeUserIds.filter(id => id !== u.id)
                            : [...p.assigneeUserIds, u.id]
                        }));
                      }}
                    />
                    <span className="text-sm">{u.display_name}</span>
                  </label>
                ))}
              </div>
            </div>

            {groups.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Tilldela grupper</Label>
                <div className="max-h-24 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                  {groups.map(g => (
                    <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                      <Checkbox
                        checked={newTask.assigneeGroupIds.includes(g.id)}
                        onCheckedChange={() => {
                          setNewTask(p => ({
                            ...p,
                            assigneeGroupIds: p.assigneeGroupIds.includes(g.id)
                              ? p.assigneeGroupIds.filter(id => id !== g.id)
                              : [...p.assigneeGroupIds, g.id]
                          }));
                        }}
                      />
                      <span className="text-sm">{g.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Recurrence */}
            <div className="space-y-1.5">
              <Label>Återkommande</Label>
              <Select value={newTask.recurrence_rule || "__none"} onValueChange={(v) => setNewTask(p => ({ ...p, recurrence_rule: v === "__none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value || "__none"} value={o.value || "__none"}>{o.label}</SelectItem>)}
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

            {/* File upload */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Bilder</Label>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files) setUploadFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
              <Button variant="outline" size="sm" className="w-full rounded-full" onClick={() => fileInputRef.current?.click()}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Välj bilder
              </Button>
              {uploadFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(f)} alt="" className="h-14 w-14 rounded-lg object-cover border border-border/60" />
                      <button type="button" className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-white"
                        onClick={() => setUploadFiles(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {saveError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Avbryt</Button>
            <Button onClick={createTask} disabled={saving || !newTask.title.trim()}>{saving ? "Sparar..." : "Skapa uppgift"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
