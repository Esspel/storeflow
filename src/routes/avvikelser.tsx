import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  TriangleAlert as AlertTriangle, Clock, Download, MessageSquare,
  Pencil, Plus, Search, Send, Store, Trash2, Users, X, User, Image as ImageIcon, ZoomIn,
  Hash, ExternalLink,
} from "lucide-react";
import { PhotoViewer } from "@/components/photo-viewer";

import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  supabase, type Incident, type IncidentComment, type IncidentImage,
  type Store as StoreType, type AppUser, type KundrundaCommonDefect, type UserGroup,
  logAudit, createNotification, notifyUsers,
  uploadAttachment, getPublicUrl, deleteStorageFiles, mittCoopUrl,
} from "@/lib/supabase";
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

type IncidentFull = Incident & {
  store?: StoreType;
  reporter?: AppUser;
  responsible?: AppUser;
  responsible_group?: UserGroup;
  images?: IncidentImage[];
};

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

// ── ResponsiblePicker ──────────────────────────────────────────────────────────
// Compact searchable dropdown for picking responsible person or group.
function ResponsiblePicker({
  users, groups, selectedUserId, selectedGroupId, onSelectUser, onSelectGroup,
}: {
  users: AppUser[];
  groups: UserGroup[];
  selectedUserId: string;
  selectedGroupId: string;
  onSelectUser: (id: string) => void;
  onSelectGroup: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const lq = q.toLowerCase();
  const filteredUsers = users.filter(u => u.display_name.toLowerCase().includes(lq));
  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(lq));

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök person eller grupp..."
          className="h-7 w-full rounded-lg border border-border/60 bg-background pl-7 pr-3 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
        />
      </div>
      <div className="max-h-36 overflow-y-auto rounded-lg border border-border/60 bg-background divide-y divide-border/40">
        <button
          type="button"
          className={cn("flex w-full items-center px-3 py-2 text-xs transition-colors hover:bg-muted/40", !selectedUserId && !selectedGroupId ? "bg-primary-soft text-primary font-medium" : "text-muted-foreground")}
          onClick={() => { onSelectUser(""); onSelectGroup(""); }}
        >
          Ingen
        </button>
        {filteredGroups.map(g => (
          <button key={g.id} type="button"
            className={cn("flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/40", selectedGroupId === g.id ? "bg-primary-soft text-primary font-medium" : "")}
            onClick={() => { onSelectGroup(g.id); onSelectUser(""); }}
          >
            <Users className="h-3 w-3 shrink-0 text-muted-foreground/70" />
            {g.name}
          </button>
        ))}
        {filteredUsers.map(u => (
          <button key={u.id} type="button"
            className={cn("flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/40", selectedUserId === u.id ? "bg-primary-soft text-primary font-medium" : "")}
            onClick={() => { onSelectUser(u.id); onSelectGroup(""); }}
          >
            <span className="h-4 w-4 shrink-0 inline-flex items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
              {u.display_name.charAt(0).toUpperCase()}
            </span>
            {u.display_name}
          </button>
        ))}
        {filteredGroups.length === 0 && filteredUsers.length === 0 && (
          <p className="px-3 py-3 text-center text-xs text-muted-foreground">Inga träffar</p>
        )}
      </div>
    </div>
  );
}

