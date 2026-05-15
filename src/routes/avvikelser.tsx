import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  TriangleAlert as AlertTriangle, Clock, MessageSquare, Paperclip,
  Plus, Search, Send, Store, X,
} from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, type Incident, type IncidentComment, type Store as StoreType, logAudit, createNotification } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/avvikelser")({
  component: IssuesPage,
});

function priorityClass(p: string) {
  switch (p) {
    case "Kritisk": return "bg-destructive/10 text-destructive";
    case "Hög": return "bg-warning/20 text-warning-foreground";
    case "Medel": return "bg-info/15 text-info";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusBadge(s: string) {
  if (s === "escalated") return <Badge className="bg-destructive/10 text-destructive">Eskalerad</Badge>;
  if (s === "in_progress") return <Badge className="bg-info/15 text-info">Pågår</Badge>;
  if (s === "resolved") return <Badge className="bg-success/15 text-success">Löst</Badge>;
  if (s === "closed") return <Badge variant="secondary">Stängt</Badge>;
  return <Badge variant="secondary">Ny</Badge>;
}

type IncidentWithStore = Incident & { store?: StoreType; comments?: IncidentComment[] };

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "escalated", "resolved"],
  in_progress: ["escalated", "resolved"],
  escalated: ["in_progress", "resolved"],
  resolved: ["closed"],
  closed: [],
};

const STATUS_LABELS: Record<string, string> = {
  open: "Ny", in_progress: "Pågår", escalated: "Eskalerad", resolved: "Löst", closed: "Stängt",
};

