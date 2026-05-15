import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck as CheckCircle2, Circle, Clock, Download, ImagePlus, ListChecks, Plus, Repeat, X, Search, FileText, Users, Image as ImageIcon, ChevronDown, ChevronUp, TriangleAlert as AlertTriangle, ZoomIn } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  supabase,
  type Task, type TaskStep, type TaskQuestion, type TaskImage,
  type Store as StoreType, type AppUser,
  type ChecklistTemplate, type ChecklistTemplateItem, type ChecklistTemplateQuestion,
  type TaskAssignee, type UserGroup,
  logAudit, createNotification, notifyUsers, uploadAttachment, getPublicUrl,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { getSimulatedNow } from "@/lib/time-simulation";

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
  if (s === "done") return <Badge className="bg-success/15 text-success">Klar</Badge>;
  if (s === "progress") return <Badge className="bg-info/15 text-info">Pågående</Badge>;
  if (s === "late") return <Badge className="bg-destructive/10 text-destructive">Försenad</Badge>;
  if (s === "cancelled") return <Badge variant="secondary" className="text-muted-foreground">Avbruten</Badge>;
  return <Badge variant="secondary">Ej påbörjad</Badge>;
}

// Returns the start-of-day timestamp for a simulated "today"
function simTodayStart(): number {
  const d = new Date(getSimulatedNow());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// A task is due soon if its due_date is within today (but not yet past end of today)
function isDueSoon(due_date: string | null): boolean {
  if (!due_date) return false;
  const now = getSimulatedNow();
  const diff = new Date(due_date).getTime() - now;
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

// A task is overdue only if its due date is BEFORE the start of today (i.e. due yesterday or earlier)
function isOverdue(due_date: string | null, status: string): boolean {
  if (!due_date || status === "done" || status === "cancelled") return false;
  const dueDay = new Date(due_date);
  dueDay.setHours(0, 0, 0, 0);
  return dueDay.getTime() < simTodayStart();
}

// Returns effective status considering simulated time
function effectiveStatus(t: { status: string; due_date: string | null }): string {
  if (isOverdue(t.due_date, t.status) && t.status !== "done" && t.status !== "cancelled") return "late";
  return t.status;
}

type TaskFull = Task & {
  steps: TaskStep[];
  questions: TaskQuestion[];
  store?: StoreType;
  assignees?: (TaskAssignee & { user?: AppUser; group?: UserGroup })[];
  images?: TaskImage[];
};

type FormQuestion = { label: string; question_type: "text" | "yes_no"; is_required: boolean };

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
  steps: [{ label: "", requires_photo: false }] as { label: string; requires_photo: boolean }[],
  questions: [] as FormQuestion[],
  assigneeUserIds: [] as string[],
  assigneeGroupIds: [] as string[],
});

// Image lightbox — rendered into document.body via portal so it sits completely
// outside the Radix Dialog DOM tree. This prevents pointer/touch events from
// ever reaching the dialog backdrop underneath.
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
      onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
        aria-label="Stäng"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-full rounded-xl shadow-2xl object-contain"
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

function TasksPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const isEmployee = user?.role === "employee";

  const [tasks, setTasks] = useState<TaskFull[]>([]);
  const [storeUsers, setStoreUsers] = useState<AppUser[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [templates, setTemplates] = useState<(ChecklistTemplate & { items: ChecklistTemplateItem[]; questions: ChecklistTemplateQuestion[] })[]>([]);
  const [userGroupIds, setUserGroupIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today");
  const [showAllDates, setShowAllDates] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState(emptyForm(activeStore?.id ?? ""));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);

  // Detail modal
  const [detailTask, setDetailTask] = useState<TaskFull | null>(null);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    let q = supabase
      .from("tasks")
      .select("*, store:stores(*), steps:task_steps(*), questions:task_questions(*), assignees:task_assignees(*, user:app_users(id,display_name,username), group:user_groups(id,name)), images:task_images(*)")
      .order("created_at", { ascending: false });

    if (activeStore) {
      q = q.eq("store_id", activeStore.id);
    } else if (userStores.length > 0) {
      q = q.in("store_id", userStores.map((s) => s.id));
    }

    const { data } = await q;
    if (data) setTasks(data as TaskFull[]);
    setLoading(false);
  }, [activeStore, userStores]);

  // Fetch current user's group IDs for visibility filtering
  const fetchUserGroups = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("user_group_members").select("group_id").eq("user_id", user.id);
    setUserGroupIds((data ?? []).map((r: { group_id: string }) => r.group_id));
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
    fetchUserGroups();

    const storeQ = user?.role === "admin"
      ? supabase.from("stores").select("*").eq("is_active", true)
      : supabase.from("stores").select("*").in("id", userStores.map((s) => s.id));
    storeQ.then(({ data }) => { if (data) setStores(data as StoreType[]); });

    supabase.from("checklist_templates")
      .select("*, items:checklist_template_items(*), questions:checklist_template_questions(*)")
      .then(({ data }) => {
        if (data) setTemplates(data as typeof templates);
      });

    if (activeStore) {
      supabase.from("user_stores").select("user:app_users(*)").eq("store_id", activeStore.id)
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

  // Realtime channel
  useEffect(() => {
    const channel = supabase
      .channel("tasks-rt-" + (activeStore?.id ?? "all"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, fetchTasks)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_steps" }, fetchTasks)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_questions" }, fetchTasks)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore, fetchTasks]);

  // Spawn new child tasks for recurring tasks when simulated time passes their due_date
  const spawnRecurringTasks = useCallback(async (taskList: TaskFull[]) => {
    if (!isManager) return;
    const now = getSimulatedNow();

    const recurringTasks = taskList.filter(
      (t) =>
        t.recurrence_rule &&
        !t.parent_task_id && // only original tasks, not already-spawned children
        t.due_date &&
        new Date(t.due_date).getTime() <= now
    );

    if (recurringTasks.length === 0) return;

    const unitMs: Record<string, number> = {
      daily: 86_400_000,
      every_other_day: 2 * 86_400_000,
      weekly: 7 * 86_400_000,
      monthly: 30 * 86_400_000,
      yearly: 365 * 86_400_000,
    };

    let didSpawn = false;
    for (const t of recurringTasks) {
      const intervalMs = unitMs[t.recurrence_rule!] ?? 86_400_000;
      // How many intervals have passed since due_date?
      const elapsed = now - new Date(t.due_date!).getTime();
      const periods = Math.floor(elapsed / intervalMs);
      if (periods < 1) continue;

      // Check if we already spawned for the latest period
      const expectedSpawnPeriod = periods; // 1-based
      const lastSpawnedAt = t.last_spawned_at ? new Date(t.last_spawned_at).getTime() : 0;
      const periodStartMs = new Date(t.due_date!).getTime() + (periods - 1) * intervalMs;
      if (lastSpawnedAt >= periodStartMs) continue; // already spawned this period

      // Check recurrence_end
      if (t.recurrence_end) {
        const nextDue = new Date(t.due_date!).getTime() + periods * intervalMs;
        if (nextDue > new Date(t.recurrence_end).getTime()) continue;
      }

      const nextDueDate = new Date(new Date(t.due_date!).getTime() + expectedSpawnPeriod * intervalMs).toISOString();

      // Create child task
      const { data: child } = await supabase.from("tasks").insert({
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        store_id: t.store_id,
        due_date: nextDueDate,
        recurrence_rule: null, // children don't recur themselves
        parent_task_id: t.id,
        created_by: t.created_by,
        assigned_to: t.assigned_to,
        status: "todo",
      }).select().maybeSingle();

      if (child) {
        // Copy steps (unchecked)
        const steps = (t.steps ?? []).map((s) => ({
          task_id: child.id,
          label: s.label,
          sort_order: s.sort_order,
          requires_photo: s.requires_photo,
          is_done: false,
        }));
        if (steps.length > 0) await supabase.from("task_steps").insert(steps);

        // Copy questions (no answers, no user-uploaded data)
        const questions = (t.questions ?? []).map((q) => ({
          task_id: child.id,
          label: q.label,
          question_type: q.question_type ?? "text",
          is_required: q.is_required,
          sort_order: q.sort_order,
        }));
        if (questions.length > 0) await supabase.from("task_questions").insert(questions);

        // Copy creator-uploaded images (images uploaded by task creator, not by employees)
        const creatorImages = (t.images ?? []).filter(img => img.uploaded_by === t.created_by);
        if (creatorImages.length > 0) {
          await supabase.from("task_images").insert(
            creatorImages.map((img) => ({ task_id: child.id, storage_path: img.storage_path, uploaded_by: img.uploaded_by }))
          );
        }

        // Copy assignees
        const assignees = (t.assignees ?? []).map((a) => ({
          task_id: child.id,
          user_id: a.user_id,
          group_id: a.group_id,
        }));
        if (assignees.length > 0) await supabase.from("task_assignees").insert(assignees);

        // Update parent's last_spawned_at
        await supabase.from("tasks").update({ last_spawned_at: new Date(now).toISOString() }).eq("id", t.id);

        logAudit(user?.id ?? null, "task.recurrence.spawn", "tasks", child.id, { parent_id: t.id });
        didSpawn = true;
      }
    }

    if (didSpawn) await fetchTasks();
  }, [isManager, user, fetchTasks]);

  useEffect(() => {
    if (tasks.length > 0) {
      void spawnRecurringTasks(tasks);
    }
  }, [tasks, spawnRecurringTasks]);

  // Filter tasks by role visibility
  const visibleTasks = tasks.filter((t) => {
    if (!isEmployee) return true; // managers/admins see all
    const taskGroups = (t.assignees ?? []).filter(a => a.group_id).map(a => a.group_id!);
    if (taskGroups.length === 0) return true; // unassigned to any group → everyone sees it
    return taskGroups.some(gid => userGroupIds.includes(gid));
  });

  const applyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    const steps = (tmpl.items ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((it) => ({ label: it.label, requires_photo: it.requires_photo }));
    const questions = (tmpl.questions ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((q) => ({ label: q.label, question_type: q.question_type ?? "text" as "text" | "yes_no", is_required: q.is_required }));
    setNewTask((p) => ({
      ...p,
      title: p.title || tmpl.title,
      category: tmpl.category || p.category,
      steps: steps.length > 0 ? steps : p.steps,
      questions: questions.length > 0 ? questions : p.questions,
    }));
  };

  // Mark task as pågående when user interacts
  const markInProgress = async (task: TaskFull) => {
    if (task.status !== "todo" && task.status !== "late") return;
    await supabase.from("tasks").update({ status: "progress" }).eq("id", task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "progress" } : t));
    if (detailTask?.id === task.id) setDetailTask(p => p ? { ...p, status: "progress" } : null);
  };

  const toggleStep = async (task: TaskFull, stepId: string, current: boolean) => {
    await markInProgress(task);
    await supabase.from("task_steps").update({ is_done: !current }).eq("id", stepId);
    logAudit(user?.id ?? null, "task.step.toggle", "task_steps", stepId, { task_id: task.id, is_done: !current });
    fetchTasks();
    if (detailTask?.id === task.id) {
      setDetailTask(p => p ? {
        ...p,
        steps: p.steps.map(s => s.id === stepId ? { ...s, is_done: !current } : s)
      } : null);
    }
  };

  const saveAnswer = async (task: TaskFull, question: TaskQuestion, value: string) => {
    await markInProgress(task);
    const oldAnswer = question.answer;
    // Save to history
    await supabase.from("task_question_answers").insert({
      task_question_id: question.id,
      task_id: task.id,
      answer: value,
      answered_by: user?.id,
    });
    // Update current answer
    await supabase.from("task_questions").update({
      answer: value,
      answered_by: user?.id,
      answered_at: new Date().toISOString(),
    }).eq("id", question.id);
    logAudit(user?.id ?? null, "task.question.answer", "task_questions", question.id, { task_id: task.id, old: oldAnswer, new: value });
    fetchTasks();
    if (detailTask?.id === task.id) {
      setDetailTask(p => p ? {
        ...p,
        questions: p.questions.map(q => q.id === question.id ? { ...q, answer: value, answered_by: user?.id ?? null, answered_at: new Date().toISOString() } : q)
      } : null);
    }
  };

  const completeTask = async (task: TaskFull) => {
    const isDone = task.status === "done";
    const newStatus = isDone ? "todo" : "done";

    // Check required questions are answered
    if (!isDone) {
      const unanswered = (task.questions ?? []).filter(q => q.is_required && !q.answer?.trim());
      if (unanswered.length > 0) {
        alert(`Fyll i obligatoriska fält: ${unanswered.map(q => q.label).join(", ")}`);
        return;
      }
    }

    await supabase.from("tasks").update({
      status: newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
    }).eq("id", task.id);

    if (newStatus === "done") {
      await supabase.from("task_steps").update({ is_done: true }).eq("task_id", task.id);
      logAudit(user?.id ?? null, "task.complete", "tasks", task.id, { title: task.title });
      const notifyIds = new Set<string>();
      if (task.created_by && task.created_by !== user?.id) notifyIds.add(task.created_by);
      task.assignees?.forEach(a => { if (a.user_id && a.user_id !== user?.id) notifyIds.add(a.user_id); });
      notifyUsers([...notifyIds], "task_done", `Uppgift klar: ${task.title}`, `Slutförd av ${user?.display_name}`, "/uppgifter");
    } else {
      await supabase.from("task_steps").update({ is_done: false }).eq("task_id", task.id);
    }
    fetchTasks();
    if (detailTask?.id === task.id) setDetailTask(p => p ? { ...p, status: newStatus as Task["status"] } : null);
  };

  const uploadTaskImage = async (task: TaskFull, file: File) => {
    const path = await uploadAttachment(file, `tasks/${task.id}`);
    if (path) {
      await supabase.from("task_images").insert({ task_id: task.id, storage_path: path, uploaded_by: user?.id });
      logAudit(user?.id ?? null, "task.image.upload", "task_images", task.id, { path });
      await markInProgress(task);
      fetchTasks();
      if (detailTask?.id === task.id) {
        const { data } = await supabase.from("task_images").select("*").eq("task_id", task.id);
        if (data) setDetailTask(p => p ? { ...p, images: data as TaskImage[] } : null);
      }
    }
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
      const validSteps = newTask.steps.filter(s => s.label.trim());
      if (validSteps.length > 0) {
        await supabase.from("task_steps").insert(
          validSteps.map((s, i) => ({
            task_id: task.id, label: s.label, sort_order: i, requires_photo: s.requires_photo,
          }))
        );
      }

      const validQuestions = newTask.questions.filter(q => q.label.trim());
      if (validQuestions.length > 0) {
        await supabase.from("task_questions").insert(
          validQuestions.map((q, i) => ({
            task_id: task.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: i,
          }))
        );
      }

      const assigneeRows: { task_id: string; user_id?: string; group_id?: string }[] = [];
      newTask.assigneeUserIds.forEach(uid => assigneeRows.push({ task_id: task.id, user_id: uid }));
      newTask.assigneeGroupIds.forEach(gid => assigneeRows.push({ task_id: task.id, group_id: gid }));
      if (assigneeRows.length > 0) await supabase.from("task_assignees").insert(assigneeRows);

      if (uploadFiles.length > 0) {
        for (const file of uploadFiles) {
          const path = await uploadAttachment(file, `tasks/${task.id}`);
          if (path) await supabase.from("task_images").insert({ task_id: task.id, storage_path: path, uploaded_by: user?.id });
        }
      }

      logAudit(user?.id ?? null, "task.create", "tasks", task.id, { title: task.title });

      const notifyIds = new Set<string>();
      newTask.assigneeUserIds.forEach(uid => { if (uid !== user?.id) notifyIds.add(uid); });
      if (newTask.assigneeGroupIds.length > 0) {
        const { data: members } = await supabase
          .from("user_group_members").select("user_id").in("group_id", newTask.assigneeGroupIds);
        members?.forEach((m: { user_id: string }) => { if (m.user_id !== user?.id) notifyIds.add(m.user_id); });
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
      ["Titel", "Beskrivning", "Kategori", "Prioritet", "Status", "Butik", "Tilldelade", "Förfallodatum", "Återkommande", "Checkpoints", "Frågor & svar", "Slutförd", "Skapad"],
      ...visibleTasks.map((t) => [
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
        t.questions?.map(q => `${q.label}: ${q.answer || "-"}`).join(" | ") || "",
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
    { value: "today", label: "Idag" },
    { value: "all", label: "Alla" },
    { value: "todo", label: "Ej påbörjad" },
    { value: "progress", label: "Pågående" },
    { value: "done", label: "Klar" },
    { value: "late", label: "Försenad" },
  ];

  const simNow = getSimulatedNow();
  const todayEnd = new Date(simNow);
  todayEnd.setHours(23, 59, 59, 999);

  const isDueToday = (t: TaskFull) => {
    if (!t.due_date) return true; // no due date → always show
    return new Date(t.due_date).getTime() <= todayEnd.getTime();
  };

  const filtered = visibleTasks.filter((t) => {
    if (tab === "today" && !isDueToday(t)) return false;
    if (tab !== "all" && tab !== "today" && effectiveStatus(t) !== tab) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openDetail = async (task: TaskFull) => {
    setDetailTask(task);
    setAnswerDraft(
      Object.fromEntries((task.questions ?? []).map(q => [q.id, q.answer ?? ""]))
    );
    // Auto-mark in progress when opened
    if (task.status === "todo" || task.status === "late") {
      await markInProgress(task);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Uppgifter"
        description={activeStore ? `Uppgifter för ${activeStore.name}` : "Standardiserade rutiner."}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            {isManager && (
              <Button className="rounded-full" onClick={() => { setShowCreate(true); setSaveError(""); }}>
                <Plus className="mr-2 h-4 w-4" /> Ny uppgift
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-full bg-muted/60 p-1">
            {filters.map((f) => (
              <TabsTrigger key={f.value} value={f.value}
                className="gap-2 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs">
                {f.label}
                <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-medium text-muted-foreground">
                  {f.value === "all" ? visibleTasks.length : f.value === "today" ? visibleTasks.filter(isDueToday).length : visibleTasks.filter((t) => effectiveStatus(t) === f.value).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Sök..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-full pl-9 text-sm w-40" />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />)}
        </div>
      ) : filtered.length === 0 ? (
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
          {filtered.map((t) => {
            const overdue = isOverdue(t.due_date, t.status);
            const dueSoon = isDueSoon(t.due_date);
            return (
              <article
                key={t.id}
                className={cn(
                  "cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)]",
                  overdue ? "border-destructive/40" : "border-border/60"
                )}
                onClick={() => openDetail(t)}
              >
                <header className="flex items-start justify-between gap-3 p-4 md:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", priorityClass(t.priority))}>{t.priority}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t.category}</span>
                      {t.recurrence_rule && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Repeat className="h-3 w-3" />{RECURRENCE_OPTIONS.find(r => r.value === t.recurrence_rule)?.label}
                        </span>
                      )}
                      {overdue && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"><AlertTriangle className="h-3 w-3" />Försenad</span>}
                      {dueSoon && !overdue && <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning-foreground"><Clock className="h-3 w-3" />Snart</span>}
                    </div>
                    <h3 className="text-sm font-semibold leading-tight md:text-base">{t.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {t.due_date && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(t.due_date).toLocaleDateString("sv-SE")}</span>}
                      {t.assignees && t.assignees.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {t.assignees.slice(0, 2).map(a => a.user?.display_name ?? a.group?.name).filter(Boolean).join(", ")}
                          {t.assignees.length > 2 && ` +${t.assignees.length - 2}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">{statusBadge(effectiveStatus(t))}</div>
                </header>
                {/* Progress bar for steps */}
                {t.steps && t.steps.length > 0 && (
                  <div className="px-4 pb-3 md:px-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex-1 rounded-full bg-muted h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.round((t.steps.filter(s => s.is_done).length / t.steps.length) * 100)}%` }}
                        />
                      </div>
                      <span>{t.steps.filter(s => s.is_done).length}/{t.steps.length}</span>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailTask && (
        <Dialog open={!!detailTask} onOpenChange={(o) => !o && setDetailTask(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-start justify-between gap-2 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="text-base leading-snug">{detailTask.title}</DialogTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", priorityClass(detailTask.priority))}>{detailTask.priority}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{detailTask.category}</span>
                    {detailTask.recurrence_rule && <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary"><Repeat className="h-3 w-3" />{RECURRENCE_OPTIONS.find(r => r.value === detailTask.recurrence_rule)?.label}</span>}
                  </div>
                </div>
                {statusBadge(effectiveStatus(detailTask))}
              </div>
            </DialogHeader>

            <div className="space-y-5 py-1">
              {detailTask.description && (
                <p className="text-sm text-muted-foreground">{detailTask.description}</p>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {detailTask.due_date && (
                  <span className={cn("inline-flex items-center gap-1", isOverdue(detailTask.due_date, detailTask.status) && "text-destructive font-medium")}>
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(detailTask.due_date).toLocaleDateString("sv-SE", { dateStyle: "medium" })}
                  </span>
                )}
                {detailTask.assignees && detailTask.assignees.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {detailTask.assignees.map(a => a.user?.display_name ?? a.group?.name).filter(Boolean).join(", ")}
                  </span>
                )}
              </div>

              {/* Checkpoints */}
              {detailTask.steps && detailTask.steps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checkpoints</p>
                  {detailTask.steps.map((step) => (
                    <label key={step.id} className="flex items-start gap-3 cursor-pointer group rounded-lg p-2 hover:bg-muted/40 transition-colors">
                      <Checkbox
                        checked={step.is_done}
                        onCheckedChange={(checked) => {
                          void toggleStep(detailTask, step.id, step.is_done);
                        }}
                        className="mt-0.5"
                      />
                      <span className={cn("flex-1 text-sm", step.is_done && "line-through text-muted-foreground")}>{step.label}</span>
                      {step.requires_photo && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          <ImagePlus className="h-3 w-3" />foto
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}

              {/* Questions */}
              {detailTask.questions && detailTask.questions.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Frågor</p>
                  {detailTask.questions.map((q) => (
                    <div key={q.id} className="space-y-1.5">
                      <Label className="text-sm">
                        {q.label}
                        {q.is_required && <span className="ml-1 text-destructive">*</span>}
                      </Label>
                      {q.question_type === "yes_no" ? (
                        <div className="flex gap-2">
                          {(["Ja", "Nej"] as const).map((opt) => {
                            const current = answerDraft[q.id] ?? q.answer ?? "";
                            const active = current === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                className={cn(
                                  "rounded-full border px-5 py-1.5 text-sm font-medium transition-colors",
                                  active
                                    ? opt === "Ja" ? "bg-success/20 border-success text-success" : "bg-destructive/15 border-destructive/50 text-destructive"
                                    : "border-border/60 text-muted-foreground hover:border-primary/50"
                                )}
                                onClick={() => {
                                  setAnswerDraft(p => ({ ...p, [q.id]: opt }));
                                  void saveAnswer(detailTask, q, opt);
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <Textarea
                          value={answerDraft[q.id] ?? q.answer ?? ""}
                          onChange={(e) => setAnswerDraft(p => ({ ...p, [q.id]: e.target.value }))}
                          onBlur={() => {
                            const val = answerDraft[q.id] ?? "";
                            if (val !== (q.answer ?? "")) {
                              void saveAnswer(detailTask, q, val);
                            }
                          }}
                          placeholder="Skriv ditt svar..."
                          rows={2}
                          className="resize-none text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Images */}
              {detailTask.images && detailTask.images.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bilder</p>
                  <div className="flex flex-wrap gap-2">
                    {detailTask.images.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        className="group relative overflow-hidden rounded-lg border border-border/60"
                        onClick={() => setLightboxSrc(getPublicUrl(img.storage_path))}
                      >
                        <img src={getPublicUrl(img.storage_path)} alt="" className="h-20 w-20 object-cover transition-transform group-hover:scale-105" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                          <ZoomIn className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload image */}
              <div>
                <input
                  ref={detailFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && detailTask) {
                      Array.from(e.target.files).forEach(f => void uploadTaskImage(detailTask, f));
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={() => detailFileInputRef.current?.click()}
                >
                  <ImageIcon className="mr-1.5 h-3.5 w-3.5" /> Lägg till bild
                </Button>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                {detailTask.status !== "done" && detailTask.status !== "cancelled" && (
                  <Button
                    size="sm"
                    className="rounded-full gap-1.5"
                    onClick={() => void completeTask(detailTask)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Markera klar
                  </Button>
                )}
                {detailTask.status === "done" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full gap-1.5"
                    onClick={() => void completeTask(detailTask)}
                  >
                    <Circle className="h-3.5 w-3.5" /> Öppna igen
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* CREATE DIALOG */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setSaveError(""); setUploadFiles([]); } }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Ny uppgift</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            {templates.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm"><FileText className="h-3.5 w-3.5" />Använd mall</Label>
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger><SelectValue placeholder="Välj mall..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.title} {t.category ? `(${t.category})` : ""}</SelectItem>
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
                    {["Drift", "Säkerhet", "Kundärenden", "Övrigt"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
              <Label className="flex items-center gap-1.5 text-sm"><Users className="h-3.5 w-3.5" />Tilldela personer</Label>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-0.5">
                {storeUsers.map(u => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
                    <Checkbox checked={newTask.assigneeUserIds.includes(u.id)}
                      onCheckedChange={() => setNewTask(p => ({
                        ...p,
                        assigneeUserIds: p.assigneeUserIds.includes(u.id) ? p.assigneeUserIds.filter(id => id !== u.id) : [...p.assigneeUserIds, u.id]
                      }))} />
                    <span className="text-sm">{u.display_name}</span>
                  </label>
                ))}
              </div>
            </div>

            {groups.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm"><Users className="h-3.5 w-3.5" />Tilldela grupper</Label>
                <div className="max-h-24 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-0.5">
                  {groups.map(g => (
                    <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
                      <Checkbox checked={newTask.assigneeGroupIds.includes(g.id)}
                        onCheckedChange={() => setNewTask(p => ({
                          ...p,
                          assigneeGroupIds: p.assigneeGroupIds.includes(g.id) ? p.assigneeGroupIds.filter(id => id !== g.id) : [...p.assigneeGroupIds, g.id]
                        }))} />
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
                    <button key={idx} type="button"
                      className={cn("rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                        newTask.recurrence_days.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/60 text-muted-foreground hover:border-primary/50")}
                      onClick={() => {
                        const days = newTask.recurrence_days.includes(idx) ? newTask.recurrence_days.filter(d => d !== idx) : [...newTask.recurrence_days, idx];
                        setNewTask(p => ({ ...p, recurrence_days: days }));
                      }}>
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

            {/* Checkpoints */}
            <div className="space-y-1.5">
              <Label>Checkpoints</Label>
              <div className="space-y-2">
                {newTask.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder={`Checkpoint ${i + 1}`} value={step.label}
                      onChange={(e) => setNewTask(p => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, label: e.target.value } : s) }))}
                      className="flex-1" />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                      <Checkbox checked={step.requires_photo}
                        onCheckedChange={(v) => setNewTask(p => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, requires_photo: !!v } : s) }))} />
                      Foto
                    </label>
                    {newTask.steps.length > 1 && (
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8"
                        onClick={() => setNewTask(p => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full rounded-full"
                  onClick={() => setNewTask(p => ({ ...p, steps: [...p.steps, { label: "", requires_photo: false }] }))}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Lägg till checkpoint
                </Button>
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-1.5">
              <Label>Frågor</Label>
              <div className="space-y-2">
                {newTask.questions.map((q, i) => (
                  <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2.5">
                    <div className="flex items-center gap-2">
                      <Input placeholder={`Fråga ${i + 1}`} value={q.label}
                        onChange={(e) => setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, label: e.target.value } : qr) }))}
                        className="flex-1 h-8 text-sm" />
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8"
                        onClick={() => setNewTask(p => ({ ...p, questions: p.questions.filter((_, idx) => idx !== i) }))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <button type="button"
                          className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors", q.question_type === "text" ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                          onClick={() => setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, question_type: "text" } : qr) }))}>
                          Text
                        </button>
                        <button type="button"
                          className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors", q.question_type === "yes_no" ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                          onClick={() => setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, question_type: "yes_no" } : qr) }))}>
                          Ja/Nej
                        </button>
                      </div>
                      <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                        <Checkbox checked={q.is_required}
                          onCheckedChange={(v) => setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, is_required: !!v } : qr) }))} />
                        Obligatorisk
                      </label>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full rounded-full"
                  onClick={() => setNewTask(p => ({ ...p, questions: [...p.questions, { label: "", question_type: "text", is_required: false }] }))}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Lägg till fråga
                </Button>
              </div>
            </div>

            {/* Images */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm"><ImageIcon className="h-3.5 w-3.5" />Bilder</Label>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files) setUploadFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
              <Button variant="outline" size="sm" className="w-full rounded-full" onClick={() => fileInputRef.current?.click()}>
                <Plus className="mr-1 h-3.5 w-3.5" />Välj bilder
              </Button>
              {uploadFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
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

      {/* Lightbox */}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
