import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownUp, Camera, CircleCheck as CheckCircle2, Circle, Clock, Download, GripVertical, ImagePlus, ListChecks, Plus, Repeat, X, Search, FileText, Users, Image as ImageIcon, ChevronDown, ChevronUp, ChevronRight, TriangleAlert as AlertTriangle, ZoomIn, Pencil, Trash2, Hash, ExternalLink, Upload } from "lucide-react";

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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  supabase,
  type Task, type TaskStep, type TaskQuestion, type TaskImage,
  type Store as StoreType, type AppUser,
  type ChecklistTemplate, type ChecklistTemplateItem, type ChecklistTemplateQuestion,
  type TaskAssignee, type UserGroup,
  logAudit, createNotification, notifyUsers, uploadAttachment, getPublicUrl, deleteStorageFiles, mittCoopUrl,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { ImportDialog, type ImportDialogResult } from "@/components/import-dialog";
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

// datetime-local input gives "YYYY-MM-DDTHH:mm" in local time.
// Supabase timestamptz needs a proper UTC ISO string.
// These two helpers convert between them without double-shifting.
function localInputToUtcIso(localStr: string): string {
  if (!localStr) return "";
  // Parse as local time by appending no timezone → Date treats it as local
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return localStr;
  return d.toISOString(); // UTC ISO
}
function utcIsoToLocalInput(utcStr: string): string {
  if (!utcStr) return "";
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return utcStr.slice(0, 16);
  // Format as YYYY-MM-DDTHH:mm in local time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  sap_article_id: "",
  steps: [{ label: "", requires_photo: false }] as { label: string; requires_photo: boolean }[],
  questions: [] as FormQuestion[],
  assigneeUserIds: [] as string[],
  assigneeGroupIds: [] as string[],
});


// Returns true only on genuine touch devices (coarse pointer).
// Guards against mouse click-and-drag triggering swipe actions on desktop.
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

// Swipeable card: right-swipe → complete (green hint), left-swipe → open detail (blue hint).
// Threshold = 35% of screen width to prevent accidental triggers while scrolling.
// Only active on coarse-pointer (touch) devices.
function SwipeableCard({
  done,
  onSwipeRight,
  onSwipeLeft,
  onClick,
  children,
  className,
}: {
  done: boolean;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const deltaX = useRef(0);
  const isHorizontal = useRef(false);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const touch = isTouchDevice();
  // 35% of screen width as threshold
  const THRESHOLD = typeof window !== "undefined" ? window.innerWidth * 0.35 : 120;

  const onPtrDown = (e: React.PointerEvent) => {
    if (!touch) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    deltaX.current = 0;
    isHorizontal.current = false;
    setSwiping(false);
  };

  const onPtrMove = (e: React.PointerEvent) => {
    if (!touch) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    // Determine gesture direction on first significant movement
    if (!isHorizontal.current && !swiping) {
      if (Math.abs(dy) > Math.abs(dx) + 4) return; // vertical — don't intercept
      if (Math.abs(dx) > 8) isHorizontal.current = true;
    }
    if (!isHorizontal.current) return;
    e.stopPropagation();
    setSwiping(true);
    deltaX.current = dx;
    const maxPull = THRESHOLD * 1.15;
    setOffset(Math.max(-maxPull, Math.min(maxPull, dx)));
  };

  const onPtrUp = () => {
    if (!touch) return;
    const dx = deltaX.current;
    setOffset(0);
    setSwiping(false);
    isHorizontal.current = false;
    if (dx > THRESHOLD) { onSwipeRight(); return; }
    if (dx < -THRESHOLD) { onSwipeLeft(); return; }
  };

  // Progress fraction 0–1 toward trigger threshold
  const rightFrac = Math.max(0, Math.min(1, offset / THRESHOLD));
  const leftFrac = Math.max(0, Math.min(1, -offset / THRESHOLD));

  return (
    <div className="relative overflow-hidden rounded-xl" data-swipeable>
      {/* Right hint: green background fades in as you drag right */}
      <div
        data-swipe-hint
        className="absolute inset-0 flex items-center justify-start pl-5 rounded-xl"
        style={{
          background: done
            ? `rgba(0,0,0,${rightFrac * 0.08})`
            : `rgba(var(--color-success-rgb, 34 197 94) / ${rightFrac * 0.8})`,
          backgroundColor: done ? `rgba(200,200,200,${rightFrac * 0.5})` : `oklch(0.6 0.16 148 / ${rightFrac * 0.85})`,
          opacity: rightFrac > 0.05 ? 1 : 0,
        }}
      >
        {done
          ? <Circle className="h-7 w-7 text-muted-foreground" style={{ opacity: rightFrac }} />
          : <CheckCircle2 className="h-7 w-7 text-white" style={{ opacity: rightFrac }} />
        }
      </div>
      {/* Left hint: blue/primary background */}
      <div
        data-swipe-hint
        className="absolute inset-0 flex items-center justify-end pr-5 rounded-xl"
        style={{
          backgroundColor: `oklch(0.5 0.16 148 / ${leftFrac * 0.7})`,
          opacity: leftFrac > 0.05 ? 1 : 0,
        }}
      >
        <ChevronRight className="h-7 w-7 text-white" style={{ opacity: leftFrac }} />
      </div>
      <article
        className={cn("relative z-10", touch ? "touch-pan-y select-none" : "", className)}
        style={{
          transform: swiping ? `translateX(${offset}px)` : undefined,
          transition: swiping ? "none" : "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)",
        }}
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrUp}
        onPointerCancel={onPtrUp}
        onClick={() => { if (Math.abs(deltaX.current) < 8) onClick(); }}
      >
        {children}
      </article>
    </div>
  );
}