function IssuesPage() {
  const { user, activeStore, userStores } = useAuth();
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;

  const [incidents, setIncidents] = useState<IncidentWithStore[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<IncidentWithStore | null>(null);
  const [comments, setComments] = useState<(IncidentComment & { author?: { display_name: string } })[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [newIncident, setNewIncident] = useState({
    title: "",
    description: "",
    category: "Drift",
    store_id: activeStore?.id ?? "",
    priority: "Medel",
  });
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchIncidents = async () => {
    let q = supabase.from("incidents").select("*, store:stores(*)").order("created_at", { ascending: false });
    if (activeStore) {
      q = q.eq("store_id", activeStore.id);
    } else if (userStores.length > 0) {
      q = q.in("store_id", userStores.map((s) => s.id));
    }
    const { data } = await q;
    if (data) setIncidents(data as IncidentWithStore[]);
    setLoading(false);
  };

  const fetchComments = async (incidentId: string) => {
    const { data } = await supabase
      .from("incident_comments")
      .select("*, author:app_users(display_name)")
      .eq("incident_id", incidentId)
      .order("created_at");
    if (data) setComments(data as (IncidentComment & { author?: { display_name: string } })[]);
  };

  useEffect(() => {
    fetchIncidents();
    const storeQ = isAdmin
      ? supabase.from("stores").select("*").eq("is_active", true)
      : supabase.from("stores").select("*").in("id", userStores.map(s => s.id));
    storeQ.then(({ data }) => { if (data) setStores(data); });
    setNewIncident(p => ({ ...p, store_id: activeStore?.id ?? "" }));
  }, [activeStore, user]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("incidents-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => fetchIncidents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore]);

  const createIncident = async () => {
    if (!newIncident.title.trim()) return;
    setSaving(true);
    const { data: inc } = await supabase.from("incidents").insert({
      title: newIncident.title.trim(),
      description: newIncident.description.trim(),
      category: newIncident.category,
      store_id: newIncident.store_id || null,
      priority: newIncident.priority,
      reported_by: user?.id,
      status: "open",
    }).select().maybeSingle();

    if (inc) {
      logAudit(user?.id ?? null, "incident.create", "incidents", inc.id, { title: inc.title });
      // Notify managers
      if (user?.role === "employee") {
        const { data: managers } = await supabase
          .from("app_users")
          .select("id")
          .in("role", ["admin", "manager"])
          .eq("is_active", true);
        (managers ?? []).forEach((m: { id: string }) => {
          createNotification(m.id, "incident_new", `Ny avvikelse: ${inc.title}`, "", "/avvikelser");
        });
      }
      await fetchIncidents();
    }
    setSaving(false);
    setShowCreate(false);
    setNewIncident({ title: "", description: "", category: "Drift", store_id: activeStore?.id ?? "", priority: "Medel" });
  };

  const updateStatus = async (id: string, newStatus: string) => {
    await supabase.from("incidents").update({ status: newStatus, ...(newStatus === "resolved" ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", id);
    logAudit(user?.id ?? null, "incident.status", "incidents", id, { status: newStatus });
    await fetchIncidents();
    if (showDetail?.id === id) {
      setShowDetail((p) => p ? { ...p, status: newStatus as Incident["status"] } : null);
    }
  };

  const sendComment = async () => {
    if (!newComment.trim() || !showDetail || !user) return;
    setSendingComment(true);
    await supabase.from("incident_comments").insert({
      incident_id: showDetail.id,
      author_id: user.id,
      content: newComment.trim(),
    });
    logAudit(user.id, "incident.comment", "incidents", showDetail.id, {});
    setNewComment("");
    await fetchComments(showDetail.id);
    setSendingComment(false);
  };

  const openDetail = async (inc: IncidentWithStore) => {
    setShowDetail(inc);
    await fetchComments(inc.id);
  };

  const visible = incidents.filter((i) => {
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterPriority !== "all" && i.priority !== filterPriority) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase()) && !i.ref_number?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const open = incidents.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length;
  const escalated = incidents.filter((i) => i.status === "escalated").length;
  const resolved = incidents.filter((i) => i.status === "resolved").length;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Avvikelser"
        description="Rapportera och följ upp ärenden i butiken."
        actions={
          <Button className="rounded-full" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Ny avvikelse
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Öppna" value={open} tone="destructive" />
        <StatCard label="Eskalerade" value={escalated} tone="warning" />
        <StatCard label="Lösta" value={resolved} tone="success" />
        <StatCard label="Totalt" value={incidents.length} tone="default" />
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Sök avvikelser..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-full pl-9 text-sm w-52" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-40 rounded-full text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla statusar</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-9 w-36 rounded-full text-sm"><SelectValue placeholder="Prioritet" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla prioriteter</SelectItem>
            {["Låg", "Medel", "Hög", "Kritisk"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Inga avvikelser hittades</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground">Avvikelse</th>
                <th className="hidden px-5 py-3.5 text-left text-xs font-medium text-muted-foreground md:table-cell">Butik</th>
                <th className="hidden px-5 py-3.5 text-left text-xs font-medium text-muted-foreground sm:table-cell">Prioritet</th>
                <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Status</th>
                <th className="hidden px-5 py-3.5 text-left text-xs font-medium text-muted-foreground lg:table-cell">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {visible.map((inc) => (
                <tr key={inc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openDetail(inc)}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", inc.priority === "Kritisk" ? "bg-destructive" : inc.priority === "Hög" ? "bg-warning-foreground" : inc.priority === "Medel" ? "bg-info" : "bg-muted-foreground")} />
                      <div>
                        <p className="font-medium">{inc.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">{inc.ref_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-5 py-3.5 text-muted-foreground md:table-cell">
                    {inc.store ? (
                      <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" />{inc.store.name}</span>
                    ) : "—"}
                  </td>
                  <td className="hidden px-5 py-3.5 sm:table-cell">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", priorityClass(inc.priority))}>{inc.priority}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">{statusBadge(inc.status)}</td>
                  <td className="hidden px-5 py-3.5 text-xs text-muted-foreground lg:table-cell">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(inc.created_at).toLocaleDateString("sv-SE")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE DIALOG */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ny avvikelse</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Titel *</Label>
              <Input placeholder="Kortfattad beskrivning" value={newIncident.title}
                onChange={(e) => setNewIncident(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivning</Label>
              <Textarea placeholder="Beskriv avvikelsen..." value={newIncident.description}
                onChange={(e) => setNewIncident(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={newIncident.category} onValueChange={(v) => setNewIncident(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Drift", "Säkerhet", "Kundärende", "Skada", "Stöld", "Övrigt"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioritet</Label>
                <Select value={newIncident.priority} onValueChange={(v) => setNewIncident(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Låg", "Medel", "Hög", "Kritisk"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Butik</Label>
              <Select value={newIncident.store_id} onValueChange={(v) => setNewIncident(p => ({ ...p, store_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Välj butik" /></SelectTrigger>
                <SelectContent>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Avbryt</Button>
            <Button onClick={createIncident} disabled={saving || !newIncident.title}>{saving ? "Sparar..." : "Skapa avvikelse"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG */}
      <Dialog open={!!showDetail} onOpenChange={(o) => !o && setShowDetail(null)}>
        {showDetail && (
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between gap-2 pr-6">
                <div>
                  <DialogTitle className="text-base">{showDetail.title}</DialogTitle>
                  <p className="font-mono text-xs text-muted-foreground">{showDetail.ref_number}</p>
                </div>
                {statusBadge(showDetail.status)}
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Meta */}
              <div className="flex flex-wrap gap-2">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", priorityClass(showDetail.priority))}>{showDetail.priority}</span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{showDetail.category}</span>
                {showDetail.store && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Store className="h-3.5 w-3.5" />{showDetail.store.name}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />{new Date(showDetail.created_at).toLocaleDateString("sv-SE")}
                </span>
              </div>

              {showDetail.description && (
                <p className="text-sm text-muted-foreground">{showDetail.description}</p>
              )}

              {/* Status actions */}
              {isManager && STATUS_TRANSITIONS[showDetail.status]?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <p className="w-full text-xs font-medium text-muted-foreground">Ändra status:</p>
                  {STATUS_TRANSITIONS[showDetail.status].map((s) => (
                    <Button key={s} size="sm" variant="outline" className="rounded-full text-xs"
                      onClick={() => updateStatus(showDetail.id, s)}>
                      → {STATUS_LABELS[s]}
                    </Button>
                  ))}
                </div>
              )}

              {/* Comments */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Kommentarer ({comments.length})</span>
                </div>
                {comments.length > 0 && (
                  <div className="mb-3 max-h-48 overflow-y-auto space-y-2 rounded-lg border border-border/60 p-3">
                    {comments.map((c) => (
                      <div key={c.id} className={cn("rounded-xl p-3 text-sm", c.author_id === user?.id ? "ml-6 bg-primary-soft" : "mr-6 bg-muted/50")}>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">{c.author?.display_name ?? "Okänd"}</p>
                        <p>{c.content}</p>
                        <p className="mt-1 text-xs text-muted-foreground/60">{new Date(c.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input placeholder="Skriv en kommentar..." value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                    className="rounded-full text-sm" />
                  <Button size="icon" className="shrink-0 rounded-full" onClick={sendComment} disabled={!newComment.trim() || sendingComment}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