function IssuesPage() {
  const { user, activeStore, userStores } = useAuth();
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;

  const [incidents, setIncidents] = useState<IncidentFull[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [storeUsers, setStoreUsers] = useState<AppUser[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<IncidentFull | null>(null);
  const [comments, setComments] = useState<(IncidentComment & { author?: { display_name: string } })[]>([]);
  const [detailImages, setDetailImages] = useState<IncidentImage[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const INCIDENT_DRAFT_KEY = `sf-incident-draft-${user?.id ?? ""}`;
  const emptyIncident = () => ({ title: "", description: "", category: "Drift", store_id: activeStore?.id ?? "", priority: "Medel", responsible_user_id: "", responsible_group_id: "", sap_article_id: "" });
  const [newIncident, _setNewIncident] = useState(() => {
    try {
      const saved = localStorage.getItem(`sf-incident-draft-${user?.id ?? ""}`);
      if (saved) return JSON.parse(saved) as ReturnType<typeof emptyIncident>;
    } catch {}
    return emptyIncident();
  });
  const setNewIncident = (v: ReturnType<typeof emptyIncident> | ((p: ReturnType<typeof emptyIncident>) => ReturnType<typeof emptyIncident>)) => {
    _setNewIncident(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(INCIDENT_DRAFT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [saving, setSaving] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<IncidentFull | null>(null);
  const [editTarget, setEditTarget] = useState<IncidentFull | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", category: "", priority: "", responsible_user_id: "", responsible_group_id: "", sap_article_id: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [commonDefects, setCommonDefects] = useState<KundrundaCommonDefect[]>([]);
  const [createStep, setCreateStep] = useState<1 | 2>(1);

  const fetchIncidents = async () => {
    let q = supabase.from("incidents")
      .select("*, store:stores(*), reporter:app_users!reported_by(id,display_name,username), responsible:app_users!responsible_user_id(id,display_name,username), responsible_group:user_groups!responsible_group_id(id,name,store_id,created_at), images:incident_images(*)")
      .order("created_at", { ascending: false });
    if (activeStore) {
      q = q.eq("store_id", activeStore.id);
    } else if (userStores.length > 0) {
      q = q.in("store_id", userStores.map((s) => s.id));
    }
    const { data } = await q;
    if (data) setIncidents(data as IncidentFull[]);
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

  const fetchDetailImages = async (incidentId: string) => {
    const { data } = await supabase
      .from("incident_images")
      .select("*")
      .eq("incident_id", incidentId)
      .order("created_at");
    if (data) setDetailImages(data as IncidentImage[]);
  };

  useEffect(() => {
    setLoading(true);
    fetchIncidents();
    const storeQ = isAdmin
      ? supabase.from("stores").select("*").eq("is_active", true)
      : supabase.from("stores").select("*").in("id", userStores.map(s => s.id));
    storeQ.then(({ data }) => { if (data) setStores(data); });

    // Load users for assignment
    if (activeStore) {
      supabase.from("user_stores").select("user:app_users(*)").eq("store_id", activeStore.id)
        .then(({ data }) => {
          if (data) setStoreUsers((data as { user: AppUser }[]).map(d => d.user).filter(Boolean));
        });
      supabase.from("user_groups").select("*").eq("store_id", activeStore.id).order("name")
        .then(({ data }) => { if (data) setGroups(data as UserGroup[]); });
    } else {
      supabase.from("app_users").select("*").eq("is_active", true)
        .then(({ data }) => { if (data) setStoreUsers(data as AppUser[]); });
      supabase.from("user_groups").select("*").order("name")
        .then(({ data }) => { if (data) setGroups(data as UserGroup[]); });
    }

    setNewIncident(p => ({ ...p, store_id: activeStore?.id ?? "" }));

    // Load common defects for quick-select suggestions
    supabase.from("kundrunda_common_defects")
      .select("*, defect_checkpoints:kundrunda_defect_checkpoints(checkpoint_id)")
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          setCommonDefects((data as (KundrundaCommonDefect & { defect_checkpoints: { checkpoint_id: string }[] })[]).map(d => ({
            ...d,
            checkpoint_ids: d.defect_checkpoints?.map(dc => dc.checkpoint_id) ?? [],
          })));
        }
      });
  }, [activeStore, user]);

  const createIncident = async () => {
    if (!newIncident.title.trim()) return;
    if (!newIncident.description.trim()) return;
    setSaving(true);
    const { data: inc } = await supabase.from("incidents").insert({
      title: newIncident.title.trim(),
      description: newIncident.description.trim(),
      category: newIncident.category,
      store_id: newIncident.store_id || null,
      priority: newIncident.priority,
      reported_by: user?.id,
      responsible_user_id: newIncident.responsible_user_id || null,
      responsible_group_id: newIncident.responsible_group_id || null,
      sap_article_id: newIncident.sap_article_id?.trim() || null,
      status: "open",
    }).select().maybeSingle();

    if (inc) {
      // Upload images
      if (uploadFiles.length > 0) {
        for (const file of uploadFiles) {
          const path = await uploadAttachment(file, `incidents/${inc.id}`);
          if (path) {
            await supabase.from("incident_images").insert({ incident_id: inc.id, storage_path: path, uploaded_by: user?.id });
          }
        }
      }

      logAudit(user?.id ?? null, "incident.create", "incidents", inc.id, { title: inc.title });

      // Notify responsible user
      if (newIncident.responsible_user_id && newIncident.responsible_user_id !== user?.id) {
        createNotification(newIncident.responsible_user_id, "incident_assigned", `Ny avvikelse tilldelad: ${inc.title}`, `Tilldelad av ${user?.display_name}`, "/avvikelser");
      }

      // Notify managers
      const notifyIds = new Set<string>();
      const { data: managers } = await supabase
        .from("app_users")
        .select("id")
        .in("role", ["admin", "manager"])
        .eq("is_active", true);
      managers?.forEach((m: { id: string }) => { if (m.id !== user?.id) notifyIds.add(m.id); });
      notifyUsers([...notifyIds], "incident_new", `Ny avvikelse: ${inc.title}`, `Rapporterad av ${user?.display_name}`, "/avvikelser");

      await fetchIncidents();
    }
    setSaving(false);
    setShowCreate(false);
    setUploadFiles([]);
    try { localStorage.removeItem(INCIDENT_DRAFT_KEY); } catch {}
    setNewIncident(emptyIncident());
  };

  const updateStatus = async (id: string, newStatus: string) => {
    await supabase.from("incidents").update({ status: newStatus, ...(newStatus === "resolved" ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", id);
    logAudit(user?.id ?? null, "incident.status", "incidents", id, { status: newStatus });

    // Notify reporter and responsible
    const inc = incidents.find(i => i.id === id);
    if (inc) {
      const notifyIds = new Set<string>();
      if (inc.reported_by && inc.reported_by !== user?.id) notifyIds.add(inc.reported_by);
      if (inc.responsible_user_id && inc.responsible_user_id !== user?.id) notifyIds.add(inc.responsible_user_id);
      notifyUsers([...notifyIds], "incident_status", `Avvikelse uppdaterad: ${inc.title}`, `Status: ${STATUS_LABELS[newStatus]}`, "/avvikelser");
    }

    await fetchIncidents();
    if (showDetail?.id === id) {
      setShowDetail((p) => p ? { ...p, status: newStatus as Incident["status"] } : null);
    }
  };

  const assignResponsible = async (incId: string, userId: string) => {
    await supabase.from("incidents").update({ responsible_user_id: userId || null }).eq("id", incId);
    if (userId && userId !== user?.id) {
      const inc = incidents.find(i => i.id === incId);
      createNotification(userId, "incident_assigned", `Du är nu ansvarig för: ${inc?.title ?? "avvikelse"}`, `Tilldelad av ${user?.display_name}`, "/avvikelser");
    }
    await fetchIncidents();
    if (showDetail?.id === incId) {
      const responsible = storeUsers.find(u => u.id === userId);
      setShowDetail(p => p ? { ...p, responsible_user_id: userId || null, responsible: responsible ?? undefined } : null);
    }
  };

  const assignGroup = async (incId: string, groupId: string) => {
    await supabase.from("incidents").update({ responsible_group_id: groupId || null }).eq("id", incId);
    await fetchIncidents();
    if (showDetail?.id === incId) {
      const grp = groups.find(g => g.id === groupId);
      setShowDetail(p => p ? { ...p, responsible_group_id: groupId || null, responsible_group: grp ?? undefined } : null);
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

  const openDetail = async (inc: IncidentFull) => {
    setShowDetail(inc);
    await Promise.all([fetchComments(inc.id), fetchDetailImages(inc.id)]);
  };

  const deleteIncident = async () => {
    if (!deleteTarget) return;
    await supabase.from("incident_comments").delete().eq("incident_id", deleteTarget.id);
    await supabase.from("incident_images").delete().eq("incident_id", deleteTarget.id);
    await supabase.from("incidents").delete().eq("id", deleteTarget.id);
    logAudit(user?.id ?? null, "incident.delete", "incidents", deleteTarget.id, { title: deleteTarget.title });
    if (showDetail?.id === deleteTarget.id) setShowDetail(null);
    setDeleteTarget(null);
    await fetchIncidents();
  };

  const openEditIncident = (inc: IncidentFull) => {
    setEditTarget(inc);
    setEditForm({
      title: inc.title,
      description: inc.description ?? "",
      category: inc.category,
      priority: inc.priority,
      responsible_user_id: inc.responsible_user_id ?? "",
      responsible_group_id: inc.responsible_group_id ?? "",
      sap_article_id: inc.sap_article_id ?? "",
    });
  };

  const saveEditIncident = async () => {
    if (!editTarget || !editForm.title.trim()) return;
    setEditSaving(true);
    await supabase.from("incidents").update({
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      category: editForm.category,
      priority: editForm.priority,
      responsible_user_id: editForm.responsible_user_id || null,
      responsible_group_id: editForm.responsible_group_id || null,
      sap_article_id: editForm.sap_article_id?.trim() || null,
    }).eq("id", editTarget.id);
    logAudit(user?.id ?? null, "incident.edit", "incidents", editTarget.id, { title: editForm.title });
    setEditSaving(false);
    if (showDetail?.id === editTarget.id) {
      const responsible = storeUsers.find(u => u.id === editForm.responsible_user_id);
      setShowDetail(p => p ? { ...p, title: editForm.title.trim(), description: editForm.description.trim(), category: editForm.category, priority: editForm.priority, responsible_user_id: editForm.responsible_user_id || null, responsible: responsible ?? undefined, sap_article_id: editForm.sap_article_id?.trim() || null } : null);
    }
    setEditTarget(null);
    await fetchIncidents();
  };

  const visible = incidents.filter((i) => {
    if (filterStatus === "active" && ["resolved", "closed"].includes(i.status)) return false;
    if (filterStatus !== "all" && filterStatus !== "active" && i.status !== filterStatus) return false;
    if (filterPriority !== "all" && i.priority !== filterPriority) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase()) && !i.ref_number?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const open = incidents.filter((i) => ["open", "in_progress", "escalated"].includes(i.status)).length;
  const escalated = incidents.filter((i) => i.status === "escalated").length;
  const resolved = incidents.filter((i) => i.status === "resolved").length;

  const exportCSV = () => {
    const rows = [
      ["Ref", "Titel", "Beskrivning", "Kategori", "Prioritet", "Status", "Butik", "Rapporterad av", "Ansvarig", "SLA", "Löst datum", "Skapad"],
      ...incidents.map((i) => [
        i.ref_number,
        i.title,
        i.description ?? "",
        i.category,
        i.priority,
        STATUS_LABELS[i.status] ?? i.status,
        i.store?.name ?? "",
        i.reporter?.display_name ?? "",
        i.responsible?.display_name ?? "",
        i.sla_deadline ? new Date(i.sla_deadline).toLocaleDateString("sv-SE") : "",
        i.resolved_at ? new Date(i.resolved_at).toLocaleDateString("sv-SE") : "",
        new Date(i.created_at).toLocaleDateString("sv-SE"),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `avvikelser-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Avvikelser"
        description={activeStore ? `Avvikelser för ${activeStore.name}` : "Rapportera och följ upp ärenden."}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full hidden lg:flex" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" /> Exportera CSV
            </Button>
            <Button className="rounded-full hidden lg:flex" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Ny avvikelse
            </Button>
          </div>
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
            <SelectItem value="active">Aktiva</SelectItem>
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
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex items-center gap-4 border-b border-border/40 px-5 py-4 last:border-0">
              <div className="h-4 w-4 animate-pulse rounded-full bg-muted/60 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-1/3 animate-pulse rounded-md bg-muted/60" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted/60 shrink-0" />
            </div>
          ))}
        </div>
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
                <th className="hidden px-5 py-3.5 text-left text-xs font-medium text-muted-foreground lg:table-cell">Ansvarig</th>
                <th className="hidden px-5 py-3.5 text-left text-xs font-medium text-muted-foreground sm:table-cell">Prioritet</th>
                <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Status</th>
                <th className="hidden px-5 py-3.5 text-left text-xs font-medium text-muted-foreground lg:table-cell">Datum</th>
                {isManager && <th className="px-3 py-3.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {visible.map((inc) => (
                <tr key={inc.id} className="group cursor-pointer hover:bg-muted/30" onClick={() => openDetail(inc)}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", inc.priority === "Kritisk" ? "bg-destructive" : inc.priority === "Hög" ? "bg-warning-foreground" : inc.priority === "Medel" ? "bg-info" : "bg-muted-foreground")} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">{inc.title}</p>
                          {inc.source === "kundrunda" && (
                            <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">Kundrunda</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{inc.ref_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-5 py-3.5 text-muted-foreground md:table-cell">
                    {inc.store ? (
                      <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" />{inc.store.name}</span>
                    ) : "—"}
                  </td>
                  <td className="hidden px-5 py-3.5 text-xs text-muted-foreground lg:table-cell">
                    {inc.responsible ? (
                      <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{inc.responsible.display_name}</span>
                    ) : inc.responsible_group ? (
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{inc.responsible_group.name}</span>
                    ) : "—"}
                  </td>
                  <td className="hidden px-5 py-3.5 sm:table-cell">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", priorityClass(inc.priority))}>{inc.priority}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">{statusBadge(inc.status)}</td>
                  <td className="hidden px-5 py-3.5 text-xs text-muted-foreground lg:table-cell">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(inc.created_at).toLocaleDateString("sv-SE")}</span>
                  </td>
                  {isManager && (
                    <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-primary" onClick={() => openEditIncident(inc)} aria-label="Redigera"><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={() => setDeleteTarget(inc)} aria-label="Ta bort"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile FAB — thumb-zone shortcut for creating incidents */}
      <button
        className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lg)] transition-transform active:scale-95 lg:hidden"
        aria-label="Ny avvikelse"
        onClick={() => setShowCreate(true)}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* CREATE DIALOG — two-panel layout */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setUploadFiles([]); setCreateStep(1); } }}>
        <DialogContent className="sm:max-h-[92vh] sm:max-w-4xl overflow-hidden p-0 gap-0">
          {/* Header bar */}
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5 sm:py-3.5">
            <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-muted-foreground hidden sm:block">Ny avvikelse</span>
            {newIncident.title && <span className="text-sm font-semibold text-foreground truncate max-w-[140px] sm:max-w-xs">{newIncident.title}</span>}
            {/* Mobile step indicator */}
            <div className="flex items-center gap-1 sm:hidden ml-auto">
              <span className={cn("h-2 w-2 rounded-full transition-colors", createStep === 1 ? "bg-primary" : "bg-muted-foreground/30")} />
              <span className={cn("h-2 w-2 rounded-full transition-colors", createStep === 2 ? "bg-primary" : "bg-muted-foreground/30")} />
            </div>
            <div className="ml-auto sm:ml-0 flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hidden sm:flex" onClick={() => setShowCreate(false)}>Avbryt</Button>
              {/* Mobile nav */}
              <div className="flex gap-1.5 sm:hidden">
                {createStep === 1 ? (
                  <Button size="sm" className="rounded-full text-xs" onClick={() => setCreateStep(2)} disabled={!newIncident.title.trim()}>
                    Nästa
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="rounded-full text-xs text-muted-foreground" onClick={() => setCreateStep(1)}>
                      Tillbaka
                    </Button>
                    <Button size="sm" className="rounded-full text-xs" onClick={createIncident} disabled={saving || !newIncident.title.trim() || !newIncident.description.trim()}>
                      {saving ? "Sparar..." : "Skapa"}
                    </Button>
                  </>
                )}
              </div>
              {/* Desktop always-visible create */}
              <Button size="sm" className="rounded-full text-xs hidden sm:flex" onClick={createIncident} disabled={saving || !newIncident.title.trim() || !newIncident.description.trim()}>
                {saving ? "Sparar..." : "Skapa"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row overflow-hidden" style={{ maxHeight: "calc(92dvh - 56px)" }}>
            {/* CONTENT column — always on desktop, step 1 on mobile */}
            <div className={cn("flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 min-w-0", createStep === 2 && "hidden sm:block")}>
              <input
                placeholder="Titel på avvikelsen..."
                value={newIncident.title}
                onChange={(e) => setNewIncident(p => ({ ...p, title: e.target.value }))}
                className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none focus:outline-none"
              />
              {/* Common defects quick-select */}
              {commonDefects.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Snabbval — vanliga avvikelser</p>
                  <div className="flex flex-wrap gap-1.5">
                    {commonDefects.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        className={cn(
                          "min-h-[36px] rounded-full border px-3 py-1.5 text-xs transition-colors",
                          newIncident.description === d.label
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary"
                        )}
                        onClick={() => setNewIncident(p => ({
                          ...p,
                          description: p.description ? `${p.description}\n${d.label}` : d.label,
                          title: p.title || d.label,
                        }))}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Textarea
                placeholder="Beskriv avvikelsen — vad hände, var, när?"
                value={newIncident.description}
                onChange={(e) => setNewIncident(p => ({ ...p, description: e.target.value }))}
                rows={5}
                className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
              />

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

            {/* PROPERTIES sidebar — hidden on mobile step 1 */}
            <div className={cn("w-full sm:w-64 shrink-0 overflow-y-auto border-t sm:border-t-0 sm:border-l border-border/60 bg-muted/30", createStep === 1 && "hidden sm:block")}>
              <div className="divide-y divide-border/50">

                {/* Prioritet */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">Prioritet</span>
                  <Select value={newIncident.priority} onValueChange={(v) => setNewIncident(p => ({ ...p, priority: v }))}>
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
                  <Store className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">Kategori</span>
                  <Select value={newIncident.category} onValueChange={(v) => setNewIncident(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Drift", "Säkerhet", "Kundärende", "Skada", "Stöld", "Övrigt"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Butik */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <Store className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">Butik</span>
                  <Select value={newIncident.store_id || "__none"} onValueChange={(v) => setNewIncident(p => ({ ...p, store_id: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end">
                      <SelectValue placeholder="Ingen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Ingen</SelectItem>
                      {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Ansvarig — sökbar */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="text-xs text-muted-foreground">Ansvarig</span>
                  </div>
                  <ResponsiblePicker
                    users={storeUsers}
                    groups={groups}
                    selectedUserId={newIncident.responsible_user_id}
                    selectedGroupId={newIncident.responsible_group_id}
                    onSelectUser={(id) => setNewIncident(p => ({ ...p, responsible_user_id: id, responsible_group_id: id ? "" : p.responsible_group_id }))}
                    onSelectGroup={(id) => setNewIncident(p => ({ ...p, responsible_group_id: id, responsible_user_id: id ? "" : p.responsible_user_id }))}
                  />
                </div>

                {/* SAP artikel-ID */}
                <div className="px-4 py-3 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="text-xs text-muted-foreground shrink-0">SAP-artikel</span>
                    <div className="flex flex-1 items-center gap-1 min-w-0">
                      <input
                        value={newIncident.sap_article_id}
                        onChange={(e) => setNewIncident(p => ({ ...p, sap_article_id: e.target.value }))}
                        placeholder="t.ex. 1047133"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className="min-w-0 flex-1 border-0 bg-transparent text-right text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none overflow-hidden"
                      />
                      {newIncident.sap_article_id && (
                        <button type="button" onClick={() => setNewIncident(p => ({ ...p, sap_article_id: "" }))} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 hover:text-destructive shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {newIncident.sap_article_id && (
                    <a
                      href={mittCoopUrl(newIncident.sap_article_id, activeStore?.sap_site_id ?? null) ?? `https://mittcoop.coop.se/sortiment/articles/${newIncident.sap_article_id.trim()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Öppna i Mitt Coop
                    </a>
                  )}
                </div>

              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG */}
      <Dialog open={!!showDetail} onOpenChange={(o) => !o && setShowDetail(null)}>
        {showDetail && (
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between gap-2 pr-6">
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-base">{showDetail.title}</DialogTitle>
                    {showDetail.source === "kundrunda" && (
                      <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">Kundrunda</span>
                    )}
                  </div>
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

              {/* Mitt Coop deep link */}
              {(() => {
                const url = mittCoopUrl(showDetail.sap_article_id, showDetail.store?.sap_site_id);
                if (!url) return null;
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                  >
                    <Hash className="h-3 w-3" />
                    SAP {showDetail.sap_article_id}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                );
              })()}

              {/* Responsible user + group */}
              {isManager && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs"><User className="h-3.5 w-3.5" /> Ansvarig person</Label>
                    <Select value={showDetail.responsible_user_id ?? "__none"} onValueChange={(v) => assignResponsible(showDetail.id, v === "__none" ? "" : v)}>
                      <SelectTrigger className="h-9 rounded-full text-sm"><SelectValue placeholder="Ingen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Ingen</SelectItem>
                        {storeUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {groups.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-xs"><Users className="h-3.5 w-3.5" /> Ansvarig grupp</Label>
                      <Select value={showDetail.responsible_group_id ?? "__none"} onValueChange={(v) => assignGroup(showDetail.id, v === "__none" ? "" : v)}>
                        <SelectTrigger className="h-9 rounded-full text-sm"><SelectValue placeholder="Ingen" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Ingen</SelectItem>
                          {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {!isManager && (showDetail.responsible || showDetail.responsible_group) && (
                <div className="flex flex-wrap gap-3">
                  {showDetail.responsible && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Ansvarig: <strong>{showDetail.responsible.display_name}</strong></span>
                    </div>
                  )}
                  {showDetail.responsible_group && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>Grupp: <strong>{showDetail.responsible_group.name}</strong></span>
                    </div>
                  )}
                </div>
              )}

              {/* Images */}
              {detailImages.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Bilder ({detailImages.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {detailImages.map((img, i) => (
                      <button
                        key={img.id}
                        type="button"
                        className="group relative overflow-hidden rounded-lg border border-border/60 shrink-0"
                        onClick={() => setViewerIdx(i)}
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

              {/* Status actions */}
              {isManager && STATUS_TRANSITIONS[showDetail.status]?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <p className="w-full text-xs font-medium text-muted-foreground">Ändra status:</p>
                  {STATUS_TRANSITIONS[showDetail.status].map((s) => (
                    <Button key={s} size="sm" variant="outline" className="rounded-full text-xs"
                      onClick={() => updateStatus(showDetail.id, s)}>
                      {STATUS_LABELS[s]}
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

      {/* Photo viewer — native <dialog>, sits above all Radix modals */}
      {viewerIdx !== null && detailImages.length > 0 && (
        <PhotoViewer
          images={detailImages.map(img => getPublicUrl(img.storage_path))}
          initialIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
        />
      )}

      {/* EDIT DIALOG */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Redigera avvikelse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Titel</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beskrivning</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))} rows={3} className="resize-none text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori</Label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Drift","Säkerhet","Kundärende","Skada","Stöld","Övrigt"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioritet</Label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Låg","Medel","Hög","Kritisk"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Ansvarig person</Label>
                <Select value={editForm.responsible_user_id || "__none"} onValueChange={(v) => setEditForm(p => ({ ...p, responsible_user_id: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Ingen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Ingen</SelectItem>
                    {storeUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {groups.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Ansvarig grupp</Label>
                  <Select value={editForm.responsible_group_id || "__none"} onValueChange={(v) => setEditForm(p => ({ ...p, responsible_group_id: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Ingen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Ingen</SelectItem>
                      {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SAP artikel-ID</Label>
              <Input value={editForm.sap_article_id} onChange={(e) => setEditForm(p => ({ ...p, sap_article_id: e.target.value }))} className="text-sm font-mono" placeholder="t.ex. 1234567" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditTarget(null)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" disabled={editSaving || !editForm.title.trim()} onClick={saveEditIncident}>
                {editSaving ? "Sparar..." : "Spara ändringar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort avvikelse</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort avvikelsen <strong>{deleteTarget?.title}</strong>? All data inklusive kommentarer och bilder tas bort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteIncident}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