// ── AssigneePicker ─────────────────────────────────────────────────────────────
// Searchable user + group picker used in create/edit task dialogs.
function AssigneePicker({
  users, groups, selectedUserIds, selectedGroupIds, onToggleUser, onToggleGroup,
}: {
  users: AppUser[];
  groups: UserGroup[];
  selectedUserIds: string[];
  selectedGroupIds: string[];
  onToggleUser: (id: string) => void;
  onToggleGroup: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const lq = q.toLowerCase();
  const filteredUsers = users.filter(u => u.display_name.toLowerCase().includes(lq));
  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(lq));

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        <span className="text-xs text-muted-foreground">Tilldela</span>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök person eller grupp..."
          className="h-7 w-full rounded-lg border border-border/60 bg-background pl-7 pr-3 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
        />
      </div>
      <div className="max-h-40 overflow-y-auto space-y-0.5 -mx-1">
        {filteredGroups.map(g => (
          <label key={g.id} className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
            <Checkbox checked={selectedGroupIds.includes(g.id)} onCheckedChange={() => onToggleGroup(g.id)} className="h-3.5 w-3.5 shrink-0" />
            <Users className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            <span className="text-xs font-medium">{g.name}</span>
          </label>
        ))}
        {filteredUsers.map(u => (
          <label key={u.id} className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
            <Checkbox checked={selectedUserIds.includes(u.id)} onCheckedChange={() => onToggleUser(u.id)} className="h-3.5 w-3.5 shrink-0" />
            <span className="h-5 w-5 shrink-0 inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
              {u.display_name.charAt(0).toUpperCase()}
            </span>
            <span className="text-xs">{u.display_name}</span>
          </label>
        ))}
        {filteredGroups.length === 0 && filteredUsers.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">Inga träffar</p>
        )}
      </div>
    </div>
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
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "due_date" | "priority" | "assignee" | "title">("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showPastTasks, setShowPastTasks] = useState(false);

  // Undo toast: when a swipe-complete fires we show a 4-second window to cancel
  // before the DB write actually happens.
  const [undoToast, setUndoToast] = useState<{ task: TaskFull; timeoutId: ReturnType<typeof setTimeout> } | null>(null);
  const undoToastRef = useRef(undoToast);
  useEffect(() => { undoToastRef.current = undoToast; }, [undoToast]);

  const dismissUndoToast = () => {
    if (undoToastRef.current) {
      clearTimeout(undoToastRef.current.timeoutId);
      setUndoToast(null);
    }
  };

  // Called by SwipeableCard's onSwipeRight — delays the actual DB write by 4s
  const swipeComplete = (task: TaskFull) => {
    // Cancel any prior pending undo first
    dismissUndoToast();
    // Optimistically reflect the toggle in the UI immediately
    const isDone = task.status === "done";
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: isDone ? "todo" : "done" } : t));
    const tid = setTimeout(() => {
      setUndoToast(null);
      void completeTask(task);
    }, 4000);
    setUndoToast({ task, timeoutId: tid });
  };
  const [showCreate, setShowCreate] = useState(false);
  const TASK_DRAFT_KEY = `sf-task-draft-${user?.id ?? ""}`;
  const [newTask, _setNewTask] = useState<ReturnType<typeof emptyForm>>(() => {
    try {
      const saved = localStorage.getItem(`sf-task-draft-${user?.id ?? ""}`);
      if (saved) return JSON.parse(saved) as ReturnType<typeof emptyForm>;
    } catch {}
    return emptyForm(activeStore?.id ?? "");
  });
  const setNewTask = (v: ReturnType<typeof emptyForm> | ((p: ReturnType<typeof emptyForm>) => ReturnType<typeof emptyForm>)) => {
    _setNewTask(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);
  const stepPhotoInputRef = useRef<HTMLInputElement>(null);
  const taskImportInputRef = useRef<HTMLInputElement>(null);
  const [showTaskImportDialog, setShowTaskImportDialog] = useState(false);
  const [pendingPhotoStepId, setPendingPhotoStepId] = useState<string | null>(null);

  // Detail modal
  const [detailTask, setDetailTask] = useState<TaskFull | null>(null);
  const [completeError, setCompleteError] = useState("");
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  // Ref so Realtime handler can check draft state without stale closure
  const answerDraftRef = useRef<Record<string, string>>({});
  // Keep ref in sync with state
  useEffect(() => { answerDraftRef.current = answerDraft; }, [answerDraft]);
  // Lightbox: we store the task separately so we can hide the Dialog while the
  // photo is open (Radix's dismiss layer would otherwise eat all pointer events).
  const [lightboxTask, setLightboxTask] = useState<TaskFull | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<TaskFull | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "future" | null>(null);

  // Edit state
  const [editTask, setEditTask] = useState<TaskFull | null>(null);
  const [editForm, setEditForm] = useState<ReturnType<typeof emptyForm> | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // In-flight guard refs — prevent double-submit without triggering re-renders
  const completingRef = useRef<Set<string>>(new Set());
  const savingAnswerRef = useRef<Set<string>>(new Set());

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

  // Realtime channel — skip full reload when user has unsaved text drafts open
  useEffect(() => {
    const safeRefresh = () => {
      if (Object.keys(answerDraftRef.current).length > 0) return;
      fetchTasks();
    };
    const channel = supabase
      .channel("tasks-rt-" + (activeStore?.id ?? "all"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, safeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_steps" }, safeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_questions" }, safeRefresh)
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

  const MAX_SPAWN_INSTANCES = 90;

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
      while (cur <= effectiveCeil && results.length < MAX_SPAWN_INSTANCES) {
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
      else { n.setDate(n.getDate() + 1); }
      n.setHours(0, 0, 0, 0);
      return n;
    };
    let cur = midnight(new Date(originDue));
    cur = advance(cur);
    while (cur < floor) cur = advance(cur);
    while (cur <= effectiveCeil && results.length < MAX_SPAWN_INSTANCES) { results.push(new Date(cur)); cur = advance(new Date(cur)); }
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

  // Called immediately after a recurring parent is fully saved so near-term instances are visible right away.
  // Only spawns up to 30 days ahead to avoid freezing the UI; spawnRecurringTasks handles ongoing catch-up.
  async function spawnChildrenForNewParent(parent: TaskFull) {
    if (!parent.recurrence_rule) return;
    const nowMs = getSimulatedNow();
    const originDate = parent.recurrence_start
      ? midnight(new Date(parent.recurrence_start))
      : parent.due_date
        ? midnight(new Date(parent.due_date))
        : midnight(new Date(parent.created_at));
    // Use full due_date (with time) to preserve the time-of-day in child tasks
    const durationMs = parent.due_date
      ? Math.max(0, new Date(parent.due_date).getTime() - originDate.getTime())
      : 0;
    // Ceiling: recurrence_end if set, otherwise 365 days from today (rolling window)
    const maxCeil = (() => { const d = new Date(nowMs); d.setDate(d.getDate() + 365); d.setHours(0,0,0,0); return d; })();
    const ceilDate = parent.recurrence_end
      ? (() => { const e = midnight(new Date(parent.recurrence_end)); return e < maxCeil ? e : maxCeil; })()
      : maxCeil;
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

    // Spawn up to 365 days ahead (rolling window) when no end date is set
    const spawnCeil = (() => { const d = new Date(nowMs); d.setDate(d.getDate() + 365); d.setHours(0,0,0,0); return d; })();

    for (const t of recurringTasks) {
      const originDate: Date = t.recurrence_start
        ? midnight(new Date(t.recurrence_start))
        : t.due_date ? midnight(new Date(t.due_date)) : midnight(new Date(t.created_at));
      // Use full due_date (with time) to preserve the time-of-day in child tasks
      const durationMs = t.due_date
        ? Math.max(0, new Date(t.due_date).getTime() - originDate.getTime()) : 0;

      const effectiveCeil = t.recurrence_end
        ? (() => { const e = midnight(new Date(t.recurrence_end)); return e < spawnCeil ? e : spawnCeil; })()
        : spawnCeil;

      const periodStarts = buildPeriodStarts(
        originDate, t.recurrence_rule!, t.recurrence_days ?? null,
        t.recurrence_start ? new Date(t.recurrence_start) : null,
        t.recurrence_end ? new Date(t.recurrence_end) : null,
        effectiveCeil,
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

  // Filter tasks by assignee visibility:
  // - Managers/admins see all tasks
  // - Employees: if task has no assignees → visible to all; otherwise only if the user
  //   is directly assigned OR is a member of an assigned group
  const visibleTasks = tasks.filter((t) => {
    if (!isEmployee) return true;
    const assignees = t.assignees ?? [];
    if (assignees.length === 0) return true;
    const directMatch = assignees.some(a => a.user_id && a.user_id === user?.id);
    if (directMatch) return true;
    const groupMatch = assignees.some(a => a.group_id && userGroupIds.includes(a.group_id));
    return groupMatch;
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
    const dueDate = tmpl.due_date_offset != null
      ? (() => { const d = new Date(getSimulatedNow()); d.setDate(d.getDate() + tmpl.due_date_offset!); return utcIsoToLocalInput(d.toISOString()); })()
      : "";
    const todayStr = localDateStr(new Date(getSimulatedNow()));
    setNewTask((p) => ({
      ...p,
      title: p.title || tmpl.title,
      category: tmpl.category || p.category,
      priority: tmpl.priority || p.priority,
      recurrence_rule: tmpl.recurrence_rule ?? p.recurrence_rule,
      recurrence_days: tmpl.recurrence_days ?? p.recurrence_days,
      recurrence_interval: tmpl.recurrence_interval ?? p.recurrence_interval,
      // Always set recurrence_start to today when applying a template with recurrence
      recurrence_start: tmpl.recurrence_rule ? todayStr : p.recurrence_start,
      due_date: dueDate || p.due_date,
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

  // Check if a task should auto-complete (all steps done + all questions answered with no blank text fields)
  const shouldAutoComplete = (steps: TaskFull["steps"], questions: TaskFull["questions"]): boolean => {
    const allStepsDone = (steps ?? []).every(s => s.is_done);
    const allAnswered = (questions ?? []).every(q => q.answer?.trim());
    return allStepsDone && allAnswered;
  };

  const toggleStep = async (task: TaskFull, stepId: string, current: boolean) => {
    const wasChecking = !current;
    await markInProgress(task);
    await supabase.from("task_steps").update({ is_done: wasChecking }).eq("id", stepId);
    logAudit(user?.id ?? null, "task.step.toggle", "task_steps", stepId, { task_id: task.id, is_done: wasChecking });

    // Build updated task state for auto-complete check
    const updatedSteps = (task.steps ?? []).map(s => s.id === stepId ? { ...s, is_done: wasChecking } : s);

    // If unchecking while done → auto-reopen
    if (!wasChecking && task.status === "done") {
      await supabase.from("tasks").update({ status: "progress", completed_at: null }).eq("id", task.id);
    }
    // If all done and no free-text question blank → auto-complete
    else if (wasChecking && shouldAutoComplete(updatedSteps, task.questions)) {
      const hasTextQ = (task.questions ?? []).some(q => q.question_type === "text");
      if (!hasTextQ) {
        await completeTask({ ...task, steps: updatedSteps });
        return;
      }
    }

    fetchTasks();
    if (detailTask?.id === task.id) {
      setDetailTask(p => p ? { ...p, steps: updatedSteps } : null);
    }
  };

  const saveAnswer = async (task: TaskFull, question: TaskQuestion, value: string) => {
    if (savingAnswerRef.current.has(question.id)) return;
    savingAnswerRef.current.add(question.id);
    try {
      await markInProgress(task);
      const oldAnswer = question.answer;
      await supabase.from("task_question_answers").insert({
        task_question_id: question.id,
        task_id: task.id,
        answer: value,
        answered_by: user?.id,
      });
      await supabase.from("task_questions").update({
        answer: value,
        answered_by: user?.id,
        answered_at: new Date().toISOString(),
      }).eq("id", question.id);
      logAudit(user?.id ?? null, "task.question.answer", "task_questions", question.id, { task_id: task.id, old: oldAnswer, new: value });

      const updatedQuestions = (task.questions ?? []).map(q =>
        q.id === question.id ? { ...q, answer: value, answered_by: user?.id ?? null, answered_at: new Date().toISOString() } : q
      );

      // If answer cleared while task is done → auto-reopen
      if (!value?.trim() && task.status === "done") {
        await supabase.from("tasks").update({ status: "progress", completed_at: null }).eq("id", task.id);
      }
      // If all items now complete and no blank text question → auto-complete
      else if (value?.trim() && shouldAutoComplete(task.steps, updatedQuestions)) {
        const hasTextQ = updatedQuestions.some(q => q.question_type === "text");
        if (!hasTextQ) {
          await completeTask({ ...task, questions: updatedQuestions });
          return;
        }
      }

      fetchTasks();
      if (detailTask?.id === task.id) {
        setDetailTask(p => p ? { ...p, questions: updatedQuestions } : null);
      }
    } finally {
      savingAnswerRef.current.delete(question.id);
    }
  };

  const completeTask = async (task: TaskFull) => {
    if (completingRef.current.has(task.id)) return;
    completingRef.current.add(task.id);
    try {
      const isDone = task.status === "done";
      const newStatus = isDone ? "todo" : "done";

      if (!isDone) {
        const unanswered = (task.questions ?? []).filter(q => !q.answer?.trim());
        if (unanswered.length > 0) {
          setCompleteError(`Obesvarade frågor: ${unanswered.map(q => q.label).join(", ")}`);
          return;
        }
        setCompleteError("");
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

        // Auto-resolve any linked kundrunda incident and update the response result
        const { data: krResponse } = await supabase
          .from("kundrunda_responses")
          .select("id, incident_id")
          .eq("created_task_id", task.id)
          .maybeSingle();
        if (krResponse) {
          if (krResponse.incident_id) {
            await supabase.from("incidents").update({
              status: "resolved",
              resolved_at: new Date().toISOString(),
            }).eq("id", krResponse.incident_id);
          }
          await supabase.from("kundrunda_responses").update({ result: "ok" }).eq("id", krResponse.id);
        }
      } else {
        await supabase.from("task_steps").update({ is_done: false }).eq("task_id", task.id);
      }
      fetchTasks();
      if (detailTask?.id === task.id) setDetailTask(p => p ? { ...p, status: newStatus as Task["status"] } : null);
    } finally {
      completingRef.current.delete(task.id);
    }
  };

  const uploadTaskImage = async (task: TaskFull, file: File, stepId?: string) => {
    const path = await uploadAttachment(file, `tasks/${task.id}`);
    if (path) {
      await supabase.from("task_images").insert({ task_id: task.id, step_id: stepId ?? null, storage_path: path, uploaded_by: user?.id });
      logAudit(user?.id ?? null, "task.image.upload", "task_images", task.id, { path });
      await markInProgress(task);
      fetchTasks();
      if (detailTask?.id === task.id) {
        const { data } = await supabase.from("task_images").select("*").eq("task_id", task.id);
        if (data) setDetailTask(p => p ? { ...p, images: data as TaskImage[] } : null);
      }
    }
  };

  const openDelete = (task: TaskFull) => {
    setDeleteTarget(task);
    setDeleteScope(null);
  };

  const confirmDelete = async (scope: "single" | "future") => {
    if (!deleteTarget) return;
    const t = deleteTarget;

    // Collect task IDs being deleted so we can clean up their storage files
    const idsToDelete: string[] = [];

    if (t.recurrence_rule && scope === "future") {
      const parentId = t.parent_task_id ?? t.id;
      const periodStart = t.recurrence_period_start ?? (t.due_date ? t.due_date.slice(0, 10) : null);
      if (periodStart) {
        const { data: toRemove } = await supabase.from("tasks").select("id").eq("parent_task_id", parentId).gte("recurrence_period_start", periodStart);
        (toRemove ?? []).forEach((r: { id: string }) => idsToDelete.push(r.id));
        await supabase.from("tasks").delete().eq("parent_task_id", parentId).gte("recurrence_period_start", periodStart);
      }
      idsToDelete.push(t.id);
      await supabase.from("tasks").delete().eq("id", t.id);
    } else {
      idsToDelete.push(t.id);
      await supabase.from("tasks").delete().eq("id", t.id);
    }

    // Clean up storage files for all deleted tasks
    if (idsToDelete.length > 0) {
      const { data: imgRows } = await supabase.from("task_images").select("storage_path").in("task_id", idsToDelete);
      deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
    }

    logAudit(user?.id ?? null, "task.delete", "tasks", t.id, { title: t.title, scope });
    setDeleteTarget(null);
    setDeleteScope(null);
    setDetailTask(null);
    await fetchTasks();
  };

  const openEdit = (task: TaskFull) => {
    setEditTask(task);
    setEditForm({
      title: task.title,
      description: task.description ?? "",
      category: task.category,
      priority: task.priority,
      store_id: task.store_id ?? "",
      due_date: task.due_date ? utcIsoToLocalInput(task.due_date) : "",
      recurrence_rule: task.recurrence_rule ?? "",
      recurrence_days: task.recurrence_days ?? [],
      recurrence_interval: task.recurrence_interval ?? 1,
      recurrence_start: task.recurrence_start ?? "",
      recurrence_end: task.recurrence_end ?? "",
      steps: (task.steps ?? []).map(s => ({ label: s.label, requires_photo: s.requires_photo })),
      questions: (task.questions ?? []).map(q => ({ label: q.label, question_type: q.question_type ?? "text" as "text" | "yes_no", is_required: q.is_required })),
      assigneeUserIds: (task.assignees ?? []).filter(a => a.user_id).map(a => a.user_id!),
      assigneeGroupIds: (task.assignees ?? []).filter(a => a.group_id).map(a => a.group_id!),
    });
  };

  const saveEdit = async () => {
    if (!editTask || !editForm || !isManager) return;
    setEditSaving(true);
    const isRecurring = !!editTask.recurrence_rule;
    const isChild = !!editTask.parent_task_id;

    // Fields that apply to the task record itself (no due_date — each child keeps its own)
    const coreUpdates = {
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      category: editForm.category,
      priority: editForm.priority,
      store_id: editForm.store_id || null,
      recurrence_rule: editForm.recurrence_rule || null,
      recurrence_days: editForm.recurrence_days.length > 0 ? editForm.recurrence_days : null,
      recurrence_interval: editForm.recurrence_interval > 1 ? editForm.recurrence_interval : null,
      recurrence_start: editForm.recurrence_start || null,
      recurrence_end: editForm.recurrence_end || null,
    };

    // IDs of all tasks to update steps/questions/assignees for
    let affectedIds: string[] = [editTask.id];

    if (isRecurring && isChild) {
      // Update this child + all future siblings
      const parentId = editTask.parent_task_id!;
      const periodStart = editTask.recurrence_period_start ?? editTask.due_date?.slice(0, 10);
      if (periodStart) {
        const { data: futureChildren } = await supabase
          .from("tasks")
          .select("id")
          .eq("parent_task_id", parentId)
          .gte("recurrence_period_start", periodStart);
        const siblingIds = (futureChildren ?? []).map((c: { id: string }) => c.id);
        if (siblingIds.length > 0) {
          await supabase.from("tasks").update(coreUpdates).in("id", siblingIds);
          affectedIds = siblingIds;
        }
        // Also update the parent so future spawns inherit the changes
        await supabase.from("tasks").update(coreUpdates).eq("id", parentId);
      }
    } else {
      // Non-recurring or parent task — update due_date too
      await supabase.from("tasks").update({ ...coreUpdates, due_date: editForm.due_date ? localInputToUtcIso(editForm.due_date) : null }).eq("id", editTask.id);
    }

    const validSteps = editForm.steps.filter(s => s.label.trim());
    const validQuestions = editForm.questions.filter(q => q.label.trim());
    const assigneeRows: { task_id: string; user_id?: string; group_id?: string }[] = [];
    editForm.assigneeUserIds.forEach(uid => assigneeRows.push({ task_id: "__placeholder", user_id: uid }));
    editForm.assigneeGroupIds.forEach(gid => assigneeRows.push({ task_id: "__placeholder", group_id: gid }));

    // Apply steps, questions, assignees to all affected task IDs
    for (const tid of affectedIds) {
      await supabase.from("task_steps").delete().eq("task_id", tid);
      if (validSteps.length > 0) {
        await supabase.from("task_steps").insert(validSteps.map((s, i) => ({ task_id: tid, label: s.label, sort_order: i, requires_photo: s.requires_photo, is_done: false })));
      }
      await supabase.from("task_questions").delete().eq("task_id", tid);
      if (validQuestions.length > 0) {
        await supabase.from("task_questions").insert(validQuestions.map((q, i) => ({ task_id: tid, label: q.label, question_type: q.question_type, is_required: q.is_required, sort_order: i })));
      }
      await supabase.from("task_assignees").delete().eq("task_id", tid);
      const rows = assigneeRows.map(r => ({ ...r, task_id: tid }));
      if (rows.length > 0) await supabase.from("task_assignees").insert(rows);
    }

    logAudit(user?.id ?? null, "task.edit", "tasks", editTask.id, { title: coreUpdates.title });
    setEditTask(null);
    setEditForm(null);
    setDetailTask(null);
    setEditSaving(false);
    await fetchTasks();
  };

  const createTask = async () => {
    setSaveError("");
    if (!newTask.title.trim()) { setSaveError("Titel är obligatorisk."); return; }
    const validStepsNow = newTask.steps.filter(s => s.label.trim());
    const validQuestionsNow = newTask.questions.filter(q => q.label.trim());
    if (validStepsNow.length === 0 && validQuestionsNow.length === 0) {
      setSaveError("Minst en checkpunkt eller fråga är obligatorisk.");
      return;
    }
    if (newTask.recurrence_rule && !newTask.recurrence_start) {
      setSaveError("Startdatum för repetition är obligatoriskt.");
      return;
    }
    if (!isManager) return;
    setSaving(true);

    const { data: task, error } = await supabase.from("tasks").insert({
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      category: newTask.category,
      priority: newTask.priority,
      store_id: newTask.store_id || null,
      due_date: newTask.due_date ? localInputToUtcIso(newTask.due_date) : null,
      recurring: newTask.recurrence_rule || null,
      recurrence_rule: newTask.recurrence_rule || null,
      recurrence_days: newTask.recurrence_days.length > 0 ? newTask.recurrence_days : null,
      recurrence_interval: newTask.recurrence_interval,
      recurrence_start: newTask.recurrence_start || null,
      recurrence_end: newTask.recurrence_end || null,
      sap_article_id: newTask.sap_article_id?.trim() || null,
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
    try { localStorage.removeItem(TASK_DRAFT_KEY); } catch {}
    setNewTask(emptyForm(activeStore?.id ?? ""));
    setUploadFiles([]);
  };

  // Comment lines starting with # are ignored by importer
  const TASK_CSV_INSTRUCTIONS = `# INSTRUKTIONER (dessa rader ignoreras vid import)
# Kolumner: Titel;Beskrivning;Kategori;Prioritet;Återkommande;Veckodagar;Intervall;Förfaller om (dagar);Startdatum;Slutdatum;Steg;Frågor
#
# Prioritet: Låg | Medel | Hög | Kritisk
# Kategori: Drift | Säkerhet | Kundärenden | Övrigt
# Återkommande: daily | every_other_day | weekly | monthly | yearly (lämna tomt för ingen)
# Veckodagar: kommaseparerade siffror 0–6 (0=Mån, 1=Tis, ... 6=Sön), används när Återkommande=weekly
#   Exempel: 0,1,4 (Mån, Tis, Fre)
# Intervall: antal enheter mellan upprepningar (t.ex. 2 = varannan vecka), lämna tomt för 1
# Förfaller om (dagar): antal dagar tills uppgiften förfaller (t.ex. 1)
# Startdatum/Slutdatum: ÅÅÅÅ-MM-DD, lämna tomt för ingen begränsning
#
# Steg: separera med " | " — lägg till [foto] om foto krävs
#   Exempel: "1. Torka hyllor | 2. Kontrollera kyl [foto]"
#
# Frågor: separera med " | " — lägg till [obligatorisk] och/eller [ja_nej]
#   Exempel: "1. Är allt klart? [obligatorisk] [ja_nej] | 2. Kommentar"
#
# Tips: Spara filen i UTF-8-format och använd semikolon (;) som separator
`;

  const downloadTaskTemplate = () => {
    const headers = ["Titel", "Beskrivning", "Kategori", "Prioritet", "Återkommande", "Veckodagar", "Intervall", "Förfaller om (dagar)", "Startdatum", "Slutdatum", "Steg", "Frågor"];
    const example = [
      "Morgonkontroll", "Kontroll av butikens öppning", "Drift", "Medel", "weekly", "0,1,2,3,4", "1", "1", "", "",
      "1. Kolla temperaturer [foto] | 2. Öppna kassor | 3. Kontrollera ingång",
      "1. Är allt klart? [obligatorisk] [ja_nej]",
    ];
    const csv = TASK_CSV_INSTRUCTIONS
      + [headers, example].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "uppgifter-import-mall.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importTaskCSV = async (result: ImportDialogResult) => {
    setShowTaskImportDialog(false);
    const file = result.file;
    const text = await file.text();
    const cleaned = text.startsWith("\ufeff") ? text.slice(1) : text;
    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (lines.length < 2) return;

    const parseRow = (line: string): string[] => {
      const cols: string[] = []; let cur = ""; let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } else inQuote = !inQuote;
        } else if (ch === ";" && !inQuote) { cols.push(cur); cur = ""; } else { cur += ch; }
      }
      cols.push(cur);
      return cols;
    };

    const defaultCategory = String(result.options.category ?? "Övrigt");
    const defaultPriority = String(result.options.priority ?? "Medel");
    const assignToStore = result.options.assignToStore !== false;

    const rows = lines.slice(1).map(parseRow);
    for (const cols of rows) {
      const [title, description, category, priority, recurrence, weekdaysRaw, intervalRaw, dueDays, startDate, endDate, stepsRaw, questionsRaw] = cols;
      if (!title?.trim()) continue;

      const dueDate = dueDays?.trim()
        ? (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(dueDays.trim())); return d.toISOString().slice(0, 10); })()
        : null;

      const recurrenceRule = (recurrence ?? "").trim() || null;
      const recurrenceDays = weekdaysRaw?.trim()
        ? weekdaysRaw.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 6)
        : null;
      const recurrenceInterval = intervalRaw?.trim() ? parseInt(intervalRaw.trim()) : null;

      const { data: task } = await supabase.from("tasks").insert({
        title: title.trim(),
        description: (description ?? "").trim(),
        category: (category ?? "").trim() || defaultCategory,
        priority: (priority ?? "").trim() || defaultPriority,
        status: "todo",
        store_id: assignToStore ? (activeStore?.id ?? null) : null,
        created_by: user?.id ?? null,
        recurrence_rule: recurrenceRule,
        recurrence_days: recurrenceDays && recurrenceDays.length > 0 ? recurrenceDays : null,
        recurrence_interval: recurrenceInterval && recurrenceInterval > 1 ? recurrenceInterval : null,
        recurrence_start: startDate?.trim() || null,
        recurrence_end: endDate?.trim() || null,
        due_date: dueDate,
      }).select("id").maybeSingle();

      if (!task?.id) continue;

      if (stepsRaw?.trim()) {
        const steps = stepsRaw.split("|").map((s) => s.trim()).filter(Boolean).map((part, idx) => ({
          task_id: task.id,
          label: part.replace(/^\d+\.\s*/, "").replace(/\s*\[foto\]/i, "").trim(),
          requires_photo: /\[foto\]/i.test(part),
          is_done: false,
          sort_order: idx,
        }));
        if (steps.length > 0) await supabase.from("task_steps").insert(steps);
      }

      if (questionsRaw?.trim()) {
        const questions = questionsRaw.split("|").map((s) => s.trim()).filter(Boolean).map((part, idx) => ({
          task_id: task.id,
          label: part.replace(/^\d+\.\s*/, "").replace(/\s*\[obligatorisk\]/i, "").replace(/\s*\[ja_nej\]/i, "").trim(),
          question_type: /\[ja_nej\]/i.test(part) ? "yes_no" : "text",
          is_required: /\[obligatorisk\]/i.test(part),
          sort_order: idx,
        }));
        if (questions.length > 0) await supabase.from("task_questions").insert(questions);
      }

      logAudit(user?.id ?? null, "task.import", "tasks", task.id, { title: title.trim() });
    }
    await fetchTasks();
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
    { value: "active", label: "Aktiva" },
    { value: "recurring", label: "Återkommande" },
    { value: "all", label: "Alla" },
    { value: "done", label: "Klara" },
    { value: "late", label: "Försenade" },
  ];

  const simNow = getSimulatedNow();
  const simTodayStart = new Date(simNow);
  simTodayStart.setHours(0, 0, 0, 0);
  const simTodayEnd = new Date(simNow);
  simTodayEnd.setHours(23, 59, 59, 999);

  // Build a map: parentId → the child task for TODAY's period
  // This is used to show one representative row per recurring series
  const recurringParentIds = new Set(
    visibleTasks.filter(t => t.recurrence_rule && !t.parent_task_id).map(t => t.id)
  );

  // For each recurring parent, find the child that is current (due today or most recent not-done child)
  const currentChildByParent = new Map<string, TaskFull>();
  for (const t of visibleTasks) {
    if (!t.parent_task_id || !recurringParentIds.has(t.parent_task_id)) continue;
    const existing = currentChildByParent.get(t.parent_task_id);
    if (!existing) {
      currentChildByParent.set(t.parent_task_id, t);
      continue;
    }
    // Prefer: today's instance first, then most recent not-done, then most recent done
    const tDue = t.due_date ? new Date(t.due_date).getTime() : 0;
    const eDue = existing.due_date ? new Date(existing.due_date).getTime() : 0;
    const tToday = t.due_date ? new Date(t.due_date) >= simTodayStart && new Date(t.due_date) <= simTodayEnd : false;
    const eToday = existing.due_date ? new Date(existing.due_date) >= simTodayStart && new Date(existing.due_date) <= simTodayEnd : false;
    if (tToday && !eToday) { currentChildByParent.set(t.parent_task_id, t); continue; }
    if (!tToday && eToday) continue;
    // Both today or both not today — prefer not-done, then latest
    if (t.status !== "done" && existing.status === "done") { currentChildByParent.set(t.parent_task_id, t); continue; }
    if (t.status === "done" && existing.status !== "done") continue;
    if (tDue > eDue) { currentChildByParent.set(t.parent_task_id, t); }
  }

  // IDs of all child tasks that are NOT the current representative — hide these
  const hiddenChildIds = new Set<string>();
  for (const t of visibleTasks) {
    if (!t.parent_task_id) continue;
    const rep = currentChildByParent.get(t.parent_task_id);
    if (rep && rep.id !== t.id) hiddenChildIds.add(t.id);
  }

  // A task is "past" if it's done or its due_date is before today's start
  const isPast = (t: TaskFull): boolean => {
    if (t.status === "done" || t.status === "cancelled") return true;
    if (!t.due_date) return false;
    return new Date(t.due_date) < simTodayStart;
  };

  const isRecurring = (t: TaskFull): boolean =>
    !!(t.recurrence_rule && !t.parent_task_id) ||
    !!(t.parent_task_id && recurringParentIds.has(t.parent_task_id));

  const PRIORITY_ORDER: Record<string, number> = { Kritisk: 0, Hög: 1, Medel: 2, Låg: 3 };

  const filtered = visibleTasks
    .filter((t) => {
      // Always hide child recurring tasks that aren't the current representative
      if (hiddenChildIds.has(t.id)) return false;
      // Always hide recurring parents that have children (they're represented by children)
      if (recurringParentIds.has(t.id) && currentChildByParent.has(t.id)) return false;

      // Search filter
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;

      // Tab filters
      if (tab === "active") {
        // Active = non-done, non-cancelled, non-past (unless user chose to show past)
        if (t.status === "cancelled") return false;
        if (t.status === "done") return false;
        if (!showPastTasks && isPast(t)) return false;
        return true;
      }
      if (tab === "recurring") {
        // Show only recurring representative tasks (today's child or parent if no children yet)
        if (!isRecurring(t)) return false;
        return true;
      }
      if (tab === "done") return t.status === "done";
      if (tab === "late") return effectiveStatus(t) === "late";
      if (tab === "all") {
        if (!showPastTasks && isPast(t) && tab === "active") return false;
        return true;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "default") {
        // Default sort: overdue first, then by due_date ascending, then no-date last
        const aStatus = effectiveStatus(a);
        const bStatus = effectiveStatus(b);
        const aLate = aStatus === "late" ? 0 : 1;
        const bLate = bStatus === "late" ? 0 : 1;
        if (aLate !== bLate) return aLate - bLate;
        const aD = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bD = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return aD - bD;
      }
      let cmp = 0;
      if (sortBy === "due_date") {
        const aD = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bD = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        cmp = aD - bD;
      } else if (sortBy === "priority") {
        cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      } else if (sortBy === "assignee") {
        const aName = a.assignees?.[0]?.user?.display_name ?? a.assignees?.[0]?.group?.name ?? "";
        const bName = b.assignees?.[0]?.user?.display_name ?? b.assignees?.[0]?.group?.name ?? "";
        cmp = aName.localeCompare(bName, "sv");
      } else if (sortBy === "title") {
        cmp = a.title.localeCompare(b.title, "sv");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  // Count past tasks hidden from "active" tab
  const hiddenPastCount = tab === "active" && !showPastTasks
    ? visibleTasks.filter(t => !hiddenChildIds.has(t.id) && !(recurringParentIds.has(t.id) && currentChildByParent.has(t.id)) && isPast(t) && t.status !== "cancelled").length
    : 0;

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
            {/* Task CSV import dialog */}
            <ImportDialog
              open={showTaskImportDialog}
              onClose={() => setShowTaskImportDialog(false)}
              onImport={importTaskCSV}
              title="Importera uppgifter"
              description="Ladda upp en CSV-fil med uppgifter, steg och frågor"
              loading={false}
              importLabel="Importera uppgifter"
              options={[
                {
                  key: "category",
                  type: "select",
                  label: "Standardkategori",
                  description: "Används för rader som saknar kategori",
                  options: [
                    { value: "Övrigt", label: "Övrigt" },
                    { value: "Drift", label: "Drift" },
                    { value: "Säkerhet", label: "Säkerhet" },
                    { value: "Kundärenden", label: "Kundärenden" },
                  ],
                  defaultValue: "Övrigt",
                },
                {
                  key: "priority",
                  type: "select",
                  label: "Standardprioritet",
                  description: "Används för rader som saknar prioritet",
                  options: [
                    { value: "Medel", label: "Medel" },
                    { value: "Låg", label: "Låg" },
                    { value: "Hög", label: "Hög" },
                    { value: "Kritisk", label: "Kritisk" },
                  ],
                  defaultValue: "Medel",
                },
                {
                  key: "assignToStore",
                  type: "checkbox",
                  label: "Tilldela till aktiv butik",
                  description: "Koppla alla importerade uppgifter till den butik du är inloggad på",
                  defaultValue: true,
                },
              ]}
            />
            {isManager && (
              <Button variant="outline" className="rounded-full hidden lg:flex" onClick={downloadTaskTemplate}>
                <Download className="mr-2 h-4 w-4" /> CSV-mall
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="rounded-full hidden lg:flex" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" /> Exportera
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="rounded-full hidden lg:flex" onClick={() => setShowTaskImportDialog(true)}>
                <Upload className="mr-2 h-4 w-4" /> Importera CSV
              </Button>
            )}
            {isManager && (
              <Button className="rounded-full hidden lg:flex" onClick={() => { setShowCreate(true); setSaveError(""); }}>
                <Plus className="mr-2 h-4 w-4" /> Ny uppgift
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-5 space-y-2">
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setShowPastTasks(false); }}>
            <TabsList className="rounded-full bg-muted/60 p-1 w-max">
              {filters.map((f) => {
                let count = 0;
                const baseList = visibleTasks.filter(t => !hiddenChildIds.has(t.id) && !(recurringParentIds.has(t.id) && currentChildByParent.has(t.id)));
                if (f.value === "active") count = baseList.filter(t => t.status !== "cancelled" && t.status !== "done" && !isPast(t)).length;
                else if (f.value === "recurring") count = baseList.filter(t => isRecurring(t)).length;
                else if (f.value === "all") count = baseList.length;
                else if (f.value === "done") count = baseList.filter(t => t.status === "done").length;
                else if (f.value === "late") count = baseList.filter(t => effectiveStatus(t) === "late").length;
                return (
                  <TabsTrigger key={f.value} value={f.value}
                    className="gap-1.5 rounded-full px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs whitespace-nowrap">
                    {f.label}
                    <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-medium text-muted-foreground">
                      {count}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Sök uppgifter..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-full pl-9 text-sm w-full" />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-9 w-auto min-w-[130px] rounded-full text-xs gap-1.5">
              <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Standard</SelectItem>
              <SelectItem value="due_date">Datum</SelectItem>
              <SelectItem value="priority">Prioritet</SelectItem>
              <SelectItem value="assignee">Person</SelectItem>
              <SelectItem value="title">Titel</SelectItem>
            </SelectContent>
          </Select>
          {sortBy !== "default" && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 rounded-full p-0 shrink-0"
              onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
              title={sortDir === "asc" ? "Stigande" : "Fallande"}
            >
              {sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted/60" />
                </div>
                <div className="h-5 w-14 animate-pulse rounded-full bg-muted/60" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-20 animate-pulse rounded-md bg-muted/50" />
                <div className="h-3 w-16 animate-pulse rounded-md bg-muted/50" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 && hiddenPastCount === 0 ? (
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
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((t) => {
            const overdue = isOverdue(t.due_date, t.status);
            const dueSoon = isDueSoon(t.due_date);
            const done = effectiveStatus(t) === "done";
            const stepsDone = t.steps?.filter((s) => s.is_done).length ?? 0;
            const stepsTotal = t.steps?.length ?? 0;
            const allQuestions = t.questions ?? [];
            const answeredQuestions = allQuestions.filter(q => q.answer?.trim()).length;
            const totalItems = stepsTotal + allQuestions.length;
            const doneItems = stepsDone + answeredQuestions;
            const progress = totalItems > 0 ? doneItems / totalItems : done ? 1 : 0;
            const isKritisk = t.priority === "Kritisk";
            const weekdayShort = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
            return (
              <SwipeableCard
                key={t.id}
                done={done}
                onSwipeRight={() => swipeComplete(t)}
                onSwipeLeft={() => openDetail(t)}
                onClick={() => openDetail(t)}
                className={cn(
                  "cursor-pointer overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)]",
                  done ? "opacity-60 border-border/40" : overdue ? "border-destructive/40" : "border-border/60"
                )}
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
                    {totalItems > 0 && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">{doneItems}/{totalItems}</span>
                    )}
                  </div>
                </div>
              </SwipeableCard>
            );
          })}
          </div>

          {/* Show/hide past tasks toggle */}
          {hiddenPastCount > 0 && (
            <button
              className="w-full rounded-xl border border-dashed border-border/60 bg-card py-3 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              onClick={() => setShowPastTasks(true)}
            >
              Visa {hiddenPastCount} äldre uppgifter från tidigare dagar
            </button>
          )}
          {showPastTasks && hiddenPastCount === 0 && tab === "active" && (
            <button
              className="w-full rounded-xl border border-dashed border-border/60 bg-card py-3 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              onClick={() => setShowPastTasks(false)}
            >
              Dölj äldre uppgifter
            </button>
          )}
        </div>
      )}

      {/* Undo toast — shown 4s after a swipe-complete so the user can cancel */}
      {undoToast && (
        <div className="fixed bottom-44 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card px-5 py-3 shadow-[var(--shadow-lg)]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <span className="text-sm font-medium">Markerad som klar</span>
            <button
              className="ml-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted/70 active:scale-95 transition-transform"
              onClick={() => {
                // Cancel the pending DB write and revert the optimistic update
                dismissUndoToast();
                setTasks(prev => prev.map(t => t.id === undoToast.task.id ? undoToast.task : t));
              }}
            >
              Ångra
            </button>
          </div>
        </div>
      )}

      {/* Mobile FAB — thumb-zone shortcut, hidden on lg+ where header button is visible */}
      {isManager && (
        <button
          className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lg)] transition-transform active:scale-95 lg:hidden"
          aria-label="Ny uppgift"
          onClick={() => { setShowCreate(true); setSaveError(""); }}
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* DETAIL MODAL */}
      {detailTask && (
        <Dialog open={!!detailTask && !lightboxTask} onOpenChange={(o) => { if (!o) { setDetailTask(null); setAnswerDraft({}); setCompleteError(""); } }}>
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

              {/* Mitt Coop deep link */}
              {(() => {
                const url = mittCoopUrl(detailTask.sap_article_id, detailTask.store?.sap_site_id);
                if (!url) return null;
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                  >
                    <Hash className="h-3 w-3" />
                    SAP {detailTask.sap_article_id}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                );
              })()}

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
                  {detailTask.steps.map((step) => {
                    const stepImages = (detailTask.images ?? []).filter(img => img.step_id === step.id);
                    return (
                      <div key={step.id} className="space-y-1.5">
                        <label className="flex min-h-[44px] items-center gap-3 cursor-pointer group rounded-xl px-3 py-2.5 hover:bg-muted/40 active:bg-muted/60 transition-colors">
                          <Checkbox
                            checked={step.is_done}
                            onCheckedChange={() => void toggleStep(detailTask, step.id, step.is_done)}
                            className="h-5 w-5 shrink-0"
                          />
                          <span className={cn("flex-1 text-sm leading-snug", step.is_done && "line-through text-muted-foreground")}>{step.label}</span>
                          {step.requires_photo && (
                            <button
                              type="button"
                              aria-label="Ladda upp foto för detta steg"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPendingPhotoStepId(step.id); stepPhotoInputRef.current?.click(); }}
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                                stepImages.length > 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground hover:bg-primary-soft hover:text-primary"
                              )}
                            >
                              <Camera className="h-3 w-3" />
                              {stepImages.length > 0 ? `${stepImages.length} foto` : "foto"}
                            </button>
                          )}
                        </label>
                      </div>
                    );
                  })}
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
                        <div className="flex items-center gap-4">
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
                                  "flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all active:scale-95",
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
                                  ? <CheckCircle2 className="h-6 w-6" />
                                  : <X className="h-6 w-6" />
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
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && detailTask) {
                      Array.from(e.target.files).forEach(f => void uploadTaskImage(detailTask, f));
                    }
                  }}
                />
                <input
                  ref={stepPhotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && detailTask && pendingPhotoStepId) {
                      void uploadTaskImage(detailTask, file, pendingPhotoStepId);
                      setPendingPhotoStepId(null);
                    }
                    e.target.value = "";
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
              <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                {completeError && (
                  <p className="text-xs text-destructive">{completeError}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
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
                {isManager && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full gap-1.5 border-green-500/60 text-green-700 hover:bg-green-50 hover:border-green-500"
                    onClick={() => { openEdit(detailTask); setDetailTask(null); }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Redigera
                  </Button>
                )}
                {isManager && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full gap-1.5 border-destructive/60 text-destructive hover:bg-destructive/10 hover:border-destructive"
                    onClick={() => openDelete(detailTask)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Ta bort
                  </Button>
                )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* CREATE DIALOG — two-panel on desktop, single-column on mobile */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setSaveError(""); setUploadFiles([]); setCreateStep(1); } }}>
        <DialogContent className="sm:max-h-[92vh] sm:max-w-4xl overflow-hidden p-0 gap-0">
          {/* Header bar */}
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5 sm:py-3.5">
            <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-muted-foreground hidden sm:block">Ny uppgift</span>
            {newTask.title && <span className="text-sm font-semibold text-foreground truncate max-w-[140px] sm:max-w-xs">{newTask.title}</span>}
            {/* Mobile step indicator */}
            <div className="flex items-center gap-1 sm:hidden ml-auto">
              <span className={cn("h-2 w-2 rounded-full transition-colors", createStep === 1 ? "bg-primary" : "bg-muted-foreground/30")} />
              <span className={cn("h-2 w-2 rounded-full transition-colors", createStep === 2 ? "bg-primary" : "bg-muted-foreground/30")} />
            </div>
            <div className="ml-auto sm:ml-0 flex items-center gap-2">
              {saveError && <span className="text-xs text-destructive hidden sm:block">{saveError}</span>}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hidden sm:flex" onClick={() => setShowCreate(false)}>Avbryt</Button>
              {/* Mobile: Next/Create button */}
              <div className="flex gap-1.5 sm:hidden">
                {createStep === 1 ? (
                  <Button size="sm" className="rounded-full text-xs" onClick={() => setCreateStep(2)} disabled={!newTask.title.trim()}>
                    Nästa
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="rounded-full text-xs text-muted-foreground" onClick={() => setCreateStep(1)}>
                      Tillbaka
                    </Button>
                    <Button size="sm" className="rounded-full text-xs" onClick={createTask} disabled={saving || !newTask.title.trim()}>
                      {saving ? "Sparar..." : "Skapa"}
                    </Button>
                  </>
                )}
              </div>
              {/* Desktop: always show create */}
              <Button size="sm" className="rounded-full gap-1.5 bg-primary text-primary-foreground text-xs hidden sm:flex" onClick={createTask} disabled={saving || !newTask.title.trim()}>
                {saving ? "Sparar..." : "Skapa"}
              </Button>
            </div>
          </div>

          {/* Body: stacked on mobile (step-gated), side-by-side on desktop */}
          <div className="flex flex-col sm:flex-row overflow-hidden" style={{ maxHeight: "calc(92dvh - 56px)" }}>

            {/* CONTENT column — always visible on desktop, step 1 on mobile */}
            <div className={cn("flex-1 overflow-y-auto p-5 space-y-5 sm:p-6 sm:space-y-6 min-w-0", createStep === 2 && "hidden sm:block")}>

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
                    <div
                      key={i}
                      className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("stepIdx", String(i))}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const from = Number(e.dataTransfer.getData("stepIdx"));
                        if (from === i) return;
                        setNewTask(p => {
                          const arr = [...p.steps];
                          const [moved] = arr.splice(from, 1);
                          arr.splice(i, 0, moved);
                          return { ...p, steps: arr };
                        });
                      }}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 cursor-grab active:cursor-grabbing" />
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
                    <div
                      key={i}
                      className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("qIdx", String(i))}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const from = Number(e.dataTransfer.getData("qIdx"));
                        if (from === i) return;
                        setNewTask(p => {
                          const arr = [...p.questions];
                          const [moved] = arr.splice(from, 1);
                          arr.splice(i, 0, moved);
                          return { ...p, questions: arr };
                        });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 cursor-grab active:cursor-grabbing" />
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
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
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

            {/* PROPERTIES sidebar — hidden on mobile step 1, visible on mobile step 2, always visible on desktop */}
            <div className={cn("w-full sm:w-72 shrink-0 overflow-y-auto border-t sm:border-t-0 sm:border-l border-border/60 bg-muted/30", createStep === 1 && "hidden sm:block")}>

              {/* Property rows */}
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

                {/* SAP artikel-ID */}
                <div className="px-4 py-3 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="text-xs text-muted-foreground shrink-0">SAP-artikel</span>
                    <div className="flex flex-1 items-center gap-1 min-w-0">
                      <input
                        value={newTask.sap_article_id}
                        onChange={(e) => setNewTask(p => ({ ...p, sap_article_id: e.target.value }))}
                        placeholder="t.ex. 1047133"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className="min-w-0 flex-1 border-0 bg-transparent text-right text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none overflow-hidden"
                      />
                      {newTask.sap_article_id && (
                        <button type="button" onClick={() => setNewTask(p => ({ ...p, sap_article_id: "" }))} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 hover:text-destructive shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {newTask.sap_article_id && (
                    <a
                      href={mittCoopUrl(newTask.sap_article_id, activeStore?.sap_site_id ?? null) ?? `https://mittcoop.coop.se/sortiment/articles/${newTask.sap_article_id.trim()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Öppna i Mitt Coop
                    </a>
                  )}
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
                      {!newTask.recurrence_end && (
                        <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2">
                          <p className="text-[11px] text-warning-foreground font-medium">Inget slutdatum angivet</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Uppgifter skapas automatiskt 365 dagar framåt. När ett år har gått förnyas perioden automatiskt, om inte uppgiften tas bort.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Tilldela — sök + grupper + personer */}
                {(storeUsers.length > 0 || groups.length > 0) && (
                  <AssigneePicker
                    users={storeUsers}
                    groups={groups}
                    selectedUserIds={newTask.assigneeUserIds}
                    selectedGroupIds={newTask.assigneeGroupIds}
                    onToggleUser={(uid) => setNewTask(p => ({
                      ...p,
                      assigneeUserIds: p.assigneeUserIds.includes(uid) ? p.assigneeUserIds.filter(id => id !== uid) : [...p.assigneeUserIds, uid]
                    }))}
                    onToggleGroup={(gid) => setNewTask(p => ({
                      ...p,
                      assigneeGroupIds: p.assigneeGroupIds.includes(gid) ? p.assigneeGroupIds.filter(id => id !== gid) : [...p.assigneeGroupIds, gid]
                    }))}
                  />
                )}

              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      {deleteTarget && !deleteScope && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">Ta bort uppgift</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget.recurrence_rule
                  ? "Denna uppgift är återkommande. Vad vill du ta bort?"
                  : `Är du säker på att du vill ta bort "${deleteTarget.title}"?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteTarget.recurrence_rule ? (
              <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
                <button
                  className="w-full rounded-lg border-2 border-destructive/60 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors text-left"
                  onClick={() => confirmDelete("single")}
                >
                  <span className="font-semibold">Bara denna</span>
                  <p className="text-xs text-destructive/70 mt-0.5">Tar bara bort just den här förekomsten</p>
                </button>
                <button
                  className="w-full rounded-lg border-2 border-destructive bg-destructive/15 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/25 transition-colors text-left"
                  onClick={() => confirmDelete("future")}
                >
                  <span className="font-semibold">Denna och alla framtida</span>
                  <p className="text-xs text-destructive/70 mt-0.5">Tar bort denna och alla kommande upprepningar</p>
                </button>
                <AlertDialogCancel className="w-full">Avbryt</AlertDialogCancel>
              </AlertDialogFooter>
            ) : (
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => confirmDelete("single")}
                >
                  Ta bort
                </AlertDialogAction>
              </AlertDialogFooter>
            )}
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* EDIT DIALOG */}
      {editTask && editForm && (
        <Dialog open onOpenChange={(o) => { if (!o) { setEditTask(null); setEditForm(null); } }}>
          <DialogContent className="sm:max-h-[92vh] sm:max-w-4xl overflow-hidden p-0 gap-0">
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5 sm:py-3.5">
              <Pencil className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground hidden sm:block">Redigera uppgift</span>
              <span className="text-sm font-semibold text-foreground truncate max-w-[140px] sm:max-w-xs">{editTask.title}</span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hidden sm:flex" onClick={() => { setEditTask(null); setEditForm(null); }}>Avbryt</Button>
                <Button size="sm" className="rounded-full gap-1.5 bg-green-600 text-white hover:bg-green-700 text-xs" onClick={saveEdit} disabled={editSaving || !editForm.title.trim()}>
                  {editSaving ? "Sparar..." : "Spara"}
                </Button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row overflow-hidden" style={{ maxHeight: "calc(92dvh - 56px)" }}>
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 sm:space-y-6 min-w-0">
                <input
                  placeholder="Titel..."
                  value={editForm.title}
                  onChange={(e) => setEditForm(p => p ? { ...p, title: e.target.value } : p)}
                  className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
                <Textarea
                  placeholder="Beskrivning..."
                  value={editForm.description}
                  onChange={(e) => setEditForm(p => p ? { ...p, description: e.target.value } : p)}
                  rows={3}
                  className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
                />
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Checkpoints</p>
                  {editForm.steps.map((step, i) => (
                    <div key={i} className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                      <Input placeholder={`Checkpoint ${i+1}`} value={step.label} onChange={(e) => setEditForm(p => p ? { ...p, steps: p.steps.map((s,idx) => idx===i ? {...s,label:e.target.value} : s) } : p)} className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0" />
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground/70 whitespace-nowrap cursor-pointer">
                        <Checkbox checked={step.requires_photo} onCheckedChange={(v) => setEditForm(p => p ? { ...p, steps: p.steps.map((s,idx) => idx===i ? {...s,requires_photo:!!v} : s) } : p)} className="h-3 w-3" />Foto
                      </label>
                      <button type="button" className="opacity-0 group-hover:opacity-100" onClick={() => setEditForm(p => p ? { ...p, steps: p.steps.filter((_,idx) => idx!==i) } : p)}>
                        <X className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary" onClick={() => setEditForm(p => p ? { ...p, steps: [...p.steps, { label:"", requires_photo:false }] } : p)}>
                    <Plus className="h-3.5 w-3.5" /> Lägg till checkpoint
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frågor</p>
                  {editForm.questions.map((q, i) => (
                    <div key={i} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input placeholder={`Fråga ${i+1}`} value={q.label} onChange={(e) => setEditForm(p => p ? { ...p, questions: p.questions.map((qr,idx) => idx===i ? {...qr,label:e.target.value} : qr) } : p)} className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0" />
                        <button type="button" onClick={() => setEditForm(p => p ? { ...p, questions: p.questions.filter((_,idx) => idx!==i) } : p)}><X className="h-3.5 w-3.5 text-muted-foreground/50" /></button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          {(["text","yes_no"] as const).map(type => (
                            <button key={type} type="button" className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors", q.question_type===type ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground")} onClick={() => setEditForm(p => p ? { ...p, questions: p.questions.map((qr,idx) => idx===i ? {...qr,question_type:type} : qr) } : p)}>
                              {type === "text" ? "Text" : "Ja/Nej"}
                            </button>
                          ))}
                        </div>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                          <Checkbox checked={q.is_required} onCheckedChange={(v) => setEditForm(p => p ? { ...p, questions: p.questions.map((qr,idx) => idx===i ? {...qr,is_required:!!v} : qr) } : p)} className="h-3 w-3" />Obligatorisk
                        </label>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary" onClick={() => setEditForm(p => p ? { ...p, questions: [...p.questions, { label:"", question_type:"text", is_required:false }] } : p)}>
                    <Plus className="h-3.5 w-3.5" /> Lägg till fråga
                  </button>
                </div>
              </div>
              <div className="w-full sm:w-72 shrink-0 overflow-y-auto border-t sm:border-t-0 sm:border-l border-border/60 bg-muted/30">
                <div className="divide-y divide-border/50">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="text-xs text-muted-foreground">Förfallodatum</span>
                      <input type="datetime-local" value={editForm.due_date} onChange={(e) => setEditForm(p => p ? { ...p, due_date: e.target.value } : p)} className="w-full rounded border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">Prioritet</span>
                    <Select value={editForm.priority} onValueChange={(v) => setEditForm(p => p ? { ...p, priority: v } : p)}>
                      <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0 justify-end"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Låg","Medel","Hög","Kritisk"].map(pr => <SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">Kategori</span>
                    <Select value={editForm.category} onValueChange={(v) => setEditForm(p => p ? { ...p, category: v } : p)}>
                      <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Drift","Säkerhet","Kundärenden","Övrigt"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <Repeat className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">Återkommande</span>
                      <Select value={editForm.recurrence_rule || "__none"} onValueChange={(v) => setEditForm(p => p ? { ...p, recurrence_rule: v === "__none" ? "" : v } : p)}>
                        <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end"><SelectValue placeholder="Ingen" /></SelectTrigger>
                        <SelectContent>{RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value || "__none"} value={o.value || "__none"}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {editForm.recurrence_rule === "weekly" && (
                      <div className="flex flex-wrap gap-1 pl-7">
                        {WEEKDAYS.map((day, idx) => (
                          <button key={idx} type="button" className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors", editForm.recurrence_days.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground")} onClick={() => setEditForm(p => { if (!p) return p; const days = p.recurrence_days.includes(idx) ? p.recurrence_days.filter(d=>d!==idx) : [...p.recurrence_days,idx]; return {...p, recurrence_days: days}; })}>{day}</button>
                        ))}
                      </div>
                    )}
                    {editForm.recurrence_rule && (
                      <div className="pl-7 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-12">Start</span>
                          <Input type="date" value={editForm.recurrence_start} onChange={(e) => setEditForm(p => p ? { ...p, recurrence_start: e.target.value } : p)} className="flex-1 h-7 text-xs" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-12">Slut</span>
                          <Input type="date" value={editForm.recurrence_end} onChange={(e) => setEditForm(p => p ? { ...p, recurrence_end: e.target.value } : p)} className="flex-1 h-7 text-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                  {(storeUsers.length > 0 || groups.length > 0) && (
                    <AssigneePicker
                      users={storeUsers}
                      groups={groups}
                      selectedUserIds={editForm.assigneeUserIds}
                      selectedGroupIds={editForm.assigneeGroupIds}
                      onToggleUser={(uid) => setEditForm(p => { if (!p) return p; const ids = p.assigneeUserIds.includes(uid) ? p.assigneeUserIds.filter(id=>id!==uid) : [...p.assigneeUserIds, uid]; return {...p, assigneeUserIds:ids}; })}
                      onToggleGroup={(gid) => setEditForm(p => { if (!p) return p; const ids = p.assigneeGroupIds.includes(gid) ? p.assigneeGroupIds.filter(id=>id!==gid) : [...p.assigneeGroupIds, gid]; return {...p, assigneeGroupIds:ids}; })}
                    />
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
