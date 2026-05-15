import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck as CheckCircle2, Circle, Clock, Download, ImagePlus, ListChecks, Plus, Repeat, X, Search, FileText, Users, Image as ImageIcon, ChevronDown, ChevronUp, TriangleAlert as AlertTriangle, ZoomIn } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PhotoViewer } from "@/components/photo-viewer";
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
function getSimTodayStartMs(): number {
  const d = new Date(getSimulatedNow());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Local-timezone YYYY-MM-DD string for a Date
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  return dueDay.getTime() < getSimTodayStartMs();
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
  // Lightbox: we store the task separately so we can hide the Dialog while the
  // photo is open (Radix's dismiss layer would otherwise eat all pointer events).
  const [lightboxTask, setLightboxTask] = useState<TaskFull | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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

  // --- Recurring task spawning ---
  //
  // Strategy: one pass per load that creates ALL missing period children.
  //
  // Dedup: each child stores `recurrence_period_start` (a date string YYYY-MM-DD)
  // set at creation. We read existing children's recurrence_period_start values to
  // know which periods are already covered — no math reconstruction needed.
  //
  // Child due_date = periodStart + (parent.due_date - parent.created_at)
  // so each child gets the same "window" duration the original task had.
  //
  // Children inherit recurrence_rule/recurrence_days so the badge renders.
  const spawnRef = useRef(false);

  // Shared helpers used both at creation time and in the load-time spawn pass.
  const midnight = (d: Date): Date => { const n = new Date(d); n.setHours(0,0,0,0); return n; };

  function buildPeriodStarts(originDue: Date, rule: string, weekdays: number[] | null, startDate: Date | null, endDate: Date | null, ceil: Date): Date[] {
    const effectiveCeil = endDate
      ? (midnight(new Date(endDate)) < ceil ? midnight(new Date(endDate)) : ceil)
      : ceil;
    let floor: Date;
    if (startDate) {
      floor = midnight(new Date(startDate));
    } else {
      floor = midnight(new Date(originDue));
      floor.setDate(floor.getDate() + 1);
    }
    const results: Date[] = [];
    if (rule === "weekly" && weekdays && weekdays.length > 0) {
      const cur = new Date(floor);
      while (cur <= effectiveCeil) {
        const jsDay = cur.getDay();
        const ourDay = jsDay === 0 ? 6 : jsDay - 1;
        if (weekdays.includes(ourDay)) results.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return results;
    }
    const advance = (d: Date): Date => {
      const n = new Date(d);
      if (rule === "daily") { n.setDate(n.getDate() + 1); }
      else if (rule === "every_other_day") { n.setDate(n.getDate() + 2); }
      else if (rule === "weekly") { n.setDate(n.getDate() + 7); }
      else if (rule === "monthly") {
        const origDay = originDue.getDate();
        n.setMonth(n.getMonth() + 1);
        const daysInMonth = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
        n.setDate(Math.min(origDay, daysInMonth));
      } else if (rule === "yearly") { n.setFullYear(n.getFullYear() + 1); }
      n.setHours(0, 0, 0, 0);
      return n;
    };
    let cur = midnight(new Date(originDue));
    cur = advance(cur);
    while (cur < floor) cur = advance(cur);
    while (cur <= effectiveCeil) { results.push(new Date(cur)); cur = advance(new Date(cur)); }
    return results;
  }

  async function copyChildData(childId: string, t: TaskFull) {
    const steps = (t.steps ?? []).map(s => ({ task_id: childId, label: s.label, sort_order: s.sort_order, requires_photo: s.requires_photo, is_done: false }));
    if (steps.length > 0) await supabase.from("task_steps").insert(steps);
    const questions = (t.questions ?? []).map(q => ({ task_id: childId, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: q.sort_order }));
    if (questions.length > 0) await supabase.from("task_questions").insert(questions);
    if ((t.images ?? []).length > 0) {
      await supabase.from("task_images").insert(t.images!.map(img => ({ task_id: childId, storage_path: img.storage_path, uploaded_by: img.uploaded_by })));
    }
    const assignees = (t.assignees ?? []).map(a => ({ task_id: childId, user_id: a.user_id, group_id: a.group_id }));
    if (assignees.length > 0) await supabase.from("task_assignees").insert(assignees);
  }

  // Called immediately after a recurring parent is fully saved so all future instances are visible right away.
  async function spawnChildrenForNewParent(parent: TaskFull) {
    if (!parent.recurrence_rule) return;
    const nowMs = getSimulatedNow();
    const originDate = parent.recurrence_start
      ? midnight(new Date(parent.recurrence_start))
      : parent.due_date
        ? midnight(new Date(parent.due_date))
        : midnight(new Date(parent.created_at));
    const durationMs = parent.due_date
      ? Math.max(0, midnight(new Date(parent.due_date)).getTime() - originDate.getTime())
      : 0;
    // Ceiling: recurrence_end if set, otherwise 1 year from today
    const ceilDate = parent.recurrence_end
      ? midnight(new Date(parent.recurrence_end))
      : (() => { const d = new Date(nowMs); d.setFullYear(d.getFullYear() + 1); d.setHours(0,0,0,0); return d; })();
    const periodStarts = buildPeriodStarts(
      originDate,
      parent.recurrence_rule,
      parent.recurrence_days ?? null,
      parent.recurrence_start ? new Date(parent.recurrence_start) : null,
      parent.recurrence_end ? new Date(parent.recurrence_end) : null,
      ceilDate,
    );
    for (const ps of periodStarts) {
      const psKey = localDateStr(ps);
      const childDue = parent.due_date ? new Date(ps.getTime() + durationMs) : null;
      const { data: child } = await supabase.from("tasks").insert({
        title: parent.title,
        description: parent.description,
        category: parent.category,
        priority: parent.priority,
        store_id: parent.store_id,
        due_date: childDue ? childDue.toISOString() : null,
        recurrence_rule: parent.recurrence_rule,
        recurrence_days: parent.recurrence_days,
        recurrence_period_start: psKey,
        parent_task_id: parent.id,
        created_by: parent.created_by,
        assigned_to: parent.assigned_to,
        status: "todo",
      }).select().maybeSingle();
      if (child) await copyChildData(child.id, parent);
    }
    if (periodStarts.length > 0) {
      await supabase.from("tasks").update({ last_spawned_at: new Date(nowMs).toISOString() }).eq("id", parent.id);
    }
  }

  const spawnRecurringTasks = useCallback(async (taskList: TaskFull[]) => {
    if (!isManager || spawnRef.current) return;
    spawnRef.current = true;

    const nowMs = getSimulatedNow();
    const simToday = new Date(nowMs);
    simToday.setHours(0, 0, 0, 0);

    const coveredByParent = new Map<string, Set<string>>();
    for (const t of taskList) {
      if (!t.parent_task_id) continue;
      if (!coveredByParent.has(t.parent_task_id)) coveredByParent.set(t.parent_task_id, new Set());
      const key = t.recurrence_period_start
        ? t.recurrence_period_start.slice(0, 10)
        : (t.due_date ? localDateStr(midnight(new Date(t.due_date))) : null);
      if (key) coveredByParent.get(t.parent_task_id)!.add(key);
    }

    const recurringTasks = taskList.filter((t) => t.recurrence_rule && !t.parent_task_id);
    if (recurringTasks.length === 0) { spawnRef.current = false; return; }

    let didSpawn = false;

    for (const t of recurringTasks) {
      const originDate: Date = t.recurrence_start
        ? midnight(new Date(t.recurrence_start))
        : t.due_date ? midnight(new Date(t.due_date)) : midnight(new Date(t.created_at));
      const durationMs = t.due_date
        ? Math.max(0, midnight(new Date(t.due_date)).getTime() - originDate.getTime()) : 0;

      const periodStarts = buildPeriodStarts(
        originDate, t.recurrence_rule!, t.recurrence_days ?? null,
        t.recurrence_start ? new Date(t.recurrence_start) : null,
        t.recurrence_end ? new Date(t.recurrence_end) : null,
        simToday,
      );

      const covered = coveredByParent.get(t.id) ?? new Set<string>();
      for (const ps of periodStarts) {
        const psKey = localDateStr(ps);
        if (covered.has(psKey)) continue;
        const childDue = t.due_date ? new Date(ps.getTime() + durationMs) : null;
        const { data: child } = await supabase.from("tasks").insert({
          title: t.title, description: t.description, category: t.category, priority: t.priority,
          store_id: t.store_id, due_date: childDue ? childDue.toISOString() : null,
          recurrence_rule: t.recurrence_rule, recurrence_days: t.recurrence_days,
          recurrence_period_start: psKey, parent_task_id: t.id,
          created_by: t.created_by, assigned_to: t.assigned_to, status: "todo",
        }).select().maybeSingle();
        if (child) { await copyChildData(child.id, t); covered.add(psKey); didSpawn = true; }
      }
    }

    if (didSpawn) {
      const parentIds = recurringTasks.map(t => t.id);
      await supabase.from("tasks").update({ last_spawned_at: new Date(nowMs).toISOString() }).in("id", parentIds);
      logAudit(user?.id ?? null, "task.recurrence.spawn", "tasks", "batch", {});
    }

    spawnRef.current = false;
    if (didSpawn) await fetchTasks();
  }, [isManager, user, fetchTasks]);

  useEffect(() => {
    if (tasks.length > 0) {
      void spawnRecurringTasks(tasks);
    }
  }, [tasks, spawnRecurringTasks]);

  // When the simulated clock advances, re-fetch and re-spawn so new periods appear
  useEffect(() => {
    const handler = () => {
      spawnRef.current = false; // allow a fresh spawn run
      void fetchTasks();
    };
    window.addEventListener("sf-time-changed", handler);
    return () => window.removeEventListener("sf-time-changed", handler);
  }, [fetchTasks]);

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

      // Spawn all recurring instances immediately so they're visible without reload
      if (task.recurrence_rule) {
        const validSteps = newTask.steps.filter(s => s.label.trim());
        const validQuestions = newTask.questions.filter(q => q.label.trim());
        const assigneesFull = newTask.assigneeUserIds.map(uid => ({ task_id: task.id, user_id: uid, group_id: null }));
        newTask.assigneeGroupIds.forEach(gid => assigneesFull.push({ task_id: task.id, user_id: null as unknown as string, group_id: gid }));
        const parentFull: TaskFull = {
          ...task,
          steps: validSteps.map((s, i) => ({ id: "", task_id: task.id, label: s.label, sort_order: i, requires_photo: s.requires_photo, is_done: false })),
          questions: validQuestions.map((q, i) => ({ id: "", task_id: task.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: i, answer: null })),
          assignees: assigneesFull.map(a => ({ task_id: task.id, user_id: a.user_id, group_id: a.group_id })),
          images: [],
        };
        spawnRef.current = false;
        await spawnChildrenForNewParent(parentFull);
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
  const simTodayStart = new Date(simNow);
  simTodayStart.setHours(0, 0, 0, 0);
  const simTodayEnd = new Date(simNow);
  simTodayEnd.setHours(23, 59, 59, 999);

  // Set of parent IDs that have at least one child in the visible list
  const parentIdsWithChildren = new Set(
    visibleTasks.filter(t => t.parent_task_id).map(t => t.parent_task_id!)
  );

  // "Today" tab: tasks due today and not already done
  // Recurring parents are hidden once children exist (children are the actionable instances)
  const isDueToday = (t: TaskFull) => {
    if (t.status === "done") return false;
    if (t.recurrence_rule && !t.parent_task_id && parentIdsWithChildren.has(t.id)) return false;
    if (!t.due_date) return true;
    const d = new Date(t.due_date);
    return d >= simTodayStart && d <= simTodayEnd;
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
      <div className="mb-5 space-y-2">
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="rounded-full bg-muted/60 p-1 w-max">
              {filters.map((f) => (
                <TabsTrigger key={f.value} value={f.value}
                  className="gap-1.5 rounded-full px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs whitespace-nowrap">
                  {f.label}
                  <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-medium text-muted-foreground">
                    {f.value === "all" ? visibleTasks.length : f.value === "today" ? visibleTasks.filter(isDueToday).length : visibleTasks.filter((t) => effectiveStatus(t) === f.value).length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Sök uppgifter..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-full pl-9 text-sm w-full" />
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((t) => {
            const overdue = isOverdue(t.due_date, t.status);
            const dueSoon = isDueSoon(t.due_date);
            const done = effectiveStatus(t) === "done";
            const stepsDone = t.steps?.filter((s) => s.is_done).length ?? 0;
            const stepsTotal = t.steps?.length ?? 0;
            const progress = stepsTotal > 0 ? stepsDone / stepsTotal : done ? 1 : 0;
            const isKritisk = t.priority === "Kritisk";
            const weekdayShort = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
            return (
              <article
                key={t.id}
                className={cn(
                  "cursor-pointer overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)]",
                  done ? "opacity-60 border-border/40" : overdue ? "border-destructive/40" : "border-border/60"
                )}
                onClick={() => openDetail(t)}
              >
                <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                  {/* Priority indicator */}
                  <div className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    isKritisk ? "bg-destructive" : overdue ? "bg-destructive/60" : "bg-muted-foreground/30"
                  )} />

                  <div className="min-w-0 flex-1">
                    <h3 className={cn("text-sm font-semibold leading-snug", done && "line-through text-muted-foreground")}>
                      {t.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {t.due_date && (
                        <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}>
                          <Clock className="h-3 w-3" />
                          {new Date(t.due_date).toLocaleDateString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {t.recurrence_rule && (
                        <span className="inline-flex items-center gap-1">
                          <Repeat className="h-3 w-3" />
                          {t.recurrence_rule === "weekly" && t.recurrence_days && t.recurrence_days.length > 0
                            ? `${RECURRENCE_OPTIONS.find(r => r.value === t.recurrence_rule)?.label} ${[...t.recurrence_days].sort((a, b) => a - b).map(d => weekdayShort[d]).join(", ")}`
                            : RECURRENCE_OPTIONS.find(r => r.value === t.recurrence_rule)?.label
                          }
                        </span>
                      )}
                      {t.assignees && t.assignees.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {t.assignees.slice(0, 2).map(a => a.user?.display_name ?? a.group?.name).filter(Boolean).join(", ")}
                          {t.assignees.length > 2 && ` +${t.assignees.length - 2}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status / done indicator */}
                  <div className="shrink-0">
                    {done
                      ? <CheckCircle2 className="h-5 w-5 text-success" />
                      : dueSoon
                        ? <Clock className="h-4 w-4 text-warning-foreground" />
                        : overdue
                          ? <AlertTriangle className="h-4 w-4 text-destructive" />
                          : <Circle className="h-5 w-5 text-muted-foreground/30" />
                    }
                  </div>
                </div>

                {/* Progress bar — always shown, shows completion */}
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 overflow-hidden rounded-full bg-muted h-1.5">
                      <div
                        className={cn("h-full rounded-full transition-all", done ? "bg-success" : "bg-primary")}
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                    {stepsTotal > 0 && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">{stepsDone}/{stepsTotal}</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailTask && (
        <Dialog open={!!detailTask && !lightboxTask} onOpenChange={(o) => { if (!o) setDetailTask(null); }}>
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
                        <div className="flex items-center gap-3">
                          {(["Ja", "Nej"] as const).map((opt) => {
                            const current = answerDraft[q.id] ?? q.answer ?? "";
                            const active = current === opt;
                            const isYes = opt === "Ja";
                            return (
                              <button
                                key={opt}
                                type="button"
                                aria-label={opt}
                                className={cn(
                                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                                  active
                                    ? isYes
                                      ? "border-success bg-success/15 text-success scale-110"
                                      : "border-destructive bg-destructive/15 text-destructive scale-110"
                                    : "border-border/60 text-muted-foreground/50 hover:border-muted-foreground/40 hover:scale-105"
                                )}
                                onClick={() => {
                                  setAnswerDraft(p => ({ ...p, [q.id]: opt }));
                                  void saveAnswer(detailTask, q, opt);
                                }}
                              >
                                {isYes
                                  ? <CheckCircle2 className="h-5 w-5" />
                                  : <X className="h-5 w-5" />
                                }
                              </button>
                            );
                          })}
                          {(answerDraft[q.id] ?? q.answer) && (
                            <span className={cn(
                              "text-sm font-medium",
                              (answerDraft[q.id] ?? q.answer) === "Ja" ? "text-success" : "text-destructive"
                            )}>
                              {answerDraft[q.id] ?? q.answer}
                            </span>
                          )}
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
                        onClick={() => {
                          const imgIdx = detailTask.images!.indexOf(img);
                          setLightboxTask(detailTask);
                          setLightboxIndex(imgIdx >= 0 ? imgIdx : 0);
                        }}
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

      {/* CREATE DIALOG — StoreSprint two-panel layout */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setSaveError(""); setUploadFiles([]); } }}>
        <DialogContent className="max-h-[92vh] w-full max-w-4xl overflow-hidden p-0 gap-0">
          {/* Header bar */}
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Ny uppgift</span>
            {newTask.title && <span className="text-sm font-semibold text-foreground">{newTask.title}</span>}
            <div className="ml-auto flex items-center gap-2">
              {saveError && <span className="text-xs text-destructive">{saveError}</span>}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowCreate(false)}>Avbryt</Button>
              <Button size="sm" className="rounded-full gap-1.5 bg-primary text-primary-foreground" onClick={createTask} disabled={saving || !newTask.title.trim()}>
                {saving ? "Sparar..." : "Skapa uppgift"}
              </Button>
            </div>
          </div>

          {/* Two-panel body */}
          <div className="flex overflow-hidden" style={{ maxHeight: "calc(92vh - 56px)" }}>

            {/* LEFT: Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">

              {/* Template picker */}
              {templates.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Använd mall</Label>
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Välj mall..." /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.title} {t.category ? `(${t.category})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Title */}
              <div>
                <input
                  placeholder="Uppgiftens titel..."
                  value={newTask.title}
                  onChange={(e) => setNewTask(p => ({ ...p, title: e.target.value }))}
                  className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <Textarea
                  placeholder="Lägg till en beskrivning eller instruktioner..."
                  value={newTask.description}
                  onChange={(e) => setNewTask(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
                />
              </div>

              {/* Checkpoints */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Checkpoints</p>
                <div className="space-y-1.5">
                  {newTask.steps.map((step, i) => (
                    <div key={i} className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                      <Input
                        placeholder={`Checkpoint ${i + 1}`}
                        value={step.label}
                        onChange={(e) => setNewTask(p => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, label: e.target.value } : s) }))}
                        className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground/70 whitespace-nowrap cursor-pointer">
                        <Checkbox
                          checked={step.requires_photo}
                          onCheckedChange={(v) => setNewTask(p => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, requires_photo: !!v } : s) }))}
                          className="h-3 w-3"
                        />
                        Foto
                      </label>
                      {newTask.steps.length > 1 && (
                        <button type="button" className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setNewTask(p => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }))}>
                          <X className="h-3.5 w-3.5 text-muted-foreground/60" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  onClick={() => setNewTask(p => ({ ...p, steps: [...p.steps, { label: "", requires_photo: false }] }))}
                >
                  <Plus className="h-3.5 w-3.5" /> Lägg till checkpoint
                </button>
              </div>

              {/* Questions */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frågor</p>
                <div className="space-y-2">
                  {newTask.questions.map((q, i) => (
                    <div key={i} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder={`Fråga ${i + 1}`}
                          value={q.label}
                          onChange={(e) => setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, label: e.target.value } : qr) }))}
                          className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                        />
                        <button type="button" onClick={() => setNewTask(p => ({ ...p, questions: p.questions.filter((_, idx) => idx !== i) }))}>
                          <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          {(["text", "yes_no"] as const).map((type) => (
                            <button key={type} type="button"
                              className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                                q.question_type === type ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                              onClick={() => setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, question_type: type } : qr) }))}>
                              {type === "text" ? "Text" : "Ja/Nej"}
                            </button>
                          ))}
                        </div>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                          <Checkbox checked={q.is_required}
                            onCheckedChange={(v) => setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, is_required: !!v } : qr) }))}
                            className="h-3 w-3" />
                          Obligatorisk
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  onClick={() => setNewTask(p => ({ ...p, questions: [...p.questions, { label: "", question_type: "text", is_required: false }] }))}
                >
                  <Plus className="h-3.5 w-3.5" /> Lägg till fråga
                </button>
              </div>

              {/* Images */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bilder</p>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { if (e.target.files) setUploadFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
                {uploadFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
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
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Välj bilder
                </button>
              </div>
            </div>

            {/* RIGHT: Properties sidebar */}
            <div className="w-72 shrink-0 overflow-y-auto border-l border-border/60 bg-muted/30">

              {/* Property rows — Coop-inspired: label left, value/control right */}
              <div className="divide-y divide-border/50">

                {/* Förfallodatum */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">Förfallodatum</span>
                    <input
                      type="datetime-local"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask(p => ({ ...p, due_date: e.target.value }))}
                      className="w-full rounded border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                </div>

                {/* Prioritet */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">Prioritet</span>
                  <Select value={newTask.priority} onValueChange={(v) => setNewTask(p => ({ ...p, priority: v }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0 justify-end">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Låg", "Medel", "Hög", "Kritisk"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Kategori */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">Kategori</span>
                  <Select value={newTask.category} onValueChange={(v) => setNewTask(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Drift", "Säkerhet", "Kundärenden", "Övrigt"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Butik */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">Butik</span>
                  <Select value={newTask.store_id || "__none"} onValueChange={(v) => setNewTask(p => ({ ...p, store_id: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end">
                      <SelectValue placeholder="Ingen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Ingen</SelectItem>
                      {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Återkommande */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Repeat className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">Återkommande</span>
                    <Select value={newTask.recurrence_rule || "__none"} onValueChange={(v) => {
                      const rule = v === "__none" ? "" : v;
                      setNewTask(p => ({
                        ...p,
                        recurrence_rule: rule,
                        recurrence_start: rule && !p.recurrence_start ? localDateStr(new Date(getSimulatedNow())) : p.recurrence_start,
                      }));
                    }}>
                      <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end">
                        <SelectValue placeholder="Ingen" />
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value || "__none"} value={o.value || "__none"}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {newTask.recurrence_rule === "weekly" && (
                    <div className="flex flex-wrap gap-1 pl-7">
                      {WEEKDAYS.map((day, idx) => (
                        <button key={idx} type="button"
                          className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                            newTask.recurrence_days.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                          onClick={() => {
                            const days = newTask.recurrence_days.includes(idx) ? newTask.recurrence_days.filter(d => d !== idx) : [...newTask.recurrence_days, idx];
                            setNewTask(p => ({ ...p, recurrence_days: days }));
                          }}>
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                  {newTask.recurrence_rule && (
                    <div className="pl-7 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-12">Start</span>
                        <Input type="date" value={newTask.recurrence_start}
                          onChange={(e) => setNewTask(p => ({ ...p, recurrence_start: e.target.value }))}
                          className="flex-1 h-7 text-xs" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-12">Slut</span>
                        <Input type="date" value={newTask.recurrence_end}
                          onChange={(e) => setNewTask(p => ({ ...p, recurrence_end: e.target.value }))}
                          className="flex-1 h-7 text-xs" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Tilldela personer */}
                {storeUsers.length > 0 && (
                  <div className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      <span className="text-xs text-muted-foreground">Tilldela personer</span>
                    </div>
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                      {storeUsers.map(u => (
                        <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                          <Checkbox checked={newTask.assigneeUserIds.includes(u.id)}
                            onCheckedChange={() => setNewTask(p => ({
                              ...p,
                              assigneeUserIds: p.assigneeUserIds.includes(u.id) ? p.assigneeUserIds.filter(id => id !== u.id) : [...p.assigneeUserIds, u.id]
                            }))} className="h-3.5 w-3.5" />
                          <span className="text-xs">{u.display_name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tilldela grupper */}
                {groups.length > 0 && (
                  <div className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      <span className="text-xs text-muted-foreground">Tilldela grupper</span>
                    </div>
                    <div className="space-y-0.5 max-h-28 overflow-y-auto">
                      {groups.map(g => (
                        <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                          <Checkbox checked={newTask.assigneeGroupIds.includes(g.id)}
                            onCheckedChange={() => setNewTask(p => ({
                              ...p,
                              assigneeGroupIds: p.assigneeGroupIds.includes(g.id) ? p.assigneeGroupIds.filter(id => id !== g.id) : [...p.assigneeGroupIds, g.id]
                            }))} className="h-3.5 w-3.5" />
                          <span className="text-xs">{g.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo viewer — rendered when lightboxTask is set.
          The Dialog is hidden (open=false) while this is shown so Radix's
          dismiss layer cannot intercept pointer events on the overlay. */}
      {lightboxTask && (
        <PhotoViewer
          images={lightboxTask.images?.map(img => getPublicUrl(img.storage_path)).filter(Boolean) ?? []}
          initialIndex={lightboxIndex}
          onClose={() => { setLightboxTask(null); }}
        />
      )}
    </div>
  );
}
