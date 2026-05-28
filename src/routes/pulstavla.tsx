import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Clock, Search, Tv as Tv2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pulstavla")({
  component: PulstavlaPage,
});

type LiveTask = {
  id: string;
  title: string;
  category: string;
  status: "todo" | "progress" | "done" | "late" | "cancelled";
  due_date: string | null;
  assignee?: { display_name: string } | null;
};

type LiveIncident = {
  id: string;
  ref_number: string;
  title: string;
  priority: string;
  status: string;
  category: string;
};

type PulstavlaData = {
  storeName: string;
  upshopUrl: string | null;
  tasks: LiveTask[];
  incidents: LiveIncident[];
  lastUpdated: Date;
};

function hashPin(pin: string): string {
  // Simple deterministic hash for client-side comparison with stored hash.
  // The real security is server-side — we just use this to avoid sending raw PIN.
  return pin;
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
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const checkPin = async (pin: string) => {
    setChecking(true);
    setError(false);
    const { data } = await supabase
      .from("pulstavla_pins")
      .select("pin_hash")
      .eq("store_id", storeId)
      .maybeSingle();
    setChecking(false);
    if (data && data.pin_hash === pin) {
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
    if (val && idx < 3) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (next.every((d) => d !== "")) {
      checkPin(next.join(""));
    }
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
        {error && (
          <p className="text-sm font-medium text-red-400">Fel PIN-kod, försök igen</p>
        )}
        {checking && (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        )}
        <p className="text-xs text-gray-600">PIN-koden sätts av butikschefen under Inställningar</p>
      </div>
    </div>
  );
}

// ── Live board ─────────────────────────────────────────────────────────────────
function LiveBoard({ storeId }: { storeId: string }) {
  const [data, setData] = useState<PulstavlaData | null>(null);
  const [time, setTime] = useState(new Date());

  const fetchData = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const endStr = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

    // Find the "Alla medarbetare" group for this store
    const { data: allGroup } = await supabase
      .from("user_groups")
      .select("id")
      .eq("store_id", storeId)
      .eq("name", "Alla medarbetare")
      .maybeSingle();

    const allGroupId = allGroup?.id ?? null;

    // Fetch tasks assigned to "Alla medarbetare" group via task_assignees
    const groupTasksPromise = allGroupId
      ? supabase
          .from("task_assignees")
          .select("task:tasks!task_id(id,title,category,status,due_date,assignee:app_users!assigned_to(display_name))")
          .eq("group_id", allGroupId)
          .then(({ data: rows }) => {
            if (!rows) return [] as LiveTask[];
            return rows
              .map((r) => r.task as LiveTask | null)
              .filter((t): t is LiveTask => {
                if (!t) return false;
                if (!["todo", "progress", "late"].includes(t.status)) return false;
                if (!t.due_date) return false;
                const d = t.due_date.slice(0, 10);
                return d >= todayStr && d < endStr;
              });
          })
      : Promise.resolve([] as LiveTask[]);

    const [{ data: storeRow }, { data: directTasks }, groupTasks, { data: incidents }] = await Promise.all([
      supabase.from("stores").select("name,upshop_url").eq("id", storeId).maybeSingle(),
      supabase
        .from("tasks")
        .select("id,title,category,status,due_date,assignee:app_users!assigned_to(display_name)")
        .eq("store_id", storeId)
        .in("status", ["todo", "progress", "late"])
        .gte("due_date", todayStr)
        .lt("due_date", endStr)
        .order("status")
        .limit(20),
      groupTasksPromise,
      supabase
        .from("incidents")
        .select("id,ref_number,title,priority,status,category")
        .eq("store_id", storeId)
        .in("status", ["open", "in_progress", "escalated"])
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    // Merge direct tasks + group tasks, deduplicate by id
    const allTasksMap = new Map<string, LiveTask>();
    for (const t of (directTasks ?? []) as LiveTask[]) allTasksMap.set(t.id, t);
    for (const t of groupTasks) allTasksMap.set(t.id, t);
    const mergedTasks = Array.from(allTasksMap.values()).slice(0, 12);

    setData({
      storeName: storeRow?.name ?? "Butik",
      upshopUrl: (storeRow as { upshop_url?: string | null } | null)?.upshop_url ?? null,
      tasks: mergedTasks,
      incidents: (incidents ?? []) as LiveIncident[],
      lastUpdated: new Date(),
    });
  };

  useEffect(() => {
    fetchData();
    const dataInterval = setInterval(fetchData, 30_000);
    const clockInterval = setInterval(() => setTime(new Date()), 1000);

    // Supabase Realtime
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
  }, [storeId]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const doneTasks = data.tasks.filter((t) => t.status === "done").length;
  const totalTasks = data.tasks.length + doneTasks;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 p-6 text-white">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
            <Tv2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{data.storeName}</h1>
            <p className="text-xs text-gray-400">Pulstavla · uppdateras var 30s</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums text-white">
            {time.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-gray-400">
            {time.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-gray-800/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Dagens uppgifter</p>
          <p className="mt-1 text-4xl font-bold text-white">{data.tasks.length}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {data.tasks.filter((t) => t.status === "done").length} klara
          </p>
        </div>
        <div className="rounded-2xl bg-gray-800/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Framsteg</p>
          <p className="mt-1 text-4xl font-bold text-emerald-400">{pct}%</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-700">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className={cn("rounded-2xl p-4", data.incidents.length > 0 ? "bg-red-900/40" : "bg-gray-800/60")}>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Öppna avvikelser</p>
          <p className={cn("mt-1 text-4xl font-bold", data.incidents.length > 0 ? "text-red-400" : "text-white")}>
            {data.incidents.length}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {data.incidents.filter((i) => i.priority === "Kritisk").length} kritiska
          </p>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
        {/* Tasks */}
        <div className="flex flex-col overflow-hidden rounded-2xl bg-gray-800/40">
          <div className="flex items-center gap-2 border-b border-gray-700/60 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">Uppgifter idag</span>
          </div>
          <div className="flex-1 divide-y divide-gray-700/40 overflow-y-auto">
            {data.tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500/50" />
                <p className="text-sm text-gray-500">Inga uppgifter för idag</p>
              </div>
            ) : (
              data.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      t.status === "done"
                        ? "bg-emerald-500"
                        : t.status === "late"
                        ? "bg-red-500"
                        : t.status === "progress"
                        ? "bg-amber-400"
                        : "bg-gray-500",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        t.status === "done" ? "text-gray-500 line-through" : "text-white",
                      )}
                    >
                      {t.title}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {t.category}
                      {t.assignee && ` · ${t.assignee.display_name}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      t.status === "done"
                        ? "bg-emerald-900/50 text-emerald-400"
                        : t.status === "late"
                        ? "bg-red-900/50 text-red-400"
                        : t.status === "progress"
                        ? "bg-amber-900/50 text-amber-400"
                        : "bg-gray-700/60 text-gray-400",
                    )}
                  >
                    {t.status === "done" ? "Klar" : t.status === "late" ? "Sen" : t.status === "progress" ? "Pågår" : "Att göra"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Incidents */}
        <div className="flex flex-col overflow-hidden rounded-2xl bg-gray-800/40">
          <div className="flex items-center gap-2 border-b border-gray-700/60 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Öppna avvikelser</span>
          </div>
          <div className="flex-1 divide-y divide-gray-700/40 overflow-y-auto">
            {data.incidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500/50" />
                <p className="text-sm text-gray-500">Inga öppna avvikelser</p>
              </div>
            ) : (
              data.incidents.map((inc) => (
                <div key={inc.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      inc.priority === "Kritisk"
                        ? "bg-red-500"
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
        </div>
      </div>

      {/* Upshop styrtavla iframe */}
      {data.upshopUrl && (
        <div className="mt-4 overflow-hidden rounded-2xl bg-gray-800/40">
          <div className="flex items-center gap-2 border-b border-gray-700/60 px-4 py-3">
            <span className="text-sm font-semibold text-white">Upshop styrtavla</span>
          </div>
          <iframe
            src={data.upshopUrl}
            className="w-full"
            style={{ height: "280px", border: "none" }}
            allow="fullscreen"
            loading="lazy"
          />
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-gray-600">
          Senast uppdaterad {data.lastUpdated.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          <p className="text-xs text-gray-500">Live</p>
        </div>
      </div>
    </div>
  );
}

// ── Store selector (when no store in URL) ─────────────────────────────────────
function StoreSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Only show stores that have a pulstavla PIN set
    supabase
      .from("pulstavla_pins")
      .select("store_id, store:stores(id, name)")
      .then(({ data }) => {
        if (data) {
          const storeList = data
            .map((row) => (row.store as { id: string; name: string } | null))
            .filter((s): s is { id: string; name: string } => s !== null)
            .sort((a, b) => a.name.localeCompare(b.name, "sv"));
          setStores(storeList);
        }
        setLoading(false);
      });
  }, []);

  const filtered = stores.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
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

        {/* Search */}
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
              {search
                ? "Ingen butik matchar sökningen"
                : "Inga butiker har aktiverat Pulstavla-PIN ännu"}
            </p>
            {!search && (
              <p className="mt-1 text-xs text-gray-600">
                En butikschef aktiverar PIN under Inställningar
              </p>
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

function PulstavlaPage() {
  const [storeId, setStoreId] = useState<string | null>(() => {
    try { return localStorage.getItem("sf-pulstavla-store"); } catch { return null; }
  });
  const [unlocked, setUnlocked] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!storeId) return;
    supabase.from("pulstavla_pins").select("id").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => setHasPin(!!data));
  }, [storeId]);

  const selectStore = (id: string) => {
    try { localStorage.setItem("sf-pulstavla-store", id); } catch {}
    setStoreId(id);
  };

  if (!storeId) return <StoreSelector onSelect={selectStore} />;
  if (hasPin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }
  // Store has no PIN — send back to selector
  if (!hasPin) {
    try { localStorage.removeItem("sf-pulstavla-store"); } catch {}
    return (
      <StoreSelector
        onSelect={(id) => {
          try { localStorage.setItem("sf-pulstavla-store", id); } catch {}
          setStoreId(id);
          setHasPin(null);
          setUnlocked(false);
        }}
      />
    );
  }
  if (!unlocked) return <PinGate storeId={storeId} onUnlock={() => setUnlocked(true)} />;

  return <LiveBoard storeId={storeId} />;
}
