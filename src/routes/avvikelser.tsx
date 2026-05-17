import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { TriangleAlert as AlertTriangle, Plus, Search, ListFilter as Filter, X, CreditCard as Edit2, MessageSquare, ChevronDown, Clock, User, CircleCheck as CheckCircle2, Circle as XCircle } from "lucide-react";
import { supabase, type Incident, getSessionToken } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, formatDate, formatDateTime, statusColor, statusLabel, priorityColor } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/avvikelser")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: AvvikelserPage,
});

const CATEGORIES = ["Produkt", "Service", "Säkerhet", "Utrustning", "Personal", "Hygienfråga", "Övrigt"];

function AvvikelserPage() {
  const { user, activeStore } = useAuth();
  const isMobile = useIsMobile();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alla");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);

  const load = useCallback(async () => {
    if (!activeStore) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("incidents")
      .select("*, app_users(display_name), stores(name)")
      .eq("store_id", activeStore.id)
      .order("created_at", { ascending: false });
    setIncidents((data ?? []) as Incident[]);
    setLoading(false);
  }, [activeStore]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = incidents;
    if (statusFilter !== "alla") list = list.filter(i => i.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.title.toLowerCase().includes(q) || i.ref_number?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
    }
    return list;
  }, [incidents, search, statusFilter]);

  async function resolveIncident(id: string) {
    await supabase.from("incidents").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
    toast.success("Avvikelse löst");
    load();
  }

  const STATUSES = ["alla", "open", "in_progress", "escalated", "resolved", "closed"];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Avvikelser</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeStore?.name}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          {isMobile ? "Rapportera" : "Rapportera avvikelse"}
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {s === "alla" ? "Alla" : statusLabel(s)}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Sök avvikelser..."
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse h-20" />
          ))
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center bg-card border border-border rounded-2xl">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Inga avvikelser hittades</p>
          </div>
        ) : (
          filtered.map(inc => (
            <div
              key={inc.id}
              onClick={() => setSelected(inc)}
              className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className={cn("w-5 h-5 mt-0.5 shrink-0",
                  inc.priority === "Kritisk" ? "text-destructive" :
                  inc.priority === "Hög" ? "text-orange-500" : "text-warning-foreground"
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <p className="text-sm font-medium text-foreground flex-1 truncate">{inc.title}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", priorityColor(inc.priority))}>
                        {inc.priority}
                      </span>
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", statusColor(inc.status))}>
                        {statusLabel(inc.status)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">{inc.ref_number}</span>
                    <span className="text-xs text-muted-foreground">{inc.category}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(inc.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <IncidentDialog
          activeStore={activeStore}
          userId={user?.id ?? ""}
          onClose={() => setShowCreate(false)}
          onSave={() => { setShowCreate(false); load(); }}
        />
      )}

      {selected && (
        <IncidentDetailDialog
          incident={selected}
          onClose={() => setSelected(null)}
          onResolve={() => { resolveIncident(selected.id); setSelected(null); }}
          onRefresh={load}
          isManager={user?.role === "manager" || user?.role === "admin"}
          userId={user?.id ?? ""}
        />
      )}
    </div>
  );
}

function IncidentDialog({ activeStore, userId, onClose, onSave }: {
  activeStore: { id: string } | null; userId: string; onClose: () => void; onSave: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Övrigt");
  const [priority, setPriority] = useState<Incident["priority"]>("Medel");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title || !activeStore) return;
    setSaving(true);
    try {
      const ref_number = `AV-${Date.now().toString().slice(-6)}`;
      await supabase.from("incidents").insert({
        title, category, priority, description,
        store_id: activeStore.id, reported_by: userId,
        status: "open", ref_number,
        sla_deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
      toast.success("Avvikelse rapporterad");
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
          <h2 className="font-semibold">Rapportera avvikelse</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titel *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Beskriv avvikelsen kortfattat" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prioritet</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Incident["priority"])} className={inputCls}>
                {["Låg", "Medel", "Hög", "Kritisk"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Beskrivning</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Beskriv vad som hände och eventuella åtgärder..." />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Avbryt</button>
            <button onClick={save} disabled={saving || !title} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
              {saving ? "Sparar..." : "Rapportera"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IncidentDetailDialog({ incident, onClose, onResolve, onRefresh, isManager, userId }: {
  incident: Incident; onClose: () => void; onResolve: () => void; onRefresh: () => void;
  isManager: boolean; userId: string;
}) {
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<{ id: string; content: string; created_at: string; app_users?: { display_name: string } }[]>([]);
  const [newStatus, setNewStatus] = useState(incident.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("incident_comments").select("*, app_users(display_name)").eq("incident_id", incident.id).order("created_at")
      .then(({ data }) => setComments(data ?? []));
  }, [incident.id]);

  async function addComment() {
    if (!comment.trim()) return;
    setSaving(true);
    await supabase.from("incident_comments").insert({ incident_id: incident.id, content: comment, author_id: userId });
    if (newStatus !== incident.status) {
      await supabase.from("incidents").update({ status: newStatus, ...(newStatus === "resolved" ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", incident.id);
    }
    setComment("");
    onRefresh();
    const { data } = await supabase.from("incident_comments").select("*, app_users(display_name)").eq("incident_id", incident.id).order("created_at");
    setComments(data ?? []);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold text-foreground">{incident.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{incident.ref_number} · {incident.category}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4" data-scroll-container>
          <div className="flex gap-2">
            <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", priorityColor(incident.priority))}>{incident.priority}</span>
            <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", statusColor(incident.status))}>{statusLabel(incident.status)}</span>
          </div>
          {incident.description && (
            <p className="text-sm text-foreground bg-muted/50 rounded-xl p-3">{incident.description}</p>
          )}
          <div className="space-y-2">
            {comments.map(c => (
              <div key={c.id} className="bg-muted/50 rounded-xl p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">{c.app_users?.display_name} · {formatDateTime(c.created_at)}</p>
                <p className="text-sm text-foreground">{c.content}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5 pt-3 border-t border-border space-y-3 shrink-0">
          {isManager && (
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as Incident["status"])}
              className="w-full h-9 px-3 rounded-xl border border-border bg-card text-sm focus:outline-none"
            >
              {["open", "in_progress", "escalated", "resolved", "closed"].map(s => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Lägg till kommentar..."
              onKeyDown={e => e.key === "Enter" && addComment()}
              className="flex-1 h-10 px-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={addComment} disabled={saving || !comment.trim()} className="px-3 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
              Skicka
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
