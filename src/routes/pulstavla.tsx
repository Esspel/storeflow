import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle2,
  Clock,
  Search,
  Tv as Tv2,
  Users,
  TrendingUp,
  Star,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pulstavla")({
  ssr: false,
  component: PulstavlaPage,
});

type LiveTask = {
  id: string;
  title: string;
  category: string;
  status: "todo" | "progress" | "done" | "late" | "cancelled";
  due_date: string | null;
  due_time?: string | null;
  assigneeLabel: string;
};

type LiveIncident = {
  id: string;
  ref_number: string;
  title: string;
  priority: string;
  status: string;
  category: string;
  created_at: string;
};

type PulstavlaData = {
  storeName: string;
  upshopUrl: string | null;
  tasks: LiveTask[];
  incidents: LiveIncident[];
  lastUpdated: Date;
};

// ── helpers ────────────────────────────────────────────────────────────────────

function getDeadlineMs(task: LiveTask): number {
  if (!task.due_date) return Infinity;
  // due_date is a full ISO timestamp — use it directly for the deadline
  // If due_date has no time component (rare legacy), fall back to end-of-day
  const ts = new Date(task.due_date).getTime();
  return isNaN(ts) ? Infinity : ts;
}

function useCountdown(targetMs: number): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = targetMs - Date.now();
      if (targetMs === Infinity) { setLabel("—"); return; }
      if (diff <= 0) { setLabel("Försenad"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (h >= 24) { setLabel(`${Math.floor(h / 24)}d ${h % 24}h`); return; }
      if (h > 0) { setLabel(`${h}h ${m}m`); return; }
      setLabel(`${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return label;
}

// ── Animated carousel panel ────────────────────────────────────────────────────
const PAGE_SIZE = 6;

function TaskCarousel({ tasks }: { tasks: LiveTask[] }) {
  const [page, setPage] = useState(0);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef(0);
  pageRef.current = page;
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));

  const goTo = useCallback((next: number, dir: "left" | "right") => {
    setAnimDir(dir);
    setVisible(false);
    timerRef.current = setTimeout(() => {
      setPage(next);
      setVisible(true);
      setAnimDir(null);
    }, 320);
  }, []);

  useEffect(() => {
    if (totalPages <= 1) return;
    const id = setInterval(() => {
      const next = (pageRef.current + 1) % totalPages;
      goTo(next, "left");
    }, 8000);
    return () => clearInterval(id);
  }, [totalPages, goTo]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const slice = tasks.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col h-full">
      <div
        className={cn(
          "flex-1 divide-y divide-gray-700/40 overflow-hidden transition-all duration-300",
          visible ? "opacity-100 translate-x-0" : animDir === "left" ? "opacity-0 -translate-x-4" : "opacity-0 translate-x-4",
        )}
        style={{ transitionProperty: "opacity, transform" }}
      >
        {slice.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500/40" />
            <p className="text-sm text-gray-500">Inga uppgifter för idag</p>
          </div>
        ) : (
          slice.map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-700/40 px-4 py-2">
          <button
            onClick={() => goTo((page - 1 + totalPages) % totalPages, "right")}
            className="rounded-lg p-1 text-gray-500 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === page ? "w-4 bg-emerald-500" : "w-1.5 bg-gray-600",
                )}
              />
            ))}
          </div>
          <button
            onClick={() => goTo((page + 1) % totalPages, "left")}
            className="rounded-lg p-1 text-gray-500 hover:text-white transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: LiveTask }) {
  const deadlineMs = getDeadlineMs(task);
  const countdown = useCountdown(task.status === "done" ? Infinity : deadlineMs);
  const isOverdue = task.status !== "done" && deadlineMs < Date.now();
  const isUrgent = !isOverdue && task.status !== "done" && deadlineMs - Date.now() < 3_600_000;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        isOverdue && "bg-red-950/30",
      )}
    >
      <div
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          task.status === "done"
            ? "bg-emerald-500"
            : isOverdue
            ? "bg-red-500 animate-pulse"
            : task.status === "progress"
            ? "bg-amber-400"
            : isUrgent
            ? "bg-orange-400"
            : "bg-gray-500",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium leading-tight",
            task.status === "done" ? "text-gray-500 line-through" : "text-white",
          )}
        >
          {task.title}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-gray-500 mt-0.5">
          <Users className="h-3 w-3 shrink-0" />
          {task.assigneeLabel}
          {task.category && <span className="text-gray-600"> · {task.category}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {task.status === "done" ? (
          <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
            Klar
          </span>
        ) : (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold tabular-nums",
              isOverdue
                ? "bg-red-900/60 text-red-400"
                : isUrgent
                ? "bg-orange-900/50 text-orange-400"
                : "bg-gray-700/60 text-gray-300",
            )}
          >
            {countdown}
          </span>
        )}
        {task.due_time && task.status !== "done" && (
          <p className="mt-0.5 text-[10px] text-gray-600">
            {task.due_time.slice(0, 5)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Incident carousel ──────────────────────────────────────────────────────────
const INC_PAGE = 5;

function IncidentCarousel({ incidents }: { incidents: LiveIncident[] }) {
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState(true);
  const totalPages = Math.max(1, Math.ceil(incidents.length / INC_PAGE));

  useEffect(() => {
    if (totalPages <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPage((p) => (p + 1) % totalPages);
        setVisible(true);
      }, 300);
    }, 9000);
    return () => clearInterval(id);
  }, [totalPages]);

  const slice = incidents.slice(page * INC_PAGE, page * INC_PAGE + INC_PAGE);

  return (
    <div className="flex flex-col h-full">
      <div
        className={cn(
          "flex-1 divide-y divide-gray-700/40 overflow-hidden transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {slice.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500/40" />
            <p className="text-sm text-gray-500">Inga öppna avvikelser</p>
          </div>
        ) : (
          slice.map((inc) => (
            <div key={inc.id} className="flex items-center gap-3 px-4 py-3">
              <div
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  inc.priority === "Kritisk"
                    ? "bg-red-500 animate-pulse"
                    : inc.priority === "Hög"
                    ? "bg-orange-400"
                    : inc.priority === "Medel"
                    ? "bg-amber-400"
                    : "bg-gray-500",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{inc.title}</p>
                <p className="truncate text-xs text-gray-500">
                  {inc.ref_number} · {inc.category}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  inc.priority === "Kritisk"
                    ? "bg-red-900/50 text-red-400"
                    : inc.priority === "Hög"
                    ? "bg-orange-900/50 text-orange-400"
                    : "bg-amber-900/50 text-amber-400",
                )}
              >
                {inc.priority}
              </span>
            </div>
          ))
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 border-t border-gray-700/40 py-2">
          {Array.from({ length: totalPages }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === page ? "w-4 bg-amber-400" : "w-1.5 bg-gray-600",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Score badge ────────────────────────────────────────────────────────────────
function StorePulse({ tasks, incidents }: { tasks: LiveTask[]; incidents: LiveIncident[] }) {
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const overdue = tasks.filter(
    (t) => t.status !== "done" && getDeadlineMs(t) < Date.now(),
  ).length;
  const critical = incidents.filter((i) => i.priority === "Kritisk").length;

  const score = total === 0
    ? 100
    : Math.max(0, Math.round(((done / total) * 100) - overdue * 8 - critical * 10));

  const color =
    score >= 80 ? "text-emerald-400" :
    score >= 50 ? "text-amber-400" :
    "text-red-400";

  const label =
    score >= 80 ? "Bra läge" :
    score >= 50 ? "Håll koll" :
    "Kräver åtgärd";

  return (
    <div className="rounded-2xl bg-gray-800/60 p-4 flex flex-col justify-between">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="h-3.5 w-3.5 text-gray-400" />
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Butikspuls</p>
      </div>
      <p className={cn("text-4xl font-bold tabular-nums", color)}>{score}</p>
      <p className={cn("text-xs font-medium mt-0.5", color)}>{label}</p>
    </div>
  );
}

// ── Ticker (completed tasks) ───────────────────────────────────────────────────
const MOTIVATIONAL = [
  "Bra jobbat team!",
  "Fortsätt så!",
  "Ni är grymma!",
  "Toppen insats!",
  "Keep it up!",
];

function CompletedTicker({ tasks }: { tasks: LiveTask[] }) {
  const done = tasks.filter((t) => t.status === "done");
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  const items = done.length > 0
    ? done.map((t) => `Klart: ${t.title} (${t.assigneeLabel})`)
    : MOTIVATIONAL;

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % items.length);
        setFade(true);
      }, 400);
    }, 4000);
    return () => clearInterval(id);
  }, [items.length]);

  return (
    <div className="flex items-center gap-2 rounded-xl bg-emerald-950/40 border border-emerald-900/40 px-4 py-2 overflow-hidden">
      <Star className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <p
        className={cn(
          "text-xs text-emerald-300 truncate transition-opacity duration-400",
          fade ? "opacity-100" : "opacity-0",
        )}
      >
        {items[idx % items.length]}
      </p>
    </div>
  );
}

// ── Live board ─────────────────────────────────────────────────────────────────
function LiveBoard({ storeId }: { storeId: string }) {
  const [data, setData] = useState<PulstavlaData | null>(null);
  const [time, setTime] = useState(new Date());

  const fetchData = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Use full ISO timestamps so the timestamptz column comparison works correctly
    const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString();
    const endOfToday = new Date(today.getTime() + 86400000).toISOString();

    const [{ data: storeRow }, { data: rawTasks }, { data: incidents }] =
      await Promise.all([
        supabase.from("stores").select("name,upshop_url").eq("id", storeId).maybeSingle(),
        supabase
          .from("tasks")
          .select("id,title,category,status,due_date,due_date_time,assigned_to,assignee:app_users!assigned_to(display_name)")
          .eq("store_id", storeId)
          .in("status", ["todo", "progress", "late", "done"])
          .gte("due_date", sevenDaysAgo)
          .lt("due_date", endOfToday)
          .order("due_date", { ascending: true })
          .limit(60),
        supabase
          .from("incidents")
          .select("id,ref_number,title,priority,status,category,created_at")
          .eq("store_id", storeId)
          .in("status", ["open", "in_progress", "escalated"])
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

    // Build assignee map from task_assignees (fetch separately once we have task ids)
    const taskIds = (rawTasks ?? []).map((t: { id: string }) => t.id);
    const assigneeMap: Record<string, string[]> = {};

    if (taskIds.length > 0) {
      const { data: assignees } = await supabase
        .from("task_assignees")
        .select("task_id, user:app_users(display_name), group:user_groups(name)")
        .in("task_id", taskIds);

      for (const row of assignees ?? []) {
        const r = row as unknown as {
          task_id: string;
          user: { display_name: string } | null;
          group: { name: string } | null;
        };
        if (!assigneeMap[r.task_id]) assigneeMap[r.task_id] = [];
        const name = r.user?.display_name ?? r.group?.name ?? null;
        if (name) assigneeMap[r.task_id].push(name);
      }
    }

    const tasks: LiveTask[] = ((rawTasks ?? []) as unknown as {
      id: string;
      title: string;
      category: string;
      status: "todo" | "progress" | "done" | "late" | "cancelled";
      due_date: string | null;
      due_date_time?: string | null;
      assignee?: { display_name: string } | null;
    }[]).map((t) => {
      const names = assigneeMap[t.id] ?? [];
      // Fall back to direct assignee field if no task_assignees rows
      const fallback = t.assignee?.display_name;
      const assigneeLabel =
        names.length > 0
          ? names.length <= 2
            ? names.join(", ")
            : `${names.slice(0, 2).join(", ")} +${names.length - 2}`
          : fallback ?? "Alla";
      return {
        id: t.id,
        title: t.title,
        category: t.category,
        status: t.status,
        due_date: t.due_date,
        due_time: t.due_date_time ?? null,
        assigneeLabel,
      };
    });

    // Sort: overdue first (by deadline asc), then future by deadline asc, done last
    tasks.sort((a, b) => {
      const aDone = a.status === "done";
      const bDone = b.status === "done";
      if (aDone !== bDone) return aDone ? 1 : -1;
      return getDeadlineMs(a) - getDeadlineMs(b);
    });

    setData({
      storeName: storeRow?.name ?? "Butik",
      upshopUrl: (storeRow as { upshop_url?: string | null } | null)?.upshop_url ?? null,
      tasks,
      incidents: (incidents ?? []) as LiveIncident[],
      lastUpdated: new Date(),
    });
  }, [storeId]);

  useEffect(() => {
    fetchData();
    const dataInterval = setInterval(fetchData, 30_000);
    const clockInterval = setInterval(() => setTime(new Date()), 1000);

    const ch = supabase
      .channel("pulstavla")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `store_id=eq.${storeId}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents", filter: `store_id=eq.${storeId}` }, fetchData)
      .subscribe();

    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
      supabase.removeChannel(ch);
    };
  }, [storeId, fetchData]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const done = data.tasks.filter((t) => t.status === "done").length;
  const total = data.tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue = data.tasks.filter(
    (t) => t.status !== "done" && getDeadlineMs(t) < Date.now(),
  ).length;

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 p-4 text-white select-none">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600">
            <Tv2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">{data.storeName}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <p className="text-[11px] text-gray-500">Live · uppdateras var 30s</p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums text-white leading-tight">
            {time.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-gray-400 capitalize">
            {time.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <div className="rounded-2xl bg-gray-800/60 p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Uppgifter</p>
          <p className="mt-0.5 text-3xl font-bold text-white tabular-nums">{total}</p>
          <p className="text-[11px] text-gray-500">{done} klara</p>
        </div>
        <div className="rounded-2xl bg-gray-800/60 p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Framsteg</p>
          <p className="mt-0.5 text-3xl font-bold text-emerald-400 tabular-nums">{pct}%</p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-700">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className={cn("rounded-2xl p-3.5", overdue > 0 ? "bg-red-900/40" : "bg-gray-800/60")}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Försenade</p>
          <p className={cn("mt-0.5 text-3xl font-bold tabular-nums", overdue > 0 ? "text-red-400" : "text-white")}>{overdue}</p>
          <p className="text-[11px] text-gray-500">
            {overdue === 0 ? "Inga" : overdue === 1 ? "1 uppgift" : `${overdue} uppgifter`}
          </p>
        </div>
        <StorePulse tasks={data.tasks} incidents={data.incidents} />
      </div>

      {/* Ticker */}
      <div className="mb-3">
        <CompletedTicker tasks={data.tasks} />
      </div>

      {/* Main grid */}
      <div className={cn("grid flex-1 gap-3 overflow-hidden", data.upshopUrl ? "grid-cols-3" : "grid-cols-2")}>
        {/* Tasks carousel */}
        <div className="flex flex-col overflow-hidden rounded-2xl bg-gray-800/40">
          <div className="flex items-center justify-between border-b border-gray-700/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Uppgifter idag</span>
            </div>
            {total > 0 && (
              <span className="text-xs text-gray-500 tabular-nums">{done}/{total}</span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <TaskCarousel tasks={data.tasks} />
          </div>
        </div>

        {/* Incidents carousel */}
        <div className="flex flex-col overflow-hidden rounded-2xl bg-gray-800/40">
          <div className="flex items-center justify-between border-b border-gray-700/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">Öppna avvikelser</span>
            </div>
            {data.incidents.length > 0 && (
              <span className="text-xs text-gray-500 tabular-nums">{data.incidents.length}</span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <IncidentCarousel incidents={data.incidents} />
          </div>
        </div>

        {/* Upshop iframe — compact column */}
        {data.upshopUrl && (
          <div className="flex flex-col overflow-hidden rounded-2xl bg-gray-800/40">
            <div className="flex items-center gap-2 border-b border-gray-700/60 px-4 py-2.5">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">Upshop styrtavla</span>
            </div>
            <iframe
              src={data.upshopUrl}
              className="flex-1 w-full"
              style={{ border: "none", minHeight: 0 }}
              allow="fullscreen"
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-end">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-gray-700" />
          <p className="text-[11px] text-gray-700">
            {data.lastUpdated.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── PIN Gate ───────────────────────────────────────────────────────────────────
function PinGate({
  storeId,
  onUnlock,
}: {
  storeId: string;
  onUnlock: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [storeName, setStoreName] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    supabase.from("stores").select("name").eq("id", storeId).maybeSingle()
      .then(({ data }) => { if (data) setStoreName(data.name); });
  }, [storeId]);

  const checkPin = async (pin: string) => {
    setChecking(true);
    setError(false);
    const { data } = await supabase
      .from("pulstavla_pins")
      .select("pin_hash")
      .eq("store_id", storeId)
      .maybeSingle();
    setChecking(false);
    if (!data?.pin_hash) { setError(true); setDigits(["", "", "", ""]); return; }
    const { data: verified } = await supabase.rpc("verify_password", { plain_password: pin, hashed_password: data.pin_hash });
    if (verified) {
      onUnlock();
    } else {
      setError(true);
      setDigits(["", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  };

  const handleDigit = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[idx] = val;
    setDigits(next);
    setError(false);
    if (val && idx < 3) inputRefs.current[idx + 1]?.focus();
    if (next.every((d) => d !== "")) checkPin(next.join(""));
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-800">
          <Tv2 className="h-10 w-10 text-gray-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Pulstavla</h1>
          {storeName && <p className="mt-0.5 text-sm text-emerald-400 font-medium">{storeName}</p>}
          <p className="mt-1 text-sm text-gray-400">Ange PIN-koden för att låsa upp TV-vyn</p>
        </div>
        <div className="flex gap-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={d}
              autoFocus={i === 0}
              onChange={(e) => handleDigit(i, e.target.value.slice(-1))}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={cn(
                "h-16 w-14 rounded-xl border-2 bg-gray-800 text-center text-2xl font-bold text-white outline-none transition-all",
                error
                  ? "border-red-500 text-red-400"
                  : d
                  ? "border-emerald-500"
                  : "border-gray-600 focus:border-gray-400",
              )}
            />
          ))}
        </div>
        {error && <p className="text-sm font-medium text-red-400">Fel PIN-kod, försök igen</p>}
        {checking && <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />}
        <p className="text-xs text-gray-600">PIN-koden sätts av butikschefen under Inställningar</p>
      </div>
    </div>
  );
}

// ── Store selector ─────────────────────────────────────────────────────────────
function StoreSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("pulstavla_pins")
      .select("store_id, store:stores(id, name)")
      .then(({ data }) => {
        if (data) {
          const storeList = data
            .map((row) => (row.store as unknown as { id: string; name: string } | null))
            .filter((s): s is { id: string; name: string } => s !== null)
            .sort((a, b) => a.name.localeCompare(b.name, "sv"));
          setStores(storeList);
        }
        setLoading(false);
      });
  }, []);

  const filtered = stores.filter((s) =>
    (s.name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-800">
            <Tv2 className="h-8 w-8 text-gray-300" />
          </div>
          <h1 className="text-xl font-bold text-white">Pulstavla</h1>
          <p className="mt-1 text-sm text-gray-400">Välj en butik med aktiv PIN</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Sök butik..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-gray-500"
          />
        </div>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-gray-800/60 px-4 py-8 text-center">
            <p className="text-sm text-gray-400">
              {search ? "Ingen butik matchar sökningen" : "Inga butiker har aktiverat Pulstavla-PIN ännu"}
            </p>
            {!search && (
              <p className="mt-1 text-xs text-gray-600">En butikschef aktiverar PIN under Inställningar</p>
            )}
          </div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="flex w-full items-center justify-between rounded-xl bg-gray-800 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-gray-700 active:bg-gray-600"
              >
                <span>{s.name}</span>
                <span className="text-xs text-gray-500">PIN aktiv</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────
function PulstavlaPage() {
  const { loading: authLoading } = useAuth();

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(() => {
    try { return localStorage.getItem("sf-pulstavla-store"); } catch { return null; }
  });
  const [unlocked, setUnlocked] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!selectedStoreId) { setHasPin(null); return; }
    supabase.from("pulstavla_pins").select("id").eq("store_id", selectedStoreId).maybeSingle()
      .then(({ data }) => setHasPin(!!data));
  }, [selectedStoreId]);

  useEffect(() => { setUnlocked(false); }, [selectedStoreId]);

  const selectStore = (id: string) => {
    try { localStorage.setItem("sf-pulstavla-store", id); } catch {}
    setSelectedStoreId(id);
    setHasPin(null);
    setUnlocked(false);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!selectedStoreId) return <StoreSelector onSelect={selectStore} />;

  if (hasPin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!hasPin) {
    try { localStorage.removeItem("sf-pulstavla-store"); } catch {}
    return <StoreSelector onSelect={selectStore} />;
  }

  if (!unlocked) return <PinGate storeId={selectedStoreId} onUnlock={() => setUnlocked(true)} />;

  return <LiveBoard storeId={selectedStoreId} />;
}
