import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownUp, Camera, CircleCheck as CheckCircle2, Circle, Clock, Download, GripVertical, ImagePlus, ListChecks, Plus, Repeat, X, Search, FileText, Users, Image as ImageIcon, ChevronDown, ChevronUp, ChevronRight, TriangleAlert as AlertTriangle, ZoomIn, Pencil, Trash2, Hash, ExternalLink, MoveHorizontal as MoreHorizontal, CalendarDays } from "lucide-react";

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
  logAudit, createNotification, notifyUsers, uploadAttachment, getPublicUrl, deleteStorageFiles, mittCoopUrl, mittCoopSearchUrl,
  type ArticleIdType,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn, ensureHttps, sanitizeCsvCell, parseTimeInput } from "@/lib/utils";
import { getSimulatedNow } from "@/lib/time-simulation";

export const Route = createFileRoute("/uppgifter")({
  component: TasksPage,
});

const RECURRENCE_OPTIONS = [
  { value: "", label: "Ingen" },
  { value: "daily", label: "Dagligen" },
  { value: "every_other_day", label: "Varannan dag" },
  { value: "weekly", label: "Varje vecka" },
  { value: "biweekly", label: "Varannan vecka" },
  { value: "monthly", label: "Varje månad" },
  { value: "quarterly", label: "Kvartalsvis" },
  { value: "yearly", label: "Varje år" },
  { value: "custom", label: "Anpassat intervall" },
];

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const MONTHS_SV = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
const QUARTER_MONTHS = [
  { q: "Q1", months: [0, 1, 2] },
  { q: "Q2", months: [3, 4, 5] },
  { q: "Q3", months: [6, 7, 8] },
  { q: "Q4", months: [9, 10, 11] },
];

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

// Returns the start-of-day timestamp for a simulated "today" (Stockholm timezone)
function getSimTodayStartMs(): number {
  return midnightStockholm(new Date(getSimulatedNow())).getTime();
}

// All date arithmetic for recurring tasks uses Europe/Stockholm to prevent DST drift.
// Using Intl.DateTimeFormat ensures the correct local calendar date regardless of the
// device's system timezone.
const TZ = "Europe/Stockholm";
const dtfParts = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

// Returns a Date object representing midnight (00:00:00) in Stockholm time for the given date.
function midnightStockholm(d: Date): Date {
  const parts = Object.fromEntries(dtfParts.formatToParts(d).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  // Construct an ISO string at midnight Stockholm and parse it back via the local TZ offset
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
}

// YYYY-MM-DD string using Stockholm calendar date
function localDateStr(d: Date): string {
  const parts = Object.fromEntries(dtfParts.formatToParts(d).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// A task is due soon if its due_date is within today (but not yet past end of today)
function isDueSoon(due_date: string | null): boolean {
  if (!due_date) return false;
  const now = getSimulatedNow();
  const diff = new Date(due_date).getTime() - now;
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

// A task is overdue if its due date is before NOW (includes earlier today)
function isOverdue(due_date: string | null, status: string): boolean {
  if (!due_date || status === "done" || status === "cancelled") return false;
  return new Date(due_date).getTime() < getSimulatedNow();
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

type FormQuestion = { label: string; question_type: "text" | "yes_no"; is_required: boolean; link_url: string };

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
  due_date_time: "",
  time_slots: [] as string[],
  recurrence_rule: "",
  recurrence_days: [] as number[],
  recurrence_interval: 1,
  recurrence_months: [] as number[],
  recurrence_month_day: 1,
  recurrence_start: "",
  recurrence_end: "",
  sap_article_id: "",
  completion_mode: "manual" as "manual" | "auto_from_children" | "auto_complete_children",
  steps: [{ label: "", requires_photo: false, link_url: "" }] as { label: string; requires_photo: boolean; link_url: string }[],
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
  const [tab, setTab] = useState("today");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
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
    const nowIso = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: isDone ? "todo" : "done", completed_at: isDone ? null : nowIso } : t));
    const tid = setTimeout(() => {
      setUndoToast(null);
      void completeTask(task);
    }, 4000);
    setUndoToast({ task, timeoutId: tid });
  };
  const [showCreate, setShowCreate] = useState(false);
  const [taskArticleType, setTaskArticleType] = useState<ArticleIdType>("mat-nr");
  const [taskArticlePrompt, setTaskArticlePrompt] = useState<string | null>(null);
  const TASK_DRAFT_KEY = `sf-task-draft-${user?.id ?? ""}`;
  const [newTask, _setNewTask] = useState<ReturnType<typeof emptyForm>>(() => {
    try {
      const saved = localStorage.getItem(`sf-task-draft-${user?.id ?? ""}`);
      if (saved) {
        const parsed = JSON.parse(saved) as ReturnType<typeof emptyForm>;
        // Merge with emptyForm defaults so null/missing fields from old drafts
        // never override the array defaults (e.g. recurrence_days, recurrence_months).
        const base = emptyForm(parsed.store_id ?? "");
        return {
          ...base, ...parsed,
          recurrence_days: parsed.recurrence_days ?? base.recurrence_days,
          recurrence_months: parsed.recurrence_months ?? base.recurrence_months,
          time_slots: parsed.time_slots ?? base.time_slots,
          steps: parsed.steps ?? base.steps,
          questions: parsed.questions ?? base.questions,
          assigneeUserIds: parsed.assigneeUserIds ?? base.assigneeUserIds,
          assigneeGroupIds: parsed.assigneeGroupIds ?? base.assigneeGroupIds,
        };
      }
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
  const [showRecurrenceSetup, setShowRecurrenceSetup] = useState(false);
  const [timeSlotInput, setTimeSlotInput] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);
  const stepPhotoInputRef = useRef<HTMLInputElement>(null);
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
  const [deleteHasFuture, setDeleteHasFuture] = useState(false);

  // Bulk operations
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkDeleteTasksOpen, setBulkDeleteTasksOpen] = useState(false);
  const [bulkDeleteHasFuture, setBulkDeleteHasFuture] = useState(false);

  // Edit state
  const [editTask, setEditTask] = useState<TaskFull | null>(null);
  const [editForm, setEditForm] = useState<ReturnType<typeof emptyForm> | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  // 'all_future' = change this + all future instances (default for recurring)
  // 'single' = change only this specific occurrence (due date change isolated)
  const [editScope, setEditScope] = useState<"all_future" | "single">("all_future");

  // Future occurrences manager state
  const [showFutureManager, setShowFutureManager] = useState(false);
  const [futureManagerTask, setFutureManagerTask] = useState<TaskFull | null>(null);
  const [futureOccurrences, setFutureOccurrences] = useState<TaskFull[]>([]);
  const [futureOccLoading, setFutureOccLoading] = useState(false);
  const [selectedFutureIds, setSelectedFutureIds] = useState<Set<string>>(new Set());
  const [futureBulkContent, setFutureBulkContent] = useState("");
  const [futureBulkAssigneeUserIds, setFutureBulkAssigneeUserIds] = useState<string[]>([]);
  const [futureBulkAssigneeGroupIds, setFutureBulkAssigneeGroupIds] = useState<string[]>([]);

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
  const dragStepRef = useRef<{ idx: number; startY: number; currentY: number } | null>(null);
  const dragQuestionRef = useRef<{ idx: number; startY: number; currentY: number } | null>(null);

  // Shared helpers used both at creation time and in the load-time spawn pass.
  const midnight = midnightStockholm;

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
    // Insert questions first so we can remap condition_question_id from parent IDs → child IDs
    const parentQuestions = t.questions ?? [];
    let qIdMap = new Map<string, string>(); // parent question id → child question id
    if (parentQuestions.length > 0) {
      const rows = parentQuestions.map(q => ({ task_id: childId, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: q.sort_order, link_url: (q as { link_url?: string | null }).link_url ?? null }));
      const { data: insertedQs } = await supabase.from("task_questions").insert(rows).select("id, sort_order");
      if (insertedQs) {
        insertedQs.forEach((iq: { id: string; sort_order: number }) => {
          const pq = parentQuestions.find(q => q.sort_order === iq.sort_order);
          if (pq?.id) qIdMap.set(pq.id, iq.id);
        });
      }
    }
    const steps = (t.steps ?? []).map(s => ({
      task_id: childId,
      label: s.label,
      sort_order: s.sort_order,
      requires_photo: s.requires_photo,
      is_done: false,
      link_url: (s as { link_url?: string | null }).link_url ?? null,
      condition_question_id: s.condition_question_id ? (qIdMap.get(s.condition_question_id) ?? null) : null,
      condition_answer: s.condition_answer ?? null,
    }));
    if (steps.length > 0) await supabase.from("task_steps").insert(steps);
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
    const maxCeil = (() => { const d = new Date(nowMs); d.setDate(d.getDate() + 365); return midnight(d); })();
    const ceilDate = parent.recurrence_end
      ? (() => { const e = midnight(new Date(parent.recurrence_end)); return e < maxCeil ? e : maxCeil; })()
      : maxCeil;

    const allPsKeys = new Set<string>();
    const allPeriods: Date[] = [];
    const deletedPeriods = new Set<string>(parent.deleted_periods ?? []);

    // Always include the origin date as the first period so today's instance is created
    const originKey = localDateStr(originDate);
    if (originDate <= ceilDate && !deletedPeriods.has(originKey)) {
      allPsKeys.add(originKey);
      allPeriods.push(originDate);
    }

    const periodStarts = buildPeriodStarts(
      originDate,
      parent.recurrence_rule,
      parent.recurrence_days ?? null,
      parent.recurrence_start ? new Date(parent.recurrence_start) : null,
      parent.recurrence_end ? new Date(parent.recurrence_end) : null,
      ceilDate,
    );
    for (const ps of periodStarts) {
      const k = localDateStr(ps);
      if (!allPsKeys.has(k) && !deletedPeriods.has(k)) { allPsKeys.add(k); allPeriods.push(ps); }
    }

    for (const ps of allPeriods) {
      const psKey = localDateStr(ps);
      const childDue = parent.due_date ? new Date(ps.getTime() + durationMs) : null;
      const { data: child } = await supabase.from("tasks").insert({
        title: parent.title,
        description: parent.description,
        category: parent.category,
        priority: parent.priority,
        store_id: parent.store_id,
        due_date: childDue ? childDue.toISOString() : null,
        due_date_time: (parent as TaskFull & { due_date_time?: string }).due_date_time ?? null,
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
    if (allPeriods.length > 0) {
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
    const spawnCeil = (() => { const d = new Date(nowMs); d.setDate(d.getDate() + 365); return midnight(d); })();

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

      const futurePeriodStarts = buildPeriodStarts(
        originDate, t.recurrence_rule!, t.recurrence_days ?? null,
        t.recurrence_start ? new Date(t.recurrence_start) : null,
        t.recurrence_end ? new Date(t.recurrence_end) : null,
        effectiveCeil,
      );

      // Also include the origin date itself so today's instance is never missing
      const originKey = localDateStr(originDate);
      const allPsMap = new Map<string, Date>();
      if (originDate <= effectiveCeil) allPsMap.set(originKey, originDate);
      for (const ps of futurePeriodStarts) { const k = localDateStr(ps); if (!allPsMap.has(k)) allPsMap.set(k, ps); }
      const periodStarts = Array.from(allPsMap.values());

      const covered = coveredByParent.get(t.id) ?? new Set<string>();
      const deletedPeriods = new Set<string>(t.deleted_periods ?? []);
      for (const ps of periodStarts) {
        const psKey = localDateStr(ps);
        if (covered.has(psKey)) continue;
        if (deletedPeriods.has(psKey)) continue;
        const childDue = t.due_date ? new Date(ps.getTime() + durationMs) : null;
        const { data: child } = await supabase.from("tasks").insert({
          title: t.title, description: t.description, category: t.category, priority: t.priority,
          store_id: t.store_id, due_date: childDue ? childDue.toISOString() : null,
          due_date_time: (t as TaskFull & { due_date_time?: string }).due_date_time ?? null,
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
      .map((it) => ({ label: it.label, requires_photo: it.requires_photo, link_url: it.link_url ?? "" }));
    const questions = (tmpl.questions ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((q) => ({ label: q.label, question_type: q.question_type ?? "text" as "text" | "yes_no", is_required: q.is_required }));
    const dueDate = tmpl.due_date_offset != null
      ? (() => { const d = new Date(getSimulatedNow()); d.setDate(d.getDate() + tmpl.due_date_offset!); return localDateStr(d); })()
      : "";
    const todayStr = localDateStr(new Date(getSimulatedNow()));
    const tmplAny = tmpl as ChecklistTemplate & { recurrence_months?: number[]; recurrence_month_day?: number };
    const timeSlots = (tmpl.time_slots ?? []) as string[];
    setNewTask((p) => ({
      ...p,
      title: p.title || tmpl.title,
      description: tmpl.description ? (p.description || tmpl.description) : p.description,
      category: tmpl.category || p.category,
      priority: tmpl.priority || p.priority,
      recurrence_rule: tmpl.recurrence_rule ?? p.recurrence_rule,
      recurrence_days: tmpl.recurrence_days ?? p.recurrence_days,
      recurrence_interval: tmpl.recurrence_interval ?? p.recurrence_interval,
      recurrence_months: tmplAny.recurrence_months ?? p.recurrence_months,
      recurrence_month_day: tmplAny.recurrence_month_day ?? p.recurrence_month_day,
      recurrence_start: tmpl.recurrence_rule ? todayStr : p.recurrence_start,
      due_date: dueDate || p.due_date,
      // When template has time_slots, those become the due times (not due_date_time)
      due_date_time: timeSlots.length > 0 ? "" : (tmpl.due_date_time ? (p.due_date_time || tmpl.due_date_time) : p.due_date_time),
      time_slots: timeSlots.length > 0 ? timeSlots : p.time_slots,
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
    const visibleSteps = (steps ?? []).filter(s => {
      const sa = s as typeof s & { condition_question_id?: string | null; condition_answer?: string | null };
      if (!sa.condition_question_id) return true;
      const condQ = (questions ?? []).find(q => q.id === sa.condition_question_id);
      if (!condQ?.answer) return false;
      return condQ.answer.toLowerCase() === (sa.condition_answer ?? "ja").toLowerCase();
    });
    const allStepsDone = visibleSteps.every(s => s.is_done);
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
      if (detailTask?.id === task.id) {
        setDetailTask(p => p ? {
          ...p,
          status: newStatus as Task["status"],
          steps: newStatus === "done"
            ? (p.steps ?? []).map(s => ({ ...s, is_done: true }))
            : (p.steps ?? []).map(s => ({ ...s, is_done: false })),
        } : null);
      }
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

  const openDelete = async (task: TaskFull) => {
    setDeleteTarget(task);
    setDeleteScope(null);
    if (task.recurrence_rule || task.parent_task_id) {
      const parentId = task.parent_task_id ?? task.id;
      const today = localDateStr(new Date(getSimulatedNow()));
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("parent_task_id", parentId)
        .gte("recurrence_period_start", today)
        .neq("status", "done");
      setDeleteHasFuture((count ?? 0) > 0);
    } else {
      setDeleteHasFuture(false);
    }
  };

  const confirmDelete = async (scope: "single" | "future") => {
    if (!deleteTarget) return;
    const t = deleteTarget;

    const deletedIds: string[] = [];
    const parentId = t.parent_task_id ?? t.id;
    const isChild = !!t.parent_task_id;
    const periodStart = t.recurrence_period_start ?? (t.due_date ? t.due_date.slice(0, 10) : null);

    if ((t.recurrence_rule || isChild) && scope === "future") {
      if (periodStart) {
        const { data: futureRows } = await supabase
          .from("tasks")
          .select("id, status, completed_at")
          .eq("parent_task_id", parentId)
          .gte("recurrence_period_start", periodStart);

        const incompleteIds = (futureRows ?? [])
          .filter((r: { status: string; completed_at: string | null }) => r.status !== "done" && !r.completed_at)
          .map((r: { id: string }) => r.id);

        if (incompleteIds.length > 0) {
          const { data: imgRows } = await supabase.from("task_images").select("storage_path").in("task_id", incompleteIds);
          deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
          await supabase.from("tasks").delete().in("id", incompleteIds);
          deletedIds.push(...incompleteIds);
        }

        // Cap recurrence_end so spawn won't recreate purged periods
        const dayBefore = new Date(periodStart);
        dayBefore.setDate(dayBefore.getDate() - 1);
        await supabase.from("tasks").update({ recurrence_end: localDateStr(dayBefore) }).eq("id", parentId);
      }
    } else if ((t.recurrence_rule || isChild) && scope === "single") {
      // Delete the child instance; for a recurring parent, only mark the period skipped
      if (isChild && t.status !== "done" && !t.completed_at) {
        const { data: imgRows } = await supabase.from("task_images").select("storage_path").eq("task_id", t.id);
        deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
        await supabase.from("tasks").delete().eq("id", t.id);
        deletedIds.push(t.id);
      }
      if (periodStart) {
        const { data: parent } = await supabase.from("tasks").select("deleted_periods").eq("id", parentId).maybeSingle();
        const existing: string[] = (parent?.deleted_periods ?? []) as string[];
        if (!existing.includes(periodStart)) {
          await supabase.from("tasks").update({ deleted_periods: [...existing, periodStart] }).eq("id", parentId);
        }
      }
    } else {
      if (t.status !== "done" && !t.completed_at) {
        const { data: imgRows } = await supabase.from("task_images").select("storage_path").eq("task_id", t.id);
        deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
        await supabase.from("tasks").delete().eq("id", t.id);
        deletedIds.push(t.id);
      }
    }

    logAudit(user?.id ?? null, "task.delete", "tasks", t.id, { title: t.title, scope });
    setDeleteTarget(null);
    setDeleteScope(null);
    setDetailTask(null);
    spawnRef.current = false;
    await fetchTasks();
  };

  const bulkDeleteTasks = async (recurringScope: "single" | "future") => {
    const ids = [...selectedTaskIds];
    const allDeletedIds: string[] = [];

    for (const taskId of ids) {
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;

      const parentId = task.parent_task_id ?? task.id;
      const isChild = !!task.parent_task_id;
      const periodStart = task.recurrence_period_start ?? (task.due_date ? task.due_date.slice(0, 10) : null);

      if ((task.recurrence_rule || isChild) && recurringScope === "future") {
        if (periodStart) {
          const { data: futureRows } = await supabase
            .from("tasks")
            .select("id, status, completed_at")
            .eq("parent_task_id", parentId)
            .gte("recurrence_period_start", periodStart);
          const incompleteIds = (futureRows ?? [])
            .filter((r: { status: string; completed_at: string | null }) => r.status !== "done" && !r.completed_at)
            .map((r: { id: string }) => r.id);
          if (incompleteIds.length > 0) {
            const { data: imgRows } = await supabase.from("task_images").select("storage_path").in("task_id", incompleteIds);
            deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
            await supabase.from("tasks").delete().in("id", incompleteIds);
            allDeletedIds.push(...incompleteIds);
          }
          const dayBefore = new Date(periodStart);
          dayBefore.setDate(dayBefore.getDate() - 1);
          await supabase.from("tasks").update({ recurrence_end: localDateStr(dayBefore) }).eq("id", parentId);
        }
      } else if ((task.recurrence_rule || isChild) && recurringScope === "single") {
        if (isChild) {
          const { data: imgRows } = await supabase.from("task_images").select("storage_path").eq("task_id", task.id);
          deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
          await supabase.from("tasks").delete().eq("id", task.id);
          allDeletedIds.push(task.id);
        }
        if (periodStart) {
          const { data: parent } = await supabase.from("tasks").select("deleted_periods").eq("id", parentId).maybeSingle();
          const existing: string[] = (parent?.deleted_periods ?? []) as string[];
          if (!existing.includes(periodStart)) {
            await supabase.from("tasks").update({ deleted_periods: [...existing, periodStart] }).eq("id", parentId);
          }
        }
      } else {
        const { data: imgRows } = await supabase.from("task_images").select("storage_path").eq("task_id", task.id);
        deleteStorageFiles((imgRows ?? []).map((r: { storage_path: string }) => r.storage_path));
        await supabase.from("tasks").delete().eq("id", task.id);
        allDeletedIds.push(task.id);
      }
    }

    logAudit(user?.id ?? null, "task.bulk_delete", "tasks", ids[0] ?? "", { count: ids.length, scope: recurringScope });
    setSelectedTaskIds(new Set());
    setBulkDeleteTasksOpen(false);
    spawnRef.current = false;
    await fetchTasks();
  };

  const openEdit = async (task: TaskFull) => {
    setEditTask(task);
    setEditScope(task.recurrence_rule || task.parent_task_id ? "all_future" : "single");
    // For child tasks, fetch parent's recurrence_end so it shows correctly
    let recurrenceEnd = task.recurrence_end ?? "";
    if (task.parent_task_id && !recurrenceEnd) {
      const { data: parent } = await supabase.from("tasks").select("recurrence_end").eq("id", task.parent_task_id).maybeSingle();
      recurrenceEnd = parent?.recurrence_end ?? "";
    }
    setEditForm({
      title: task.title,
      description: task.description ?? "",
      category: task.category,
      priority: task.priority,
      store_id: task.store_id ?? "",
      due_date: task.due_date ? utcIsoToLocalInput(task.due_date) : "",
      due_date_time: (task as TaskFull & { due_date_time?: string }).due_date_time ?? "",
      time_slots: [],
      recurrence_rule: task.recurrence_rule ?? "",
      recurrence_days: task.recurrence_days ?? [],
      recurrence_interval: task.recurrence_interval ?? 1,
      recurrence_months: (task as TaskFull & { recurrence_months?: number[] }).recurrence_months ?? [],
      recurrence_month_day: (task as TaskFull & { recurrence_month_day?: number }).recurrence_month_day ?? 1,
      recurrence_start: task.recurrence_start ?? "",
      recurrence_end: recurrenceEnd,
      sap_article_id: (task as TaskFull & { sap_article_id?: string }).sap_article_id ?? "",
      completion_mode: task.completion_mode ?? "manual",
      steps: (task.steps ?? []).map(s => ({ label: s.label, requires_photo: s.requires_photo, link_url: s.link_url ?? "" })),
      questions: (task.questions ?? []).map(q => ({ label: q.label, question_type: q.question_type ?? "text" as "text" | "yes_no", is_required: q.is_required, link_url: "" })),
      assigneeUserIds: (task.assignees ?? []).filter(a => a.user_id).map(a => a.user_id!),
      assigneeGroupIds: (task.assignees ?? []).filter(a => a.group_id).map(a => a.group_id!),
    });
  };

  // Fetch all future (not done) occurrences for a recurring parent task
  const fetchFutureOccurrences = async (parentTask: TaskFull) => {
    setFutureOccLoading(true);
    const parentId = parentTask.parent_task_id ?? parentTask.id;
    const today = localDateStr(new Date(getSimulatedNow()));
    const { data } = await supabase
      .from("tasks")
      .select("*, steps:task_steps(*), questions:task_questions(*), assignees:task_assignees(*, user:app_users(id,display_name,username), group:user_groups(id,name))")
      .eq("parent_task_id", parentId)
      .gte("recurrence_period_start", today)
      .neq("status", "done")
      .order("recurrence_period_start", { ascending: true });
    setFutureOccurrences((data ?? []) as TaskFull[]);
    setFutureOccLoading(false);
  };

  const openFutureManager = async (task: TaskFull) => {
    setFutureManagerTask(task);
    setShowFutureManager(true);
    setSelectedFutureIds(new Set());
    setFutureBulkContent("");
    setFutureBulkAssigneeUserIds((task.assignees ?? []).filter(a => a.user_id).map(a => a.user_id!));
    setFutureBulkAssigneeGroupIds((task.assignees ?? []).filter(a => a.group_id).map(a => a.group_id!));
    await fetchFutureOccurrences(task);
  };

  const applyBulkFutureEdit = async () => {
    if (selectedFutureIds.size === 0) return;
    const ids = [...selectedFutureIds];
    const updates: Record<string, unknown> = {};
    if (futureBulkContent.trim()) updates.description = futureBulkContent.trim();
    await supabase.from("tasks").update(updates).in("id", ids);
    // Update assignees
    for (const tid of ids) {
      await supabase.from("task_assignees").delete().eq("task_id", tid);
      const rows: { task_id: string; user_id?: string; group_id?: string }[] = [];
      futureBulkAssigneeUserIds.forEach(uid => rows.push({ task_id: tid, user_id: uid }));
      futureBulkAssigneeGroupIds.forEach(gid => rows.push({ task_id: tid, group_id: gid }));
      if (rows.length > 0) await supabase.from("task_assignees").insert(rows);
    }
    logAudit(user?.id ?? null, "task.bulk_future_edit", "tasks", ids[0] ?? "", { count: ids.length });
    setSelectedFutureIds(new Set());
    setFutureBulkContent("");
    if (futureManagerTask) await fetchFutureOccurrences(futureManagerTask);
    await fetchTasks();
  };

  const bulkDeleteFutureOccs = async () => {
    if (selectedFutureIds.size === 0) return;
    const ids = [...selectedFutureIds];
    for (const id of ids) {
      const occ = futureOccurrences.find(o => o.id === id);
      if (!occ) continue;
      const parentId = occ.parent_task_id ?? occ.id;
      const periodStart = occ.recurrence_period_start ?? occ.due_date?.slice(0, 10);
      if (periodStart && parentId !== id) {
        const { data: parent } = await supabase.from("tasks").select("deleted_periods").eq("id", parentId).maybeSingle();
        const existing: string[] = (parent?.deleted_periods ?? []) as string[];
        if (!existing.includes(periodStart)) {
          await supabase.from("tasks").update({ deleted_periods: [...existing, periodStart] }).eq("id", parentId);
        }
      }
      await supabase.from("tasks").delete().eq("id", id);
    }
    logAudit(user?.id ?? null, "task.bulk_delete", "tasks", ids[0] ?? "", { count: ids.length, scope: "future_manager" });
    setSelectedFutureIds(new Set());
    if (futureManagerTask) await fetchFutureOccurrences(futureManagerTask);
    await fetchTasks();
  };

  const markFutureOccDone = async (occ: TaskFull) => {
    await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", occ.id);
    logAudit(user?.id ?? null, "task.complete", "tasks", occ.id, { title: occ.title });
    if (futureManagerTask) await fetchFutureOccurrences(futureManagerTask);
    await fetchTasks();
  };

  const deleteFutureOcc = async (occ: TaskFull) => {
    const parentId = occ.parent_task_id ?? occ.id;
    const periodStart = occ.recurrence_period_start ?? occ.due_date?.slice(0, 10);
    if (periodStart && parentId !== occ.id) {
      const { data: parent } = await supabase.from("tasks").select("deleted_periods").eq("id", parentId).maybeSingle();
      const existing: string[] = (parent?.deleted_periods ?? []) as string[];
      if (!existing.includes(periodStart)) {
        await supabase.from("tasks").update({ deleted_periods: [...existing, periodStart] }).eq("id", parentId);
      }
    }
    await supabase.from("tasks").delete().eq("id", occ.id);
    logAudit(user?.id ?? null, "task.delete", "tasks", occ.id, { title: occ.title, scope: "single" });
    if (futureManagerTask) await fetchFutureOccurrences(futureManagerTask);
    await fetchTasks();
  };

  const saveEdit = async () => {
    if (!editTask || !editForm || !isManager) return;
    setEditSaving(true);
    const isRecurring = !!(editTask.recurrence_rule || editTask.parent_task_id);
    const isChild = !!editTask.parent_task_id;

    // For "single" scope on recurring tasks: only update this instance's due_date + content
    if (isRecurring && editScope === "single") {
      await supabase.from("tasks").update({
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        category: editForm.category,
        priority: editForm.priority,
        due_date: editForm.due_date ? localInputToUtcIso(editForm.due_date) : null,
        completion_mode: editForm.completion_mode || "manual",
      }).eq("id", editTask.id);

      const validSteps = editForm.steps.filter(s => s.label.trim());
      const validQuestions = editForm.questions.filter(q => q.label.trim());
      await supabase.from("task_steps").delete().eq("task_id", editTask.id);
      if (validSteps.length > 0) {
        await supabase.from("task_steps").insert(validSteps.map((s, i) => ({ task_id: editTask.id, label: s.label, sort_order: i, requires_photo: s.requires_photo, is_done: false, link_url: s.link_url || null })));
      }
      await supabase.from("task_questions").delete().eq("task_id", editTask.id);
      if (validQuestions.length > 0) {
        await supabase.from("task_questions").insert(validQuestions.map((q, i) => ({ task_id: editTask.id, label: q.label, question_type: q.question_type, is_required: q.is_required, sort_order: i, link_url: q.link_url || null })));
      }
      await supabase.from("task_assignees").delete().eq("task_id", editTask.id);
      const singleAssigneeRows: { task_id: string; user_id?: string; group_id?: string }[] = [];
      editForm.assigneeUserIds.forEach(uid => singleAssigneeRows.push({ task_id: editTask.id, user_id: uid }));
      editForm.assigneeGroupIds.forEach(gid => singleAssigneeRows.push({ task_id: editTask.id, group_id: gid }));
      if (singleAssigneeRows.length > 0) await supabase.from("task_assignees").insert(singleAssigneeRows);

      logAudit(user?.id ?? null, "task.edit.single", "tasks", editTask.id, { title: editForm.title.trim() });
      setEditTask(null);
      setEditForm(null);
      setDetailTask(null);
      setEditSaving(false);
      await fetchTasks();
      return;
    }

    // "all_future" scope (or non-recurring): update this + all future instances
    // Lock recurrence_start — never allow changing it
    const coreUpdates = {
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      category: editForm.category,
      priority: editForm.priority,
      store_id: editForm.store_id || null,
      recurrence_rule: editForm.recurrence_rule || null,
      recurrence_days: editForm.recurrence_days.length > 0 ? editForm.recurrence_days : null,
      recurrence_interval: editForm.recurrence_interval > 1 ? editForm.recurrence_interval : null,
      // recurrence_start intentionally NOT updated — start date is locked
      recurrence_end: editForm.recurrence_end || null,
      completion_mode: editForm.completion_mode || "manual",
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
        await supabase.from("task_steps").insert(validSteps.map((s, i) => ({ task_id: tid, label: s.label, sort_order: i, requires_photo: s.requires_photo, is_done: false, link_url: s.link_url || null })));
      }
      await supabase.from("task_questions").delete().eq("task_id", tid);
      if (validQuestions.length > 0) {
        await supabase.from("task_questions").insert(validQuestions.map((q, i) => ({ task_id: tid, label: q.label, question_type: q.question_type, is_required: q.is_required, sort_order: i, link_url: q.link_url || null })));
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
    if (newTask.assigneeUserIds.length === 0 && newTask.assigneeGroupIds.length === 0) {
      setSaveError("Minst en tilldelad användare eller grupp är obligatorisk.");
      return;
    }
    if (!isManager) return;
    setSaving(true);

    const validSteps = newTask.steps.filter(s => s.label.trim());
    const validQuestions = newTask.questions.filter(q => q.label.trim());

    // Build a local-midnight ISO string so due_date displays on the correct date
    // regardless of timezone. new Date("YYYY-MM-DD") parses as UTC midnight which
    // shows as 02:00 in UTC+2 — instead we set time explicitly in local time.
    const buildDueDate = (dueTime?: string): string | null => {
      if (!newTask.due_date) return null;
      const [y, mo, d] = newTask.due_date.split("-").map(Number);
      const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
      if (dueTime) {
        const [h, m] = dueTime.split(":").map(Number);
        dt.setHours(h, m, 0, 0);
      }
      return dt.toISOString();
    };

    const insertSingleTask = async (dueTime: string) => {
      const dueIso = buildDueDate(dueTime);
      const { data: task, error } = await supabase.from("tasks").insert({
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        category: newTask.category,
        priority: newTask.priority,
        store_id: newTask.store_id || null,
        due_date: dueIso,
        due_date_time: dueTime || null,
        due_date_offset: null,
        recurring: newTask.recurrence_rule || null,
        recurrence_rule: newTask.recurrence_rule || null,
        recurrence_days: newTask.recurrence_days.length > 0 ? newTask.recurrence_days : null,
        recurrence_interval: newTask.recurrence_interval,
        recurrence_months: newTask.recurrence_months.length ? newTask.recurrence_months : null,
        recurrence_month_day: newTask.recurrence_month_day ?? null,
        recurrence_start: newTask.recurrence_start || null,
        recurrence_end: newTask.recurrence_end || null,
        sap_article_id: newTask.sap_article_id?.trim() || null,
        completion_mode: "manual",
        created_by: user?.id,
        assigned_to: newTask.assigneeUserIds[0] ?? user?.id,
        status: "todo",
      }).select().maybeSingle();

      if (error || !task) return null;

      if (validSteps.length > 0) {
        await supabase.from("task_steps").insert(
          validSteps.map((s, i) => ({ task_id: task.id, label: s.label, sort_order: i, requires_photo: s.requires_photo, link_url: s.link_url || null }))
        );
      }
      if (validQuestions.length > 0) {
        await supabase.from("task_questions").insert(
          validQuestions.map((q, i) => ({ task_id: task.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: i, link_url: q.link_url || null }))
        );
      }

      const assigneeRows: { task_id: string; user_id?: string; group_id?: string }[] = [];
      newTask.assigneeUserIds.forEach(uid => assigneeRows.push({ task_id: task.id, user_id: uid }));
      newTask.assigneeGroupIds.forEach(gid => assigneeRows.push({ task_id: task.id, group_id: gid }));
      if (assigneeRows.length > 0) await supabase.from("task_assignees").insert(assigneeRows);

      return task;
    };

    // When time_slots are set, create one task per slot; otherwise create one task
    const slots = newTask.time_slots.length > 0 ? newTask.time_slots : [newTask.due_date_time || ""];
    const createdTasks = [];
    for (const slot of slots) {
      const t = await insertSingleTask(slot);
      if (t) createdTasks.push(t);
    }

    // Attachments, notifications, audit and recurring spawn on first created task
    const firstTask = createdTasks[0];
    if (firstTask) {
      if (uploadFiles.length > 0) {
        for (const file of uploadFiles) {
          const path = await uploadAttachment(file, `tasks/${firstTask.id}`);
          if (path) await supabase.from("task_images").insert({ task_id: firstTask.id, storage_path: path, uploaded_by: user?.id });
        }
      }

      logAudit(user?.id ?? null, "task.create", "tasks", firstTask.id, { title: firstTask.title, slot_count: createdTasks.length });

      const notifyIds = new Set<string>();
      newTask.assigneeUserIds.forEach(uid => { if (uid !== user?.id) notifyIds.add(uid); });
      if (newTask.assigneeGroupIds.length > 0) {
        const { data: members } = await supabase
          .from("user_group_members").select("user_id").in("group_id", newTask.assigneeGroupIds);
        members?.forEach((m: { user_id: string }) => { if (m.user_id !== user?.id) notifyIds.add(m.user_id); });
      }
      if (notifyIds.size > 0) {
        notifyUsers([...notifyIds], "task_assigned", `Ny uppgift tilldelad: ${firstTask.title}`, `Tilldelad av ${user?.display_name}`, "/uppgifter");
      }

      if (firstTask.recurrence_rule) {
        const assigneesFull = newTask.assigneeUserIds.map(uid => ({ task_id: firstTask.id, user_id: uid, group_id: null }));
        newTask.assigneeGroupIds.forEach(gid => assigneesFull.push({ task_id: firstTask.id, user_id: null as unknown as string, group_id: gid }));
        const parentFull: TaskFull = {
          ...firstTask,
          steps: validSteps.map((s, i) => ({ id: "", task_id: firstTask.id, label: s.label, sort_order: i, requires_photo: s.requires_photo, is_done: false, link_url: s.link_url || null })),
          questions: validQuestions.map((q, i) => ({ id: "", task_id: firstTask.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: i, answer: null })),
          assignees: assigneesFull.map(a => ({ task_id: firstTask.id, user_id: a.user_id, group_id: a.group_id })),
          images: [],
        };
        spawnRef.current = false;
        await spawnChildrenForNewParent(parentFull);
      }
    } else {
      setSaveError("Kunde inte spara uppgiften. Försök igen.");
      setSaving(false);
      return;
    }

    await fetchTasks();
    setSaving(false);
    setShowCreate(false);
    try { localStorage.removeItem(TASK_DRAFT_KEY); } catch {}
    setNewTask(emptyForm(activeStore?.id ?? ""));
    setUploadFiles([]);
  };

  const exportCSV = () => {
    const headers = [
      "Titel", "Kategori", "Beskrivning", "Prioritet", "Status", "Version",
      "Återkommande", "Veckodagar", "Månader", "Månadsdag", "Intervall",
      "Förfaller om (dagar)", "Förfallotid (HH:MM)", "Startdatum", "Slutdatum",
      "Ursprungsmall", "Arvläge", "Steg (detaljer)", "Frågor", "Tidsluckor (HH:MM)",
      "SAP-artikel", "Mallpaket",
    ];
    // Exclude child recurrence instances (parent_task_id set) — they are just spawned
    // copies of the parent. Export only parent/standalone tasks so importing into
    // mallar doesn't create one template per occurrence.
    const seenKeys = new Set<string>();
    const exportableTasks = visibleTasks.filter((t) => {
      if (t.parent_task_id !== null) return false;
      const key = `${t.title}__${t.recurrence_rule ?? ""}__${t.category ?? ""}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    const rows = [
      headers,
      ...exportableTasks.map((t) => {
        const tAny = t as TaskFull & { due_date_time?: string; recurrence_interval?: number; time_slots?: string[]; sap_article_id?: string; due_date_offset?: number };
        // Use stored offset when available; for recurring tasks the live due_date
        // is instance-specific and should not be recalculated as offset.
        const dueDays = tAny.due_date_offset != null
          ? String(tAny.due_date_offset)
          : (t.recurrence_rule ? "" : t.due_date
            ? String(Math.round((new Date(t.due_date).getTime() - Date.now()) / 86400000))
            : "");
        const stepsStr = (t.steps ?? []).sort((a, b) => a.sort_order - b.sort_order).map((s, i) => {
          let part = `${i + 1}. ${s.label}`;
          if (s.requires_photo) part += " [foto]";
          if ((s as typeof s & { link_url?: string }).link_url) part += ` [url:${(s as typeof s & { link_url?: string }).link_url}]`;
          return part;
        }).join(" | ");
        const questionsStr = (t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q, i) =>
          `${i + 1}. ${q.label}${q.is_required ? " [obligatorisk]" : ""}${q.question_type === "yes_no" ? " [ja_nej]" : ""}${(q as typeof q & { link_url?: string }).link_url ? ` [url:${(q as typeof q & { link_url?: string }).link_url}]` : ""}`
        ).join(" | ");
        return [
          t.title,
          t.category ?? "",
          t.description ?? "",
          t.priority ?? "Medel",
          "", // Status
          "", // Version
          t.recurrence_rule ?? "",
          (t.recurrence_days ?? []).join(","),
          "", // Månader
          "", // Månadsdag
          tAny.recurrence_interval != null ? String(tAny.recurrence_interval) : "",
          dueDays,
          tAny.due_date_time ?? "",
          t.recurrence_start ?? "",
          t.recurrence_end ?? "",
          "", // Ursprungsmall
          "", // Arvläge
          stepsStr,
          questionsStr,
          (tAny.time_slots ?? []).join(" | "),
          tAny.sap_article_id ?? "",
          "", // Mallpaket — tasks don't belong to template packages
        ];
      }),
    ];
    const instructions = `# Exporterat ${new Date().toLocaleDateString("sv-SE")} — kan importeras direkt som mallar\n`;
    const csv = instructions + rows.map((r) => r.map((v) => `"${sanitizeCsvCell(String(v ?? "").replace(/"/g, '""'))}"`).join(";")).join("\n");
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
    { value: "active", label: "Aktiva" },
    { value: "recurring", label: "Återkommande" },
    { value: "all", label: "Alla" },
    { value: "done", label: "Klara" },
    { value: "late", label: "Försenade" },
  ];

  const simNow = getSimulatedNow();
  const simTodayStart = midnightStockholm(new Date(simNow));
  const simTodayEnd = new Date(simTodayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  // Build a map: parentId → the child task for TODAY's period
  // This is used to show one representative row per recurring series
  const recurringParentIds = new Set(
    visibleTasks.filter(t => t.recurrence_rule && !t.parent_task_id).map(t => t.id)
  );

  // For each recurring parent, find the best representative child:
  // Priority 1: Today's undone instance (due today, not done/cancelled)
  // Priority 2: Next upcoming undone instance (nearest due_date > today)
  // Priority 3: Today's done instance (completed today — show in "klara" tab)
  // Priority 4: Most recently completed instance
  const currentChildByParent = new Map<string, TaskFull>();
  for (const parentId of recurringParentIds) {
    const children = visibleTasks
      .filter(t => t.parent_task_id === parentId)
      .sort((a, b) => {
        const aT = a.due_date ? new Date(a.due_date).getTime() : 0;
        const bT = b.due_date ? new Date(b.due_date).getTime() : 0;
        return aT - bT; // ascending by due_date
      });
    if (children.length === 0) continue;
    // Priority 1: today's undone instance
    const todayUndone = children.find(t =>
      t.due_date && new Date(t.due_date) >= simTodayStart && new Date(t.due_date) <= simTodayEnd &&
      t.status !== "done" && t.status !== "cancelled"
    );
    if (todayUndone) { currentChildByParent.set(parentId, todayUndone); continue; }
    // Priority 2: most recent overdue undone (due_date strictly before today)
    const overdueUndone = [...children].reverse().find(t =>
      t.due_date && new Date(t.due_date) < simTodayStart &&
      t.status !== "done" && t.status !== "cancelled"
    );
    if (overdueUndone) { currentChildByParent.set(parentId, overdueUndone); continue; }
    // Priority 3: today's done instance — shows in "klara" section, takes priority over future undone
    const todayDone = children.find(t =>
      t.due_date && new Date(t.due_date) >= simTodayStart && new Date(t.due_date) <= simTodayEnd &&
      t.status === "done"
    );
    if (todayDone) { currentChildByParent.set(parentId, todayDone); continue; }
    // Priority 4: nearest upcoming undone (due_date strictly after today)
    const nextUndone = children.find(t =>
      t.due_date && new Date(t.due_date) > simTodayEnd &&
      t.status !== "done" && t.status !== "cancelled"
    );
    if (nextUndone) { currentChildByParent.set(parentId, nextUndone); continue; }
    // Priority 5: most recently completed (last in sorted order that is done)
    const lastDone = [...children].reverse().find(t => t.status === "done");
    if (lastDone) { currentChildByParent.set(parentId, lastDone); continue; }
    // Fallback: first child
    currentChildByParent.set(parentId, children[0]);
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
      // Always hide child recurring tasks that aren't the current representative,
      // EXCEPT children that were done early today — they must still appear in the klara section
      if (hiddenChildIds.has(t.id)) {
        const doneEarlyToday = t.status === "done" && t.completed_at && t.due_date &&
          new Date(t.completed_at) >= simTodayStart &&
          new Date(t.due_date) > simTodayEnd;
        if (!doneEarlyToday) return false;
      }
      // Always hide recurring parents that have children (they're represented by children)
      if (recurringParentIds.has(t.id) && currentChildByParent.has(t.id)) return false;

      // Search filter
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.category ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      // Category filter
      if (filterCategory && t.category !== filterCategory) return false;
      // Priority filter
      if (filterPriority && t.priority !== filterPriority) return false;

      // Tab filters
      if (tab === "today") {
        // Today = tasks due today (or overdue), non-cancelled
        if (t.status === "cancelled") return false;
        const isDueToday = t.due_date
          ? new Date(t.due_date) >= simTodayStart && new Date(t.due_date) <= simTodayEnd
          : false;
        const isOverdueTask = isOverdue(t.due_date, t.status);
        const hasNoDate = !t.due_date;
        // Also include done tasks that were completed today or were due today
        const isDoneToday = t.status === "done" && t.completed_at
          ? new Date(t.completed_at) >= simTodayStart
          : false;
        const isDoneDueToday = t.status === "done" && isDueToday;
        return isDueToday || isOverdueTask || isDoneToday || isDoneDueToday || (hasNoDate && t.status !== "done");
      }
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

  // Render a single task card (compact list style used across all views)
  const weekdayShort = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

  const renderTaskCard = (t: TaskFull, earlyCompletion = false) => {
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
    const recLabel = t.recurrence_rule === "weekly" && t.recurrence_days && t.recurrence_days.length > 0
      ? `${RECURRENCE_OPTIONS.find(r => r.value === t.recurrence_rule)?.label} (${[...t.recurrence_days].sort((a, b) => a - b).map(d => weekdayShort[d]).join(", ")})`
      : RECURRENCE_OPTIONS.find(r => r.value === t.recurrence_rule)?.label;

    return (
      <div key={t.id} className="flex items-stretch gap-2">
        {isManager && (
          <div className="flex items-center pl-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedTaskIds.has(t.id)}
              onCheckedChange={(checked) => {
                const next = new Set(selectedTaskIds);
                if (checked) next.add(t.id); else next.delete(t.id);
                setSelectedTaskIds(next);
              }}
            />
          </div>
        )}
      <SwipeableCard
        done={done}
        onSwipeRight={() => swipeComplete(t)}
        onSwipeLeft={() => openDetail(t)}
        onClick={() => openDetail(t)}
        className={cn(
          "cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all flex-1",
          "shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]",
          done && "opacity-55 border-border/30",
          !done && overdue && "border-destructive animate-[overdue-pulse_1.5s_ease-in-out_infinite]",
          !done && !overdue && "border-border/60"
        )}
      >
        <div className="flex items-stretch">
          <div className={cn(
            "w-1 shrink-0 rounded-l-2xl",
            done ? "bg-success/40" : overdue ? "bg-destructive" : dueSoon ? "bg-warning" : t.priority === "Kritisk" ? "bg-destructive/70" : t.priority === "Hög" ? "bg-warning/70" : "bg-primary/30"
          )} />
          <div className="flex-1 min-w-0 px-4 pt-3.5 pb-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h3 className={cn(
                  "text-sm font-semibold leading-snug",
                  done && "line-through text-muted-foreground"
                )}>
                  {t.title}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {t.due_date && (
                    <span className={cn("inline-flex items-center gap-1", overdue && !done && "text-destructive font-semibold")}>
                      <Clock className="h-3 w-3" />
                      {new Date(t.due_date).toLocaleDateString("sv-SE", { weekday: "short", month: "short", day: "numeric" })}
                      {(t as TaskFull & { due_date_time?: string }).due_date_time && (
                        <span className="ml-0.5">{(t as TaskFull & { due_date_time?: string }).due_date_time}</span>
                      )}
                    </span>
                  )}
                  {t.recurrence_rule && (
                    <span className="inline-flex items-center gap-1 text-primary/70">
                      <Repeat className="h-3 w-3" />
                      {recLabel}
                    </span>
                  )}
                  {t.assignees && t.assignees.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {t.assignees.slice(0, 2).map(a => a.user?.display_name ?? a.group?.name).filter(Boolean).join(", ")}
                      {t.assignees.length > 2 && ` +${t.assignees.length - 2}`}
                    </span>
                  )}
                  {t.category && t.category !== "Drift" && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{t.category}</span>
                  )}
                </div>
                {totalItems > 0 && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1 overflow-hidden rounded-full bg-muted/60 h-1">
                      <div
                        className={cn("h-full rounded-full transition-all duration-300", done ? "bg-success" : "bg-primary")}
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{doneItems}/{totalItems}</span>
                  </div>
                )}
                {stepsTotal > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {(t.steps ?? []).slice(0, 4).map((s, i) => (
                      <div key={i} className={cn("flex items-center gap-1.5 text-[11px]", s.is_done ? "text-muted-foreground line-through" : "text-foreground/70")}>
                        {s.is_done
                          ? <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                          : <Circle className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                        }
                        <span className="truncate">{s.label}</span>
                      </div>
                    ))}
                    {stepsTotal > 4 && (
                      <p className="text-[10px] text-muted-foreground/60 pl-4">+{stepsTotal - 4} fler steg</p>
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 mt-0.5">
                {done
                  ? <CheckCircle2 className="h-5 w-5 text-success" />
                  : overdue
                    ? <AlertTriangle className="h-4 w-4 text-destructive" />
                    : dueSoon
                      ? <Clock className="h-4 w-4 text-warning-foreground" />
                      : <Circle className="h-5 w-5 text-muted-foreground/25" />
                }
              </div>
            </div>
            {earlyCompletion && done && (
              <div className="mt-2 flex items-center gap-1 w-fit rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Klar i förtid
              </div>
            )}
          </div>
        </div>
      </SwipeableCard>
      </div>
    );
  };

  const renderTodayView = () => {
    const sortByPriority = (a: TaskFull, b: TaskFull) =>
      (PRIORITY_ORDER[a.priority ?? "Medel"] ?? 2) - (PRIORITY_ORDER[b.priority ?? "Medel"] ?? 2);

    // "Försenade" in today view = tasks from previous days (before today's midnight)
    const overdueTasks = filtered.filter(t =>
      t.status !== "done" && t.due_date && new Date(t.due_date) < simTodayStart
    ).sort(sortByPriority);
    const todayTasks = filtered.filter(t =>
      t.status !== "done" &&
      t.due_date &&
      new Date(t.due_date) >= simTodayStart &&
      new Date(t.due_date) <= simTodayEnd
    ).sort(sortByPriority);
    const noDateTasks = filtered.filter(t => !t.due_date && t.status !== "done").sort(sortByPriority);
    // Completed tasks: those with status done. For recurring tasks completed before their due_date, flag them.
    const doneTodayTasks = filtered.filter(t => t.status === "done");

    // Detect early completion: done on a calendar day strictly before the due date's calendar day
    const isEarlyCompletion = (t: TaskFull): boolean => {
      if (t.status !== "done" || !t.due_date || !t.completed_at) return false;
      const completedDay = midnight(new Date(t.completed_at));
      const dueDay = midnight(new Date(t.due_date));
      return completedDay < dueDay;
    };
    const totalToday = filtered.length; // includes done tasks for accurate ratio
    const doneCount = doneTodayTasks.length;
    const progressPct = totalToday > 0 ? Math.round((doneCount / totalToday) * 100) : 0;
    const todayLabel = new Date(simNow).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">{todayLabel}</p>
              <p className="text-2xl font-bold text-foreground">
                {doneCount} / {totalToday}
                <span className="text-base font-normal text-muted-foreground ml-2">slutförda</span>
              </p>
            </div>
            <div className="relative h-16 w-16 shrink-0">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/40" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeDasharray={`${progressPct} ${100 - progressPct}`}
                  strokeLinecap="round"
                  className={progressPct === 100 ? "text-success" : "text-primary"}
                  style={{ transition: "stroke-dasharray 0.5s ease" }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">
                {progressPct}%
              </span>
            </div>
          </div>
          {totalToday > 0 && (
            <div className="mt-3 h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", progressPct === 100 ? "bg-success" : "bg-primary")}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        {totalToday === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-14 text-center">
            <CheckCircle2 className="mb-3 h-10 w-10 text-success/50" />
            <p className="text-sm font-semibold">Inga uppgifter för idag</p>
            <p className="text-xs text-muted-foreground mt-1">{isManager ? "Njut av dagen eller lägg till nya uppgifter." : "Njut av dagen!"}</p>
            {isManager && (
              <Button className="mt-4 rounded-full" size="sm" onClick={() => { setShowRecurrenceSetup(true); setSaveError(""); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Ny uppgift
              </Button>
            )}
          </div>
        )}

        {overdueTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-destructive">Försenade</h2>
              <span className="ml-auto text-[11px] text-muted-foreground">{overdueTasks.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{overdueTasks.map(renderTaskCard)}</div>
          </div>
        )}

        {todayTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-primary/80">Idag</h2>
              <span className="ml-auto text-[11px] text-muted-foreground">{todayTasks.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{todayTasks.map(renderTaskCard)}</div>
          </div>
        )}

        {noDateTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Utan datum</h2>
              <span className="ml-auto text-[11px] text-muted-foreground">{noDateTasks.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{noDateTasks.map(renderTaskCard)}</div>
          </div>
        )}

        {doneTodayTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-success/80">Klara</h2>
              <span className="ml-auto text-[11px] text-muted-foreground">{doneTodayTasks.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {doneTodayTasks.map(t => renderTaskCard(t, isEarlyCompletion(t)))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Uppgifter</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeStore ? activeStore.name : "Alla butiker"}
          </p>
        </div>
        {isManager && (
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={exportCSV}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Exportera
            </Button>
            <Button size="sm" className="rounded-full text-xs" onClick={() => { setShowRecurrenceSetup(true); setSaveError(""); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Ny uppgift
            </Button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedTaskIds.size > 0 && isManager && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <span className="text-sm font-medium text-destructive">{selectedTaskIds.size} uppgifter markerade</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" className="rounded-full h-8 text-xs" onClick={() => setSelectedTaskIds(new Set())}>
              Avmarkera
            </Button>
            <Button variant="destructive" size="sm" className="rounded-full h-8 gap-1.5 text-xs" onClick={async () => {
              const recurringIds = tasks.filter(t => selectedTaskIds.has(t.id) && (t.recurrence_rule || t.parent_task_id));
              if (recurringIds.length > 0) {
                const today = localDateStr(new Date(getSimulatedNow()));
                let hasFuture = false;
                for (const t of recurringIds) {
                  const parentId = t.parent_task_id ?? t.id;
                  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true })
                    .eq("parent_task_id", parentId).gte("recurrence_period_start", today).neq("status", "done");
                  if ((count ?? 0) > 0) { hasFuture = true; break; }
                }
                setBulkDeleteHasFuture(hasFuture);
              } else {
                setBulkDeleteHasFuture(false);
              }
              setBulkDeleteTasksOpen(true);
            }}>
              <Trash2 className="h-3.5 w-3.5" /> Ta bort markerade
            </Button>
          </div>
        </div>
      )}

      {/* Tabs + search */}
      <div className="mb-5 space-y-3">
        <div className="overflow-x-auto pb-0.5 -mx-1 px-1">
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setShowPastTasks(false); }}>
            <TabsList className="rounded-full bg-muted/50 p-1 w-max gap-0.5">
              {filters.map((f) => {
                let count = 0;
                const baseList = visibleTasks.filter(t => !hiddenChildIds.has(t.id) && !(recurringParentIds.has(t.id) && currentChildByParent.has(t.id)));
                if (f.value === "today") count = baseList.filter(t => t.status !== "cancelled" && (
                  (t.due_date && new Date(t.due_date) >= simTodayStart && new Date(t.due_date) <= simTodayEnd) ||
                  isOverdue(t.due_date, t.status) ||
                  (!t.due_date && t.status !== "done")
                )).length;
                else if (f.value === "active") count = baseList.filter(t => t.status !== "cancelled" && t.status !== "done" && !isPast(t)).length;
                else if (f.value === "recurring") count = baseList.filter(t => isRecurring(t)).length;
                else if (f.value === "all") count = baseList.length;
                else if (f.value === "done") count = baseList.filter(t => t.status === "done").length;
                else if (f.value === "late") count = baseList.filter(t => effectiveStatus(t) === "late").length;
                return (
                  <TabsTrigger key={f.value} value={f.value}
                    className="gap-1.5 rounded-full px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs whitespace-nowrap">
                    {f.label}
                    {count > 0 && (
                      <span className={cn(
                        "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                        f.value === "late" && count > 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
                      )}>
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
        {tab !== "today" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-32">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Sök uppgifter..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-full pl-9 text-sm w-full" />
            </div>
            {/* Category filter */}
            {[...new Set(tasks.map(t => t.category).filter(Boolean))].length > 0 && (
              <Select value={filterCategory || "__all"} onValueChange={(v) => setFilterCategory(v === "__all" ? "" : v)}>
                <SelectTrigger className="h-9 w-auto min-w-[110px] rounded-full text-xs gap-1.5">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Alla kategorier</SelectItem>
                  {[...new Set(tasks.map(t => t.category).filter(Boolean) as string[])].sort().map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Priority filter */}
            <Select value={filterPriority || "__all"} onValueChange={(v) => setFilterPriority(v === "__all" ? "" : v)}>
              <SelectTrigger className="h-9 w-auto min-w-[110px] rounded-full text-xs gap-1.5">
                <SelectValue placeholder="Prioritet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Alla prioriteter</SelectItem>
                {["Kritisk", "Hög", "Medel", "Låg"].map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-9 w-auto min-w-[120px] rounded-full text-xs gap-1.5">
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
            {isManager && filtered.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full text-xs shrink-0"
                onClick={() => {
                  if (selectedTaskIds.size === filtered.length) {
                    setSelectedTaskIds(new Set());
                  } else {
                    setSelectedTaskIds(new Set(filtered.map(t => t.id)));
                  }
                }}
              >
                {selectedTaskIds.size === filtered.length && filtered.length > 0 ? "Avmarkera alla" : "Markera alla"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl border border-border/50 bg-card p-4 flex items-center gap-3">
              <div className="w-1 h-12 rounded-full animate-pulse bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-1/3 animate-pulse rounded-md bg-muted/60" />
              </div>
              <div className="h-5 w-5 animate-pulse rounded-full bg-muted/60" />
            </div>
          ))}
        </div>
      ) : tab === "today" ? (
        renderTodayView()
      ) : filtered.length === 0 && hiddenPastCount === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <ListChecks className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Inga uppgifter hittades</p>
          {isManager && (
            <Button className="mt-4 rounded-full" size="sm" onClick={() => { setShowRecurrenceSetup(true); setSaveError(""); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Skapa uppgift
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(renderTaskCard)}
        </div>
      )}

      {/* Undo toast */}
      {undoToast && (
        <div className="fixed bottom-44 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card px-5 py-3 shadow-[var(--shadow-lg)]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <span className="text-sm font-medium">Markerad som klar</span>
            <button
              className="ml-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted/70 active:scale-95 transition-transform"
              onClick={() => {
                dismissUndoToast();
                setTasks(prev => prev.map(t => t.id === undoToast.task.id ? undoToast.task : t));
              }}
            >
              Ångra
            </button>
          </div>
        </div>
      )}

      {/* Mobile FAB */}
      {isManager && (
        <button
          className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lg)] transition-transform active:scale-95 lg:hidden"
          aria-label="Ny uppgift"
          onClick={() => { setShowRecurrenceSetup(true); setSaveError(""); }}
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

              {/* SAP product catalog deep link */}
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
                    Mitt Coop {detailTask.sap_article_id}
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
                    {(detailTask as TaskFull & { due_date_time?: string }).due_date_time && (
                      <span className="ml-0.5 font-semibold">{(detailTask as TaskFull & { due_date_time?: string }).due_date_time}</span>
                    )}
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
                    // Conditional visibility: hide step if condition question has been answered but answer doesn't match
                    const stepAny = step as typeof step & { condition_question_id?: string | null; condition_answer?: string | null };
                    if (stepAny.condition_question_id) {
                      const condQ = detailTask.questions?.find(q => q.id === stepAny.condition_question_id);
                      if (condQ) {
                        // If not yet answered, hide the step
                        if (!condQ.answer) return null;
                        // If answered, check if it matches the required condition_answer
                        if (condQ.answer.toLowerCase() !== (stepAny.condition_answer ?? "ja").toLowerCase()) return null;
                      }
                    }
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
                          {(step as typeof step & { link_url?: string }).link_url && (
                            <a
                              href={(step as typeof step & { link_url?: string }).link_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Länk
                            </a>
                          )}
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
                      <div className="flex items-center gap-2">
                        <Label className="flex-1 text-sm">
                          {q.label}
                          {q.is_required && <span className="ml-1 text-destructive">*</span>}
                        </Label>
                        {(q as typeof q & { link_url?: string }).link_url && (
                          <a
                            href={(q as typeof q & { link_url?: string }).link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Länk
                          </a>
                        )}
                      </div>
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
                    onClick={() => { void openEdit(detailTask); setDetailTask(null); }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Redigera
                  </Button>
                )}
                {isManager && (detailTask.recurrence_rule || detailTask.parent_task_id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
                    onClick={() => { void openFutureManager(detailTask); setDetailTask(null); }}
                  >
                    <CalendarDays className="h-3.5 w-3.5" /> Förekomster
                  </Button>
                )}
                {isManager && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full gap-1.5 border-destructive/60 text-destructive hover:bg-destructive/10 hover:border-destructive"
                    onClick={() => void openDelete(detailTask)}
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

      {/* RECURRENCE SETUP POPUP — appears first when creating a task */}
      <Dialog open={showRecurrenceSetup} onOpenChange={(o) => { if (!o) setShowRecurrenceSetup(false); }}>
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            <Repeat className="h-4 w-4 text-muted-foreground shrink-0" />
            <DialogTitle className="text-sm font-semibold">Återkommande uppgift?</DialogTitle>
          </div>
          <div className="overflow-y-auto max-h-[70vh] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0">Upprepning</span>
              <Select value={newTask.recurrence_rule || "__none"} onValueChange={(v) => {
                const rule = v === "__none" ? "" : v;
                setNewTask(p => ({
                  ...p,
                  recurrence_rule: rule,
                  recurrence_interval: 1,
                  recurrence_start: rule && !p.recurrence_start ? localDateStr(new Date(getSimulatedNow())) : p.recurrence_start,
                }));
              }}>
                <SelectTrigger className="flex-1 h-8 text-xs border-border/60">
                  <SelectValue placeholder="Ingen (engångsgift)" />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value || "__none"} value={o.value || "__none"}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newTask.recurrence_rule === "custom" && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Var</span>
                <input type="number" min={1} max={365} value={newTask.recurrence_interval}
                  onChange={(e) => setNewTask(p => ({ ...p, recurrence_interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center" />
                <span className="text-[11px] text-muted-foreground">dag(ar)</span>
              </div>
            )}
            {(newTask.recurrence_rule === "weekly" || newTask.recurrence_rule === "biweekly") && (
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted-foreground">Veckodagar</span>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((day, idx) => (
                    <button key={idx} type="button"
                      className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                        newTask.recurrence_days.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                      onClick={() => {
                        const days = newTask.recurrence_days.includes(idx) ? newTask.recurrence_days.filter(d => d !== idx) : [...newTask.recurrence_days, idx];
                        setNewTask(p => ({ ...p, recurrence_days: days }));
                      }}>{day}</button>
                  ))}
                </div>
              </div>
            )}
            {newTask.recurrence_rule === "monthly" && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Dag i månaden</span>
                <input type="number" min={1} max={31} value={newTask.recurrence_month_day}
                  onChange={(e) => setNewTask(p => ({ ...p, recurrence_month_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) }))}
                  className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center" />
              </div>
            )}
            {newTask.recurrence_rule === "quarterly" && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Månader per kvartal</p>
                <div className="space-y-1">
                  {QUARTER_MONTHS.map(({ q, months }) => (
                    <div key={q} className="flex items-center gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground w-6">{q}</span>
                      {months.map(m => (
                        <button key={m} type="button"
                          className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                            newTask.recurrence_months.includes(m) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                          onClick={() => {
                            const ms = newTask.recurrence_months.includes(m) ? newTask.recurrence_months.filter(x => x !== m) : [...newTask.recurrence_months, m];
                            setNewTask(p => ({ ...p, recurrence_months: ms }));
                          }}>{MONTHS_SV[m]}</button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Dag i månaden</span>
                  <input type="number" min={1} max={31} value={newTask.recurrence_month_day}
                    onChange={(e) => setNewTask(p => ({ ...p, recurrence_month_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) }))}
                    className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center" />
                </div>
              </div>
            )}
            {newTask.recurrence_rule && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-10">Start</span>
                  <Input type="date" value={newTask.recurrence_start}
                    onChange={(e) => setNewTask(p => ({ ...p, recurrence_start: e.target.value }))}
                    className="flex-1 h-7 text-xs" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-10">Slut</span>
                  <Input type="date" value={newTask.recurrence_end}
                    onChange={(e) => setNewTask(p => ({ ...p, recurrence_end: e.target.value }))}
                    className="flex-1 h-7 text-xs" />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
            <button type="button" onClick={() => setShowRecurrenceSetup(false)}
              className="rounded-full border border-border/60 px-4 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
              Avbryt
            </button>
            <Button size="sm" className="rounded-full text-xs" onClick={() => {
              setShowRecurrenceSetup(false);
              setShowCreate(true);
            }}>
              Fortsätt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              {saveError && (
                <span className="text-xs text-destructive max-w-[120px] sm:max-w-none truncate sm:truncate-none">{saveError}</span>
              )}
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
                    >
                      <div
                        className="drag-handle shrink-0 cursor-grab active:cursor-grabbing touch-none"
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          dragStepRef.current = { idx: i, startY: e.clientY, currentY: e.clientY };
                        }}
                        onPointerMove={(e) => {
                          if (!dragStepRef.current || dragStepRef.current.idx !== i) return;
                          dragStepRef.current.currentY = e.clientY;
                        }}
                        onPointerUp={() => {
                          if (!dragStepRef.current || dragStepRef.current.idx !== i) return;
                          const delta = dragStepRef.current.currentY - dragStepRef.current.startY;
                          dragStepRef.current = null;
                          const itemHeight = 44;
                          const steps = delta > 0 ? Math.floor(delta / itemHeight) : Math.ceil(delta / itemHeight);
                          if (steps === 0) return;
                          const to = Math.max(0, Math.min(newTask.steps.length - 1, i + steps));
                          if (to === i) return;
                          setNewTask(p => {
                            const arr = [...p.steps];
                            const [moved] = arr.splice(i, 1);
                            arr.splice(to, 0, moved);
                            return { ...p, steps: arr };
                          });
                        }}
                      >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30" />
                      </div>
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
                      <Input
                        placeholder="URL (valfri)"
                        value={step.link_url ?? ""}
                        onChange={(e) => setNewTask(p => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, link_url: e.target.value } : s) }))}
                        onBlur={(e) => { const v = ensureHttps(e.target.value); if (v !== (step.link_url ?? "")) setNewTask(p => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, link_url: v } : s) })); }}
                        className="w-28 border-0 bg-transparent p-0 h-auto text-xs shadow-none focus-visible:ring-0 text-primary placeholder:text-muted-foreground/40"
                      />
                      {step.link_url && (
                        <a href={step.link_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-primary hover:text-primary/70">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
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
                  onClick={() => setNewTask(p => ({ ...p, steps: [...p.steps, { label: "", requires_photo: false, link_url: "" }] }))}
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
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="drag-handle shrink-0 cursor-grab active:cursor-grabbing touch-none"
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            dragQuestionRef.current = { idx: i, startY: e.clientY, currentY: e.clientY };
                          }}
                          onPointerMove={(e) => {
                            if (!dragQuestionRef.current || dragQuestionRef.current.idx !== i) return;
                            dragQuestionRef.current.currentY = e.clientY;
                          }}
                          onPointerUp={() => {
                            if (!dragQuestionRef.current || dragQuestionRef.current.idx !== i) return;
                            const delta = dragQuestionRef.current.currentY - dragQuestionRef.current.startY;
                            dragQuestionRef.current = null;
                            const itemHeight = 90;
                            const steps = delta > 0 ? Math.floor(delta / itemHeight) : Math.ceil(delta / itemHeight);
                            if (steps === 0) return;
                            const to = Math.max(0, Math.min(newTask.questions.length - 1, i + steps));
                            if (to === i) return;
                            setNewTask(p => {
                              const arr = [...p.questions];
                              const [moved] = arr.splice(i, 1);
                              arr.splice(to, 0, moved);
                              return { ...p, questions: arr };
                            });
                          }}
                        >
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30" />
                        </div>
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
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                        <Input
                          placeholder="URL (valfri länk)"
                          value={q.link_url ?? ""}
                          onChange={(e) => setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, link_url: e.target.value } : qr) }))}
                          onBlur={(e) => { const v = ensureHttps(e.target.value); if (v !== (q.link_url ?? "")) setNewTask(p => ({ ...p, questions: p.questions.map((qr, idx) => idx === i ? { ...qr, link_url: v } : qr) })); }}
                          className="flex-1 border-0 bg-transparent p-0 h-auto text-xs shadow-none focus-visible:ring-0 text-primary placeholder:text-muted-foreground/40"
                        />
                        {q.link_url && (
                          <a href={q.link_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/70">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  onClick={() => setNewTask(p => ({ ...p, questions: [...p.questions, { label: "", question_type: "text", is_required: false, link_url: "" }] }))}
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

            {/* PROPERTIES sidebar — hidden on mobile step 1, visible on mobile step 2, always visible on desktop */}
            <div className={cn("w-full sm:w-72 shrink-0 overflow-y-auto border-t sm:border-t-0 sm:border-l border-border/60 bg-muted/30", createStep === 1 && "hidden sm:block")}>

              {/* Property rows */}
              <div className="divide-y divide-border/50">

                {/* Kategori */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">Kategori</span>
                  <Select value={newTask.category} onValueChange={(v) => setNewTask(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...new Set(["Drift", "Säkerhet", "Kundärenden", "Övrigt", ...templates.map(t => t.category).filter(Boolean)])].sort().map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
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

                {/* Förfallodatum — hidden when recurrence is set (start date drives the first occurrence) */}
                {!newTask.recurrence_rule && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">Förfallodatum</span>
                    <input
                      type="date"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask(p => ({ ...p, due_date: e.target.value }))}
                      className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                </div>
                )}

                {/* Förfallotid / Tidsluckor */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60 opacity-0" />
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    {newTask.time_slots.length > 0 ? (
                      <>
                        <span className="text-xs text-muted-foreground">Tidsluckor (förfallotider)</span>
                        <div className="flex flex-wrap gap-1">
                          {newTask.time_slots.map((slot, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {slot}
                              <button type="button" onClick={() => setNewTask(p => ({ ...p, time_slots: p.time_slots.filter((_, idx) => idx !== i) }))}><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <input
                            type="time"
                            value={timeSlotInput}
                            onChange={(e) => setTimeSlotInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && timeSlotInput) {
                                e.preventDefault();
                                const { value, error } = parseTimeInput(timeSlotInput);
                                if (!error) { setNewTask(p => ({ ...p, time_slots: [...p.time_slots, value] })); setTimeSlotInput(""); }
                              }
                            }}
                            className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                          <button
                            type="button"
                            className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                            onClick={() => {
                              if (!timeSlotInput) return;
                              const { value, error } = parseTimeInput(timeSlotInput);
                              if (!error) { setNewTask(p => ({ ...p, time_slots: [...p.time_slots, value] })); setTimeSlotInput(""); }
                            }}
                          >Lägg till</button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">En uppgift skapas per tidslucka</p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Förfallotid</span>
                          <button
                            type="button"
                            className="rounded-full border border-dashed border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                            onClick={() => setNewTask(p => ({ ...p, time_slots: p.due_date_time ? [p.due_date_time] : [""], due_date_time: "" }))}
                          >+ Fler tidsluckor</button>
                        </div>
                        <input
                          type="time"
                          value={newTask.due_date_time}
                          onChange={(e) => setNewTask(p => ({ ...p, due_date_time: e.target.value }))}
                          className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* SAP artikel-ID */}
                <div className="px-4 py-3 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="text-xs text-muted-foreground shrink-0">
                      {taskArticleType === "ean" ? "EAN" : taskArticleType === "bnr" ? "BNR" : "Materialnummer"}
                    </span>
                    <div className="flex flex-1 items-center gap-1 min-w-0">
                      <input
                        value={newTask.sap_article_id}
                        onChange={(e) => setNewTask(p => ({ ...p, sap_article_id: e.target.value.replace(/\D/g, "") }))}
                        onBlur={(e) => { if (e.target.value.trim()) setTaskArticlePrompt(e.target.value.trim()); }}
                        placeholder={taskArticleType === "ean" ? "t.ex. 7310865003294" : "t.ex. 1047133"}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className="min-w-0 flex-1 border-0 bg-transparent text-right text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none overflow-hidden"
                      />
                      <select
                        value={taskArticleType}
                        onChange={(e) => setTaskArticleType(e.target.value as ArticleIdType)}
                        className="border-0 bg-transparent text-[10px] text-muted-foreground outline-none cursor-pointer shrink-0"
                      >
                        <option value="mat-nr">Mat-nr</option>
                        <option value="ean">EAN</option>
                        <option value="bnr">BNR</option>
                      </select>
                      {newTask.sap_article_id && (
                        <button type="button" onClick={() => setNewTask(p => ({ ...p, sap_article_id: "" }))} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 hover:text-destructive shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {newTask.sap_article_id && (() => {
                    const url = taskArticleType === "mat-nr"
                      ? (mittCoopUrl(newTask.sap_article_id, activeStore?.sap_site_id ?? null) ?? `https://mittcoop.coop.se/sortiment/articles/${newTask.sap_article_id.trim()}`)
                      : mittCoopSearchUrl(newTask.sap_article_id, activeStore?.sap_site_id ?? null);
                    return url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Öppna i Mitt Coop-sortiment
                      </a>
                    ) : null;
                  })()}
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
                        recurrence_interval: 1,
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
                  {newTask.recurrence_rule === "custom" && (
                    <div className="flex items-center gap-2 pl-7">
                      <span className="text-[11px] text-muted-foreground">Var</span>
                      <input
                        type="number" min={1} max={365}
                        value={newTask.recurrence_interval}
                        onChange={(e) => setNewTask(p => ({ ...p, recurrence_interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                        className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center"
                      />
                      <span className="text-[11px] text-muted-foreground">dag(ar)</span>
                    </div>
                  )}
                  {(newTask.recurrence_rule === "weekly" || newTask.recurrence_rule === "biweekly") && (
                    <div className="pl-7 space-y-1.5">
                      <div className="flex flex-wrap gap-1">
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
                      {newTask.recurrence_rule === "biweekly" && (
                        <p className="text-[11px] text-muted-foreground">Upprepas varannan vecka på valda dagar.</p>
                      )}
                    </div>
                  )}
                  {newTask.recurrence_rule === "monthly" && (
                    <div className="flex items-center gap-2 pl-7">
                      <span className="text-[11px] text-muted-foreground">Dag i månaden</span>
                      <input
                        type="number" min={1} max={31}
                        value={newTask.recurrence_month_day}
                        onChange={(e) => setNewTask(p => ({ ...p, recurrence_month_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) }))}
                        className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center"
                      />
                    </div>
                  )}
                  {newTask.recurrence_rule === "quarterly" && (
                    <div className="pl-7 space-y-1.5">
                      <p className="text-[11px] text-muted-foreground">Välj månader per kvartal</p>
                      <div className="space-y-1">
                        {QUARTER_MONTHS.map(({ q, months }) => (
                          <div key={q} className="flex items-center gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground w-6">{q}</span>
                            {months.map(m => (
                              <button key={m} type="button"
                                className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                                  newTask.recurrence_months.includes(m) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                                onClick={() => {
                                  const ms = newTask.recurrence_months.includes(m) ? newTask.recurrence_months.filter(x => x !== m) : [...newTask.recurrence_months, m];
                                  setNewTask(p => ({ ...p, recurrence_months: ms }));
                                }}>
                                {MONTHS_SV[m]}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Dag i månaden</span>
                        <input
                          type="number" min={1} max={31}
                          value={newTask.recurrence_month_day}
                          onChange={(e) => setNewTask(p => ({ ...p, recurrence_month_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) }))}
                          className="w-14 h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-center"
                        />
                      </div>
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
                {(deleteTarget.recurrence_rule || deleteTarget.parent_task_id) && deleteHasFuture
                  ? "Denna uppgift är återkommande. Vad vill du ta bort?"
                  : `Är du säker på att du vill ta bort "${deleteTarget.title}"?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {(deleteTarget.recurrence_rule || deleteTarget.parent_task_id) && deleteHasFuture ? (
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

      {/* BULK DELETE TASKS */}
      <AlertDialog open={bulkDeleteTasksOpen} onOpenChange={setBulkDeleteTasksOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort {selectedTaskIds.size} uppgifter</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkDeleteHasFuture
                ? "Urvalet innehåller återkommande uppgifter. Hur ska de raderas?"
                : "Är du säker? Alla markerade uppgifter, steg, bilder och svar raderas permanent."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkDeleteHasFuture ? (
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <button
                className="w-full rounded-lg border-2 border-destructive/60 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors text-left"
                onClick={() => bulkDeleteTasks("single")}
              >
                <span className="font-semibold">Bara dessa förekomster</span>
                <p className="text-xs text-destructive/70 mt-0.5">Tar bara bort de markerade förekomsterna</p>
              </button>
              <button
                className="w-full rounded-lg border-2 border-destructive bg-destructive/15 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/25 transition-colors text-left"
                onClick={() => bulkDeleteTasks("future")}
              >
                <span className="font-semibold">Dessa och alla framtida</span>
                <p className="text-xs text-destructive/70 mt-0.5">Tar bort markerade och alla kommande upprepningar</p>
              </button>
              <AlertDialogCancel className="w-full">Avbryt</AlertDialogCancel>
            </AlertDialogFooter>
          ) : (
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => bulkDeleteTasks("single")}>
                Ta bort alla
              </AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>

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
                {(editTask.recurrence_rule || editTask.parent_task_id) ? (
                  <>
                    <Button size="sm" variant="outline" className="rounded-full gap-1.5 text-xs border-green-500/60 text-green-700 hover:bg-green-50" onClick={() => { setEditScope("single"); void saveEdit(); }} disabled={editSaving || !editForm.title.trim()}>
                      {editSaving && editScope === "single" ? "Sparar..." : "Redigera endast denna"}
                    </Button>
                    <Button size="sm" className="rounded-full gap-1.5 bg-green-600 text-white hover:bg-green-700 text-xs" onClick={() => { setEditScope("all_future"); void saveEdit(); }} disabled={editSaving || !editForm.title.trim()}>
                      {editSaving && editScope === "all_future" ? "Sparar..." : "Ändra alla framtida"}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="rounded-full gap-1.5 bg-green-600 text-white hover:bg-green-700 text-xs" onClick={saveEdit} disabled={editSaving || !editForm.title.trim()}>
                    {editSaving ? "Sparar..." : "Spara"}
                  </Button>
                )}
              </div>
            </div>
            {/* Recurring edit warning banner */}
            {(editTask.recurrence_rule || editTask.parent_task_id) && (
              <div className="mx-4 mt-2 mb-0 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-warning-foreground">Återkommande uppgift</p>
                  <p className="text-[11px] text-warning-foreground/80 mt-0.5">Forandringar av en upprepande uppgift forändrar alla framtida också. Välj "Redigera endast denna" för att bara påverka denna förekomst.</p>
                </div>
              </div>
            )}
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
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30 cursor-grab active:cursor-grabbing touch-none"
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          dragStepRef.current = { idx: i, startY: e.clientY, currentY: e.clientY };
                        }}
                        onPointerMove={(e) => {
                          if (!dragStepRef.current || dragStepRef.current.idx !== i) return;
                          dragStepRef.current.currentY = e.clientY;
                        }}
                        onPointerUp={(e) => {
                          if (!dragStepRef.current || dragStepRef.current.idx !== i) return;
                          const delta = dragStepRef.current.currentY - dragStepRef.current.startY;
                          dragStepRef.current = null;
                          const itemHeight = 44;
                          const steps = delta > 0 ? Math.floor(delta / itemHeight) : Math.ceil(delta / itemHeight);
                          if (steps === 0) return;
                          const to = Math.max(0, Math.min(editForm.steps.length - 1, i + steps));
                          if (to === i) return;
                          setEditForm(p => {
                            if (!p) return p;
                            const arr = [...p.steps];
                            const [moved] = arr.splice(i, 1);
                            arr.splice(to, 0, moved);
                            return { ...p, steps: arr };
                          });
                        }}
                      />
                      <Input placeholder={`Checkpoint ${i+1}`} value={step.label} onChange={(e) => setEditForm(p => p ? { ...p, steps: p.steps.map((s,idx) => idx===i ? {...s,label:e.target.value} : s) } : p)} className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0" />
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground/70 whitespace-nowrap cursor-pointer">
                        <Checkbox checked={step.requires_photo} onCheckedChange={(v) => setEditForm(p => p ? { ...p, steps: p.steps.map((s,idx) => idx===i ? {...s,requires_photo:!!v} : s) } : p)} className="h-3 w-3" />Foto
                      </label>
                      <Input placeholder="URL" value={step.link_url ?? ""} onChange={(e) => setEditForm(p => p ? { ...p, steps: p.steps.map((s,idx) => idx===i ? {...s,link_url:e.target.value} : s) } : p)} onBlur={(e) => { const v = ensureHttps(e.target.value); if (v !== (step.link_url ?? "")) setEditForm(p => p ? { ...p, steps: p.steps.map((s,idx) => idx===i ? {...s,link_url:v} : s) } : p); }} className="w-24 border-0 bg-transparent p-0 h-auto text-xs shadow-none focus-visible:ring-0 text-primary placeholder:text-muted-foreground/40" />
                      {step.link_url && (
                        <a href={step.link_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-primary hover:text-primary/70">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button type="button" className="opacity-0 group-hover:opacity-100" onClick={() => setEditForm(p => p ? { ...p, steps: p.steps.filter((_,idx) => idx!==i) } : p)}>
                        <X className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary" onClick={() => setEditForm(p => p ? { ...p, steps: [...p.steps, { label:"", requires_photo:false, link_url:"" }] } : p)}>
                    <Plus className="h-3.5 w-3.5" /> Lägg till checkpoint
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frågor</p>
                  {editForm.questions.map((q, i) => (
                    <div key={i} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30 cursor-grab active:cursor-grabbing touch-none"
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            dragQuestionRef.current = { idx: i, startY: e.clientY, currentY: e.clientY };
                          }}
                          onPointerMove={(e) => {
                            if (!dragQuestionRef.current || dragQuestionRef.current.idx !== i) return;
                            dragQuestionRef.current.currentY = e.clientY;
                          }}
                          onPointerUp={(e) => {
                            if (!dragQuestionRef.current || dragQuestionRef.current.idx !== i) return;
                            const delta = dragQuestionRef.current.currentY - dragQuestionRef.current.startY;
                            dragQuestionRef.current = null;
                            const itemHeight = 90;
                            const steps = delta > 0 ? Math.floor(delta / itemHeight) : Math.ceil(delta / itemHeight);
                            if (steps === 0) return;
                            const to = Math.max(0, Math.min(editForm.questions.length - 1, i + steps));
                            if (to === i) return;
                            setEditForm(p => {
                              if (!p) return p;
                              const arr = [...p.questions];
                              const [moved] = arr.splice(i, 1);
                              arr.splice(to, 0, moved);
                              return { ...p, questions: arr };
                            });
                          }}
                        />
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
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                        <Input placeholder="URL (valfri länk)" value={q.link_url ?? ""} onChange={(e) => setEditForm(p => p ? { ...p, questions: p.questions.map((qr,idx) => idx===i ? {...qr,link_url:e.target.value} : qr) } : p)} onBlur={(e) => { const v = ensureHttps(e.target.value); if (v !== (q.link_url ?? "")) setEditForm(p => p ? { ...p, questions: p.questions.map((qr,idx) => idx===i ? {...qr,link_url:v} : qr) } : p); }} className="flex-1 border-0 bg-transparent p-0 h-auto text-xs shadow-none focus-visible:ring-0 text-primary placeholder:text-muted-foreground/40" />
                        {q.link_url && (
                          <a href={q.link_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/70">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary" onClick={() => setEditForm(p => p ? { ...p, questions: [...p.questions, { label:"", question_type:"text", is_required:false, link_url:"" }] } : p)}>
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
                      <input
                        type="date"
                        value={editForm.due_date ? editForm.due_date.slice(0, 10) : ""}
                        onChange={(e) => setEditForm(p => p ? { ...p, due_date: e.target.value + (p.due_date?.slice(10) || "T00:00") } : p)}
                        className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                      <span className="text-xs text-muted-foreground mt-1">Tid</span>
                      <input
                        type="time"
                        value={editForm.due_date?.length >= 16 ? editForm.due_date.slice(11, 16) : ""}
                        onChange={(e) => setEditForm(p => p ? { ...p, due_date: (p.due_date?.slice(0, 10) || "") + "T" + e.target.value } : p)}
                        className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
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
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Repeat className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">Återkommande</span>
                    <span className="flex-1 text-right text-xs text-muted-foreground">
                      {editForm.recurrence_rule
                        ? (RECURRENCE_OPTIONS.find(o => o.value === editForm.recurrence_rule)?.label ?? editForm.recurrence_rule)
                        : "Ingen"}
                    </span>
                  </div>
                  {editForm.recurrence_rule && (
                    <div className="px-4 py-2 pl-11 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-12">Slut</span>
                        <Input type="date" value={editForm.recurrence_end} onChange={(e) => setEditForm(p => p ? { ...p, recurrence_end: e.target.value } : p)} className="flex-1 h-7 text-xs" />
                      </div>
                    </div>
                  )}
                  {/* Future occurrences manager button — only for recurring parent tasks (not child occurrences) */}
                  {editTask.recurrence_rule && !editTask.parent_task_id && isManager && (
                    <div className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-lg text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
                        onClick={() => void openFutureManager(editTask)}
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                        Hantera framtida förekomster
                      </Button>
                    </div>
                  )}
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

      {/* FUTURE OCCURRENCES MANAGER DIALOG */}
      {showFutureManager && futureManagerTask && (
        <Dialog open onOpenChange={(o) => { if (!o) { setShowFutureManager(false); setSelectedFutureIds(new Set()); } }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm font-semibold">Framtida förekomster</DialogTitle>
                <p className="text-[11px] text-muted-foreground truncate">{futureManagerTask.title}</p>
              </div>
              <button
                onClick={() => { setShowFutureManager(false); setSelectedFutureIds(new Set()); }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 transition-colors"
                aria-label="Stäng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Bulk action bar when items selected */}
            {selectedFutureIds.size > 0 && (
              <div className="border-b border-border/60 bg-primary/5 px-4 py-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-primary">{selectedFutureIds.size} förekomster markerade</span>
                  <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs rounded-full" onClick={() => setSelectedFutureIds(new Set())}>Avmarkera</Button>
                </div>
                {selectedFutureIds.size > 1 && (
                  <p className="text-[11px] text-muted-foreground">Flera valda: kan bara redigera innehåll och ansvariga (inte datum/tid)</p>
                )}
                <Textarea
                  placeholder="Ny beskrivning (valfri)..."
                  value={futureBulkContent}
                  onChange={(e) => setFutureBulkContent(e.target.value)}
                  rows={2}
                  className="resize-none text-xs"
                />
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground font-medium">Ansvariga</p>
                  <AssigneePicker
                    users={storeUsers}
                    groups={groups}
                    selectedUserIds={futureBulkAssigneeUserIds}
                    selectedGroupIds={futureBulkAssigneeGroupIds}
                    onToggleUser={(uid) => setFutureBulkAssigneeUserIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])}
                    onToggleGroup={(gid) => setFutureBulkAssigneeGroupIds(prev => prev.includes(gid) ? prev.filter(id => id !== gid) : [...prev, gid])}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-full text-xs flex-1" onClick={() => void applyBulkFutureEdit()}>
                    Spara ändringar för {selectedFutureIds.size} förekomster
                  </Button>
                  <Button size="sm" variant="destructive" className="rounded-full text-xs" onClick={() => void bulkDeleteFutureOccs()}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {futureOccLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse bg-muted" />)}
                </div>
              ) : futureOccurrences.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Inga framtida förekomster hittades</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">{futureOccurrences.length} kommande förekomster</p>
                    <button
                      className="text-[11px] text-primary hover:underline"
                      onClick={() => {
                        if (selectedFutureIds.size === futureOccurrences.length) setSelectedFutureIds(new Set());
                        else setSelectedFutureIds(new Set(futureOccurrences.map(o => o.id)));
                      }}
                    >
                      {selectedFutureIds.size === futureOccurrences.length ? "Avmarkera alla" : "Markera alla"}
                    </button>
                  </div>
                  {futureOccurrences.map(occ => (
                    <div key={occ.id} className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                      selectedFutureIds.has(occ.id) ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"
                    )}>
                      <Checkbox
                        checked={selectedFutureIds.has(occ.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedFutureIds);
                          if (checked) next.add(occ.id); else next.delete(occ.id);
                          setSelectedFutureIds(next);
                        }}
                        className="h-4 w-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{occ.title}</p>
                        {occ.due_date && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(occ.due_date).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                            {occ.recurrence_period_start && (
                              <span className="text-muted-foreground/60">({occ.recurrence_period_start.slice(0, 10)})</span>
                            )}
                          </p>
                        )}
                      </div>
                      {selectedFutureIds.size === 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={() => { void openEdit(occ); setShowFutureManager(false); }}
                          >
                            <Pencil className="h-3 w-3" /> Redigera
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[10px] font-medium text-success hover:bg-success/20 transition-colors"
                            onClick={() => void markFutureOccDone(occ)}
                          >
                            <CheckCircle2 className="h-3 w-3" /> Klar
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
                            onClick={() => void deleteFutureOcc(occ)}
                          >
                            <Trash2 className="h-3 w-3" /> Ta bort
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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

      {/* Article type disambiguation */}
      <AlertDialog open={!!taskArticlePrompt} onOpenChange={(o) => { if (!o) setTaskArticlePrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vad är <span className="font-mono">{taskArticlePrompt}</span>?</AlertDialogTitle>
            <AlertDialogDescription>Välj vilken typ av nummer — det avgör länken till Mitt Coop-sortiment.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            {(["mat-nr", "ean", "bnr"] as ArticleIdType[]).map((t) => (
              <AlertDialogAction key={t} onClick={() => { setTaskArticleType(t); setTaskArticlePrompt(null); }}>
                {t === "mat-nr" ? "Materialnummer" : t === "ean" ? "EAN-streckkod" : "BNR (Beställningsnr)"}
              </AlertDialogAction>
            ))}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
