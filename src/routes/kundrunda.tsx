import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, ChartBar as BarChart3, CircleCheck as CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, CreditCard as Edit2, MapPin, Plus, Trash2, TriangleAlert as AlertTriangle, X, ArrowRight, Hash, ZoomIn, Image as ImageIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PhotoViewer } from "@/components/photo-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  supabase,
  type KundrundaZone, type KundrundaCheckpoint, type KundrundaSession,
  type KundrundaResponse, type KundrundaCommonDefect, type KundrundaResponseImage,
  type AppUser,
  logAudit, createNotification, mittCoopUrl, uploadAttachment, getPublicUrl,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kundrunda")({
  component: KundrundaPage,
});

type ZoneWithCheckpoints = KundrundaZone & { checkpoints: KundrundaCheckpoint[] };
type ResponseMap = Record<string, KundrundaResponse>;

type DefectForm = {
  checkpoint_id: string;
  zone_id: string;
  defect_description: string;
  action_taken: string;
  responsible_user_id: string;
  sap_article_id: string;
};

const emptyDefect = (checkpoint_id: string, zone_id: string): DefectForm => ({
  checkpoint_id, zone_id, defect_description: "", action_taken: "", responsible_user_id: "", sap_article_id: "",
});

function ScoreRing({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? score / max : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const color = pct >= 0.8 ? "text-success" : pct >= 0.5 ? "text-warning-foreground" : "text-destructive";
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg className="-rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={r} strokeWidth="6" className="stroke-muted fill-none" />
        <circle cx="40" cy="40" r={r} strokeWidth="6" fill="none"
          strokeDasharray={`${dash} ${circ}`}
          className={cn("transition-all duration-500", color.replace("text-", "stroke-"))}
          style={{ strokeLinecap: "round" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className={cn("text-lg font-bold tabular-nums", color)}>{Math.round(pct * 100)}</span>
        <span className="text-[9px] text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function KundrundaPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const [zones, setZones] = useState<ZoneWithCheckpoints[]>([]);
  const [sessions, setSessions] = useState<KundrundaSession[]>([]);
  const [storeUsers, setStoreUsers] = useState<AppUser[]>([]);
  const [commonDefects, setCommonDefects] = useState<KundrundaCommonDefect[]>([]);
  const [loading, setLoading] = useState(true);

  // Active session state
  const [activeSession, setActiveSession] = useState<KundrundaSession | null>(null);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [responseImages, setResponseImages] = useState<Record<string, KundrundaResponseImage[]>>({});
  const [currentZoneIdx, setCurrentZoneIdx] = useState(0);
  const [defectDialog, setDefectDialog] = useState<DefectForm | null>(null);
  const [savingDefect, setSavingDefect] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  // Photo refs
  const defectPhotoRef = useRef<HTMLInputElement>(null);
  const refPhotoRef = useRef<HTMLInputElement>(null);
  const [pendingRefCheckpointId, setPendingRefCheckpointId] = useState<string | null>(null);
  const [checkpointRefImages, setCheckpointRefImages] = useState<Record<string, { id: string; storage_path: string }[]>>({});

  const [view, setView] = useState<"home" | "active" | "edit">("home");

  // Zone/checkpoint editing
  const [editZone, setEditZone] = useState<ZoneWithCheckpoints | null>(null);
  const [editZoneForm, setEditZoneForm] = useState({ name: "" });
  const [editCheckpoint, setEditCheckpoint] = useState<KundrundaCheckpoint | null>(null);
  const [editCheckpointForm, setEditCheckpointForm] = useState({ label: "", description: "" });
  const [newCheckpointLabel, setNewCheckpointLabel] = useState("");
  const [newCheckpointDesc, setNewCheckpointDesc] = useState("");
  const [newZoneName, setNewZoneName] = useState("");
  const [deleteZoneTarget, setDeleteZoneTarget] = useState<ZoneWithCheckpoints | null>(null);
  const [deleteCheckpointTarget, setDeleteCheckpointTarget] = useState<{ checkpoint: KundrundaCheckpoint; zoneId: string } | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<KundrundaSession | null>(null);

  // Common defects management
  const [showManageDefects, setShowManageDefects] = useState(false);
  const [newDefectLabel, setNewDefectLabel] = useState("");

  const fetchData = async () => {
    const [zonesRes, sessionsRes, defectsRes] = await Promise.all([
      supabase.from("kundrunda_zones").select("*, checkpoints:kundrunda_checkpoints(*, images:kundrunda_checkpoint_images(*))").order("sort_order"),
      (() => {
        let q = supabase
          .from("kundrunda_sessions")
          .select("*, store:stores(id,name,sap_site_id), conductor:app_users!conducted_by(id,display_name)")
          .order("created_at", { ascending: false })
          .limit(20);
        if (activeStore) q = q.eq("store_id", activeStore.id);
        else if (userStores.length > 0) q = q.in("store_id", userStores.map(s => s.id));
        return q;
      })(),
      supabase.from("kundrunda_common_defects").select("*").order("sort_order"),
    ]);
    if (zonesRes.data) {
      const z = zonesRes.data as ZoneWithCheckpoints[];
      setZones(z);
      // Build ref images map
      const refMap: Record<string, { id: string; storage_path: string }[]> = {};
      for (const zone of z) {
        for (const cp of zone.checkpoints) {
          refMap[cp.id] = (cp.images ?? []).map(img => ({ id: img.id, storage_path: img.storage_path }));
        }
      }
      setCheckpointRefImages(refMap);
    }
    if (sessionsRes.data) setSessions(sessionsRes.data as KundrundaSession[]);
    if (defectsRes.data) setCommonDefects(defectsRes.data as KundrundaCommonDefect[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    if (activeStore) {
      supabase.from("user_stores").select("user:app_users(*)").eq("store_id", activeStore.id)
        .then(({ data }) => {
          if (data) setStoreUsers((data as { user: AppUser }[]).map(d => d.user).filter(Boolean));
        });
    } else {
      supabase.from("app_users").select("*").eq("is_active", true)
        .then(({ data }) => { if (data) setStoreUsers(data as AppUser[]); });
    }
  }, [activeStore]);

  const startSession = async () => {
    const { data } = await supabase.from("kundrunda_sessions").insert({
      store_id: activeStore?.id ?? null,
      conducted_by: user?.id,
      status: "in_progress",
      total_score: 0,
      max_score: zones.reduce((sum, z) => sum + z.checkpoints.length, 0),
    }).select("*, store:stores(id,name,sap_site_id)").maybeSingle();
    if (data) {
      setActiveSession(data as KundrundaSession);
      setResponses({});
      setResponseImages({});
      setCurrentZoneIdx(0);
      setView("active");
      logAudit(user?.id ?? null, "kundrunda.session.start", "kundrunda_sessions", data.id, {});
    }
  };

  const resumeSession = async (session: KundrundaSession) => {
    const [respRes, imgRes] = await Promise.all([
      supabase.from("kundrunda_responses").select("*").eq("session_id", session.id),
      supabase.from("kundrunda_response_images").select("*").eq("session_id", session.id),
    ]);
    const map: ResponseMap = {};
    (respRes.data ?? []).forEach((r: KundrundaResponse) => { map[r.checkpoint_id] = r; });
    const imgMap: Record<string, KundrundaResponseImage[]> = {};
    (imgRes.data ?? []).forEach((img: KundrundaResponseImage) => {
      if (!imgMap[img.response_id]) imgMap[img.response_id] = [];
      imgMap[img.response_id].push(img as KundrundaResponseImage);
    });
    setActiveSession(session);
    setResponses(map);
    setResponseImages(imgMap);
    setCurrentZoneIdx(0);
    setView("active");
  };

  const recordOk = async (checkpoint: KundrundaCheckpoint) => {
    if (!activeSession) return;
    const existing = responses[checkpoint.id];
    if (existing) {
      await supabase.from("kundrunda_responses").update({ result: "ok", defect_description: null, action_taken: null, responsible_user_id: null, sap_article_id: null }).eq("id", existing.id);
      setResponses(p => ({ ...p, [checkpoint.id]: { ...p[checkpoint.id], result: "ok", defect_description: null, action_taken: null, responsible_user_id: null } }));
    } else {
      const { data } = await supabase.from("kundrunda_responses").insert({
        session_id: activeSession.id, checkpoint_id: checkpoint.id, zone_id: checkpoint.zone_id, result: "ok",
      }).select().maybeSingle();
      if (data) setResponses(p => ({ ...p, [checkpoint.id]: data as KundrundaResponse }));
    }
    await updateScore();
  };

  const approveZone = async (zone: ZoneWithCheckpoints) => {
    if (!activeSession) return;
    for (const cp of zone.checkpoints) {
      if (responses[cp.id]?.result === "ok") continue;
      await recordOk(cp);
    }
  };

  const openDefectDialog = (checkpoint: KundrundaCheckpoint) => {
    const existing = responses[checkpoint.id];
    setDefectDialog({
      checkpoint_id: checkpoint.id,
      zone_id: checkpoint.zone_id,
      defect_description: existing?.defect_description ?? "",
      action_taken: existing?.action_taken ?? "",
      responsible_user_id: existing?.responsible_user_id ?? "",
      sap_article_id: existing?.sap_article_id ?? "",
    });
  };

  const saveDefect = async () => {
    if (!activeSession || !defectDialog) return;
    setSavingDefect(true);
    const existing = responses[defectDialog.checkpoint_id];
    let responseId: string | undefined;

    if (existing) {
      await supabase.from("kundrunda_responses").update({
        result: "avvikelse",
        defect_description: defectDialog.defect_description,
        action_taken: defectDialog.action_taken,
        responsible_user_id: defectDialog.responsible_user_id || null,
        sap_article_id: defectDialog.sap_article_id || null,
      }).eq("id", existing.id);
      responseId = existing.id;
    } else {
      const { data } = await supabase.from("kundrunda_responses").insert({
        session_id: activeSession.id,
        checkpoint_id: defectDialog.checkpoint_id,
        zone_id: defectDialog.zone_id,
        result: "avvikelse",
        defect_description: defectDialog.defect_description,
        action_taken: defectDialog.action_taken,
        responsible_user_id: defectDialog.responsible_user_id || null,
        sap_article_id: defectDialog.sap_article_id || null,
      }).select().maybeSingle();
      if (data) responseId = data.id;
    }

    setResponses(p => ({
      ...p,
      [defectDialog.checkpoint_id]: {
        ...(p[defectDialog.checkpoint_id] ?? {} as KundrundaResponse),
        result: "avvikelse",
        defect_description: defectDialog.defect_description,
        action_taken: defectDialog.action_taken,
        responsible_user_id: defectDialog.responsible_user_id || null,
        sap_article_id: defectDialog.sap_article_id || null,
      },
    }));

    // Auto-create incident and task if description provided
    if (defectDialog.defect_description.trim() && responseId) {
      const zone = zones.find(z => z.id === defectDialog.zone_id);
      const checkpoint = zone?.checkpoints.find(c => c.id === defectDialog.checkpoint_id);
      const title = `Kundrunda: ${zone?.name ?? ""} — ${checkpoint?.label ?? ""}`;
      const due = new Date();
      due.setDate(due.getDate() + 1);

      // Create incident in avvikelser
      const { data: incident } = await supabase.from("incidents").insert({
        title,
        description: defectDialog.defect_description,
        category: "Drift",
        priority: "Medel",
        store_id: activeSession.store_id,
        reported_by: user?.id,
        responsible_user_id: defectDialog.responsible_user_id || null,
        sap_article_id: defectDialog.sap_article_id || null,
        status: "open",
        source: "kundrunda",
      }).select("id").maybeSingle();

      let taskId: string | null = null;
      if (defectDialog.responsible_user_id) {
        const { data: task } = await supabase.from("tasks").insert({
          title,
          description: defectDialog.defect_description,
          category: "Drift",
          priority: "Medel",
          store_id: activeSession.store_id,
          assigned_to: defectDialog.responsible_user_id,
          created_by: user?.id,
          sap_article_id: defectDialog.sap_article_id || null,
          due_date: due.toISOString(),
          status: "todo",
        }).select("id").maybeSingle();
        if (task) {
          taskId = task.id;
          if (defectDialog.responsible_user_id !== user?.id) {
            createNotification(defectDialog.responsible_user_id, "task_assigned", `Kundrunda-uppgift: ${zone?.name ?? ""}`, defectDialog.defect_description.slice(0, 100), "/uppgifter");
          }
        }
      }

      if (responseId) {
        await supabase.from("kundrunda_responses").update({
          created_task_id: taskId,
          incident_id: incident?.id ?? null,
        }).eq("id", responseId);
      }
    }

    await updateScore();
    setSavingDefect(false);
    setDefectDialog(null);
  };

  const uploadDefectPhoto = async (file: File) => {
    if (!activeSession || !defectDialog) return;
    const existing = responses[defectDialog.checkpoint_id];
    let responseId = existing?.id;
    if (!responseId) {
      const { data } = await supabase.from("kundrunda_responses").insert({
        session_id: activeSession.id, checkpoint_id: defectDialog.checkpoint_id,
        zone_id: defectDialog.zone_id, result: "avvikelse",
      }).select("id").maybeSingle();
      responseId = data?.id;
    }
    if (!responseId) return;
    const path = await uploadAttachment(file, `kundrunda/${activeSession.id}/${responseId}`);
    if (path) {
      await supabase.from("kundrunda_response_images").insert({ response_id: responseId, session_id: activeSession.id, storage_path: path, uploaded_by: user?.id });
      setResponseImages(p => ({ ...p, [responseId!]: [...(p[responseId!] ?? []), { id: "tmp", response_id: responseId!, session_id: activeSession.id, storage_path: path, uploaded_by: user?.id ?? null, created_at: new Date().toISOString() }] }));
    }
  };

  const uploadRefPhoto = async (file: File, checkpointId: string) => {
    const path = await uploadAttachment(file, `kundrunda/ref/${checkpointId}`);
    if (path) {
      const { data } = await supabase.from("kundrunda_checkpoint_images").insert({ checkpoint_id: checkpointId, storage_path: path, uploaded_by: user?.id }).select("id").maybeSingle();
      if (data) {
        setCheckpointRefImages(p => ({ ...p, [checkpointId]: [...(p[checkpointId] ?? []), { id: data.id, storage_path: path }] }));
      }
    }
  };

  const deleteRefPhoto = async (checkpointId: string, imgId: string) => {
    await supabase.from("kundrunda_checkpoint_images").delete().eq("id", imgId);
    setCheckpointRefImages(p => ({ ...p, [checkpointId]: (p[checkpointId] ?? []).filter(i => i.id !== imgId) }));
  };

  const updateScore = async () => {
    if (!activeSession) return;
    const { data: allResp } = await supabase.from("kundrunda_responses").select("result").eq("session_id", activeSession.id);
    const okCount = (allResp ?? []).filter((r: { result: string }) => r.result === "ok").length;
    const total = zones.reduce((s, z) => s + z.checkpoints.length, 0);
    await supabase.from("kundrunda_sessions").update({ total_score: okCount, max_score: total }).eq("id", activeSession.id);
    setActiveSession(p => p ? { ...p, total_score: okCount, max_score: total } : null);
  };

  const completeSession = async () => {
    if (!activeSession) return;
    await supabase.from("kundrunda_sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", activeSession.id);
    logAudit(user?.id ?? null, "kundrunda.session.complete", "kundrunda_sessions", activeSession.id, {});
    await fetchData();
    setActiveSession(null);
    setResponses({});
    setResponseImages({});
    setView("home");
  };

  const deleteSession = async () => {
    if (!deleteSessionTarget) return;
    await supabase.from("kundrunda_response_images").delete().eq("session_id", deleteSessionTarget.id);
    await supabase.from("kundrunda_responses").delete().eq("session_id", deleteSessionTarget.id);
    await supabase.from("kundrunda_sessions").delete().eq("id", deleteSessionTarget.id);
    logAudit(user?.id ?? null, "kundrunda.session.delete", "kundrunda_sessions", deleteSessionTarget.id, {});
    setDeleteSessionTarget(null);
    await fetchData();
  };

  // Zone / checkpoint CRUD
  const saveZone = async () => {
    if (!editZone || !editZoneForm.name.trim()) return;
    await supabase.from("kundrunda_zones").update({ name: editZoneForm.name.trim() }).eq("id", editZone.id);
    setEditZone(null);
    await fetchData();
  };

  const addZone = async () => {
    if (!newZoneName.trim()) return;
    const maxOrder = Math.max(0, ...zones.map(z => z.sort_order));
    await supabase.from("kundrunda_zones").insert({ name: newZoneName.trim(), sort_order: maxOrder + 1 });
    setNewZoneName("");
    await fetchData();
  };

  const deleteZone = async () => {
    if (!deleteZoneTarget) return;
    await supabase.from("kundrunda_checkpoints").delete().eq("zone_id", deleteZoneTarget.id);
    await supabase.from("kundrunda_zones").delete().eq("id", deleteZoneTarget.id);
    setDeleteZoneTarget(null);
    await fetchData();
  };

  const saveCheckpoint = async () => {
    if (!editCheckpoint || !editCheckpointForm.label.trim()) return;
    await supabase.from("kundrunda_checkpoints").update({ label: editCheckpointForm.label.trim(), description: editCheckpointForm.description.trim() || null }).eq("id", editCheckpoint.id);
    setEditCheckpoint(null);
    await fetchData();
  };

  const addCheckpoint = async (zoneId: string) => {
    if (!newCheckpointLabel.trim()) return;
    const zone = zones.find(z => z.id === zoneId);
    const maxOrder = Math.max(0, ...(zone?.checkpoints ?? []).map(c => c.sort_order));
    await supabase.from("kundrunda_checkpoints").insert({ zone_id: zoneId, label: newCheckpointLabel.trim(), description: newCheckpointDesc.trim() || null, sort_order: maxOrder + 1 });
    setNewCheckpointLabel("");
    setNewCheckpointDesc("");
    await fetchData();
  };

  const deleteCheckpoint = async () => {
    if (!deleteCheckpointTarget) return;
    await supabase.from("kundrunda_checkpoint_images").delete().eq("checkpoint_id", deleteCheckpointTarget.checkpoint.id);
    await supabase.from("kundrunda_checkpoints").delete().eq("id", deleteCheckpointTarget.checkpoint.id);
    setDeleteCheckpointTarget(null);
    await fetchData();
  };

  const addCommonDefect = async () => {
    if (!newDefectLabel.trim()) return;
    const maxOrder = Math.max(-1, ...commonDefects.map(d => d.sort_order));
    await supabase.from("kundrunda_common_defects").insert({ store_id: activeStore?.id ?? null, label: newDefectLabel.trim(), sort_order: maxOrder + 1 });
    setNewDefectLabel("");
    await fetchData();
  };

  const deleteCommonDefect = async (id: string) => {
    await supabase.from("kundrunda_common_defects").delete().eq("id", id);
    setCommonDefects(p => p.filter(d => d.id !== id));
  };

  const currentZone = zones[currentZoneIdx];
  const totalCheckpoints = zones.reduce((s, z) => s + z.checkpoints.length, 0);
  const answeredCount = Object.values(responses).filter(r => r.result).length;
  const defectCount = Object.values(responses).filter(r => r.result === "avvikelse").length;

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      </div>
    );
  }

  // ── ACTIVE SESSION VIEW ────────────────────────────────────────────────────
  if (view === "active" && activeSession && currentZone) {
    const zoneProgress = currentZone.checkpoints.filter(c => responses[c.id]?.result).length;
    const zoneTotal = currentZone.checkpoints.length;
    const sessionPct = totalCheckpoints > 0 ? answeredCount / totalCheckpoints : 0;
    const allZoneDone = zoneProgress === zoneTotal;

    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
        {/* Session header */}
        <div className="shrink-0 border-b border-border/60 bg-card px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted hover:bg-muted/70" onClick={() => setView("home")}>
                <X className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Kundrunda</p>
                <p className="text-xs text-muted-foreground">{activeSession.store?.name ?? "Butik"}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{answeredCount}/{totalCheckpoints}</p>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${sessionPct * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Zone navigation */}
        <div className="shrink-0 overflow-x-auto border-b border-border/40 bg-card px-4 py-2">
          <div className="flex gap-1.5">
            {zones.map((z, i) => {
              const done = z.checkpoints.every(c => responses[c.id]?.result);
              const partial = z.checkpoints.some(c => responses[c.id]?.result);
              return (
                <button
                  key={z.id}
                  onClick={() => setCurrentZoneIdx(i)}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                    i === currentZoneIdx ? "bg-primary text-primary-foreground" :
                    done ? "bg-success/15 text-success" :
                    partial ? "bg-primary-soft text-primary" :
                    "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {done && <CheckCircle2 className="h-3 w-3" />}
                  {z.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Current zone */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{currentZone.name}</h2>
                <p className="text-xs text-muted-foreground">{zoneProgress}/{zoneTotal} besvarade</p>
              </div>
              <div className="flex items-center gap-2">
                {!allZoneDone && (
                  <Button size="sm" variant="outline" className="rounded-full gap-1.5 text-xs text-success border-success/40 hover:bg-success/10" onClick={() => approveZone(currentZone)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Godkänn alla
                  </Button>
                )}
                {currentZoneIdx > 0 && (
                  <button onClick={() => setCurrentZoneIdx(i => i - 1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card hover:bg-muted/40">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                {currentZoneIdx < zones.length - 1 && (
                  <button onClick={() => setCurrentZoneIdx(i => i + 1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card hover:bg-muted/40">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {currentZone.checkpoints.map((cp) => {
              const resp = responses[cp.id];
              const isOk = resp?.result === "ok";
              const isDefect = resp?.result === "avvikelse";
              const refImages = checkpointRefImages[cp.id] ?? [];

              return (
                <div key={cp.id} className={cn(
                  "rounded-2xl border p-4 transition-all",
                  isOk ? "border-success/40 bg-success/5" :
                  isDefect ? "border-destructive/40 bg-destructive/5" :
                  "border-border/60 bg-card"
                )}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {isOk ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                        : isDefect ? <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                        : <Circle className="h-5 w-5 shrink-0 text-muted-foreground/30" />
                      }
                      <div className="min-w-0">
                        <span className="font-medium text-sm">{cp.label}</span>
                        {cp.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{cp.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => recordOk(cp)}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all active:scale-95",
                          isOk ? "border-success bg-success/15 text-success" : "border-border/60 text-muted-foreground hover:border-success/50 hover:text-success"
                        )}
                        aria-label="OK"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => openDefectDialog(cp)}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all active:scale-95",
                          isDefect ? "border-destructive bg-destructive/15 text-destructive" : "border-border/60 text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                        )}
                        aria-label="Avvikelse"
                      >
                        <AlertTriangle className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Reference images for this checkpoint */}
                  {refImages.length > 0 && (
                    <div className="mt-3 border-t border-border/40 pt-3">
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Referensbilder</p>
                      <div className="flex gap-1.5 overflow-x-auto">
                        {refImages.map((img, idx) => (
                          <button key={img.id} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60" onClick={() => { setViewerImages(refImages.map(i => getPublicUrl(i.storage_path))); setViewerIdx(idx); }}>
                            <img src={getPublicUrl(img.storage_path)} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isDefect && resp.defect_description && (
                    <div className="mt-3 border-t border-destructive/20 pt-3 space-y-1">
                      <p className="text-xs text-destructive/80">{resp.defect_description}</p>
                      {resp.sap_article_id && <p className="text-[11px] text-muted-foreground font-mono">SAP: {resp.sap_article_id}</p>}
                      <button className="text-[11px] text-primary underline" onClick={() => openDefectDialog(cp)}>Redigera</button>
                      {/* Defect photos */}
                      {resp.id && (responseImages[resp.id] ?? []).length > 0 && (
                        <div className="flex gap-1.5 pt-1 overflow-x-auto">
                          {(responseImages[resp.id] ?? []).map((img, idx) => (
                            <button key={img.id} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/60" onClick={() => { setViewerImages((responseImages[resp.id] ?? []).map(i => getPublicUrl(i.storage_path))); setViewerIdx(idx); }}>
                              <img src={getPublicUrl(img.storage_path)} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="shrink-0 border-t border-border/60 bg-card p-4">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{defectCount}</span> avvikelse{defectCount !== 1 ? "r" : ""}
            </div>
            {answeredCount === totalCheckpoints ? (
              <Button className="rounded-full gap-1.5" onClick={completeSession}>
                <CheckCircle2 className="h-4 w-4" /> Slutför rundan
              </Button>
            ) : currentZoneIdx < zones.length - 1 ? (
              <Button className="rounded-full gap-1.5" onClick={() => setCurrentZoneIdx(i => i + 1)}>
                Nästa zon <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="outline" className="rounded-full" onClick={completeSession}>Avsluta ändå</Button>
            )}
          </div>
        </div>

        {/* Defect dialog */}
        <Dialog open={!!defectDialog} onOpenChange={(o) => { if (!o) setDefectDialog(null); }}>
          {defectDialog && (
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">Avvikelse — detaljer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Common defect quick-select */}
                {commonDefects.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Vanliga avvikelser</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {commonDefects.map(d => (
                        <button key={d.id} type="button"
                          className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                          onClick={() => setDefectDialog(p => p ? { ...p, defect_description: d.label } : null)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Beskriv avvikelsen</Label>
                  <Textarea
                    value={defectDialog.defect_description}
                    onChange={(e) => setDefectDialog(p => p ? { ...p, defect_description: e.target.value } : null)}
                    placeholder="Vad är problemet?"
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Åtgärd</Label>
                  <Input
                    value={defectDialog.action_taken}
                    onChange={(e) => setDefectDialog(p => p ? { ...p, action_taken: e.target.value } : null)}
                    placeholder="Planerad åtgärd..."
                    className="text-sm"
                  />
                </div>
                {/* Photo upload for defect */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Foto på avvikelsen</Label>
                  <input ref={defectPhotoRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadDefectPhoto(f); e.target.value = ""; }}
                  />
                  <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5 text-xs w-full" onClick={() => defectPhotoRef.current?.click()}>
                    <Camera className="h-3.5 w-3.5" /> Lägg till foto
                  </Button>
                  {/* Show already-uploaded defect photos */}
                  {(() => {
                    const existing = responses[defectDialog.checkpoint_id];
                    const imgs = existing?.id ? (responseImages[existing.id] ?? []) : [];
                    return imgs.length > 0 ? (
                      <div className="flex gap-1.5 overflow-x-auto pt-1">
                        {imgs.map((img) => (
                          <div key={img.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60">
                            <img src={getPublicUrl(img.storage_path)} alt="" className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">SAP-artikel-ID</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={defectDialog.sap_article_id}
                      onChange={(e) => setDefectDialog(p => p ? { ...p, sap_article_id: e.target.value } : null)}
                      placeholder="t.ex. 1047133"
                      inputMode="numeric"
                      className="pl-9 text-sm"
                    />
                  </div>
                  {defectDialog.sap_article_id && activeSession.store?.sap_site_id && (
                    <a href={mittCoopUrl(defectDialog.sap_article_id, activeSession.store.sap_site_id) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Öppna i Mitt Coop
                    </a>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ansvarig</Label>
                  <Select value={defectDialog.responsible_user_id || "__none"} onValueChange={(v) => setDefectDialog(p => p ? { ...p, responsible_user_id: v === "__none" ? "" : v } : null)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Välj person" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Ingen</SelectItem>
                      {storeUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {defectDialog.responsible_user_id && (
                    <p className="text-[11px] text-muted-foreground">En uppgift och en avvikelse skapas automatiskt.</p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => setDefectDialog(null)}>Avbryt</Button>
                  <Button size="sm" className="rounded-full" disabled={savingDefect} onClick={saveDefect}>
                    {savingDefect ? "Sparar..." : "Spara avvikelse"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          )}
        </Dialog>

        {viewerIdx !== null && (
          <PhotoViewer images={viewerImages} initialIndex={viewerIdx} onClose={() => setViewerIdx(null)} />
        )}
      </div>
    );
  }

  // ── EDIT VIEW ─────────────────────────────────────────────────────────────
  if (view === "edit" && isManager) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => setView("home")} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card hover:bg-muted/40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Redigera kundrunda</h1>
            <p className="text-xs text-muted-foreground">Hantera zoner, kontrollpunkter och referensbilder</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowManageDefects(true)}>
              Vanliga avvikelser
            </Button>
          </div>
        </div>

        {/* Add zone */}
        <div className="mb-6 flex gap-2">
          <Input placeholder="Ny zon..." value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} className="text-sm" onKeyDown={(e) => { if (e.key === "Enter") addZone(); }} />
          <Button size="sm" className="rounded-full shrink-0" disabled={!newZoneName.trim()} onClick={addZone}>
            <Plus className="h-4 w-4 mr-1" /> Lägg till zon
          </Button>
        </div>

        <div className="space-y-4">
          {zones.map((zone) => (
            <div key={zone.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              {/* Zone header */}
              <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-4 py-3">
                <h3 className="font-semibold text-sm">{zone.name}</h3>
                <div className="flex gap-1">
                  <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-primary" onClick={() => { setEditZone(zone); setEditZoneForm({ name: zone.name }); }}><Edit2 className="h-3.5 w-3.5" /></button>
                  <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={() => setDeleteZoneTarget(zone)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {/* Checkpoints */}
              <div className="divide-y divide-border/40">
                {zone.checkpoints.map((cp) => {
                  const refs = checkpointRefImages[cp.id] ?? [];
                  return (
                    <div key={cp.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{cp.label}</p>
                          {cp.description && <p className="mt-0.5 text-xs text-muted-foreground">{cp.description}</p>}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-primary" onClick={() => { setEditCheckpoint(cp); setEditCheckpointForm({ label: cp.label, description: cp.description ?? "" }); }}><Edit2 className="h-3.5 w-3.5" /></button>
                          <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={() => setDeleteCheckpointTarget({ checkpoint: cp, zoneId: zone.id })}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      {/* Reference images */}
                      <div className="flex items-center gap-2">
                        {refs.map((img) => (
                          <div key={img.id} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60">
                            <img src={getPublicUrl(img.storage_path)} alt="" className="h-full w-full object-cover" />
                            <button className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteRefPhoto(cp.id, img.id)}>
                              <X className="h-4 w-4 text-white" />
                            </button>
                          </div>
                        ))}
                        <button
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                          onClick={() => { setPendingRefCheckpointId(cp.id); refPhotoRef.current?.click(); }}
                        >
                          <ImageIcon className="h-4 w-4" />
                          <span className="text-[9px]">Ref-bild</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add checkpoint row */}
                <div className="px-4 py-3 space-y-2">
                  <Input placeholder="Ny kontrollpunkt..." value={newCheckpointLabel} onChange={(e) => setNewCheckpointLabel(e.target.value)} className="text-sm" onKeyDown={(e) => { if (e.key === "Enter") addCheckpoint(zone.id); }} />
                  <Textarea placeholder="Beskrivning (valfritt)..." value={newCheckpointDesc} onChange={(e) => setNewCheckpointDesc(e.target.value)} rows={2} className="resize-none text-xs" />
                  <Button size="sm" variant="outline" className="rounded-full text-xs" disabled={!newCheckpointLabel.trim()} onClick={() => addCheckpoint(zone.id)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till punkt
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Hidden ref photo input */}
        <input ref={refPhotoRef} type="file" accept="image/*" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f && pendingRefCheckpointId) await uploadRefPhoto(f, pendingRefCheckpointId); e.target.value = ""; setPendingRefCheckpointId(null); }}
        />

        {/* Edit zone dialog */}
        <Dialog open={!!editZone} onOpenChange={(o) => { if (!o) setEditZone(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Redigera zon</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input value={editZoneForm.name} onChange={(e) => setEditZoneForm(p => ({ ...p, name: e.target.value }))} className="text-sm" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditZone(null)}>Avbryt</Button>
                <Button size="sm" className="rounded-full" onClick={saveZone}>Spara</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit checkpoint dialog */}
        <Dialog open={!!editCheckpoint} onOpenChange={(o) => { if (!o) setEditCheckpoint(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Redigera kontrollpunkt</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Etikett</Label>
                <Input value={editCheckpointForm.label} onChange={(e) => setEditCheckpointForm(p => ({ ...p, label: e.target.value }))} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Beskrivning (vad ska kontrolleras)</Label>
                <Textarea value={editCheckpointForm.description} onChange={(e) => setEditCheckpointForm(p => ({ ...p, description: e.target.value }))} rows={3} className="resize-none text-sm" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditCheckpoint(null)}>Avbryt</Button>
                <Button size="sm" className="rounded-full" onClick={saveCheckpoint}>Spara</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete zone confirm */}
        <AlertDialog open={!!deleteZoneTarget} onOpenChange={(o) => !o && setDeleteZoneTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ta bort zon</AlertDialogTitle>
              <AlertDialogDescription>Ta bort <strong>{deleteZoneTarget?.name}</strong> och alla dess kontrollpunkter?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteZone}>Ta bort</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete checkpoint confirm */}
        <AlertDialog open={!!deleteCheckpointTarget} onOpenChange={(o) => !o && setDeleteCheckpointTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ta bort kontrollpunkt</AlertDialogTitle>
              <AlertDialogDescription>Ta bort <strong>{deleteCheckpointTarget?.checkpoint.label}</strong>?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteCheckpoint}>Ta bort</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Manage common defects */}
        <Dialog open={showManageDefects} onOpenChange={setShowManageDefects}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Vanliga avvikelser</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {commonDefects.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
                    <span className="flex-1 text-sm">{d.label}</span>
                    <button onClick={() => deleteCommonDefect(d.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Ny vanlig avvikelse..." value={newDefectLabel} onChange={(e) => setNewDefectLabel(e.target.value)} className="text-sm" onKeyDown={(e) => { if (e.key === "Enter") addCommonDefect(); }} />
                <Button size="sm" className="rounded-full shrink-0" disabled={!newDefectLabel.trim()} onClick={addCommonDefect}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── HOME VIEW ─────────────────────────────────────────────────────────────
  const inProgressSession = sessions.find(s => s.status === "in_progress");
  const completedSessions = sessions.filter(s => s.status === "completed");

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Kundrunda"
        description={activeStore ? `Butiksrond för ${activeStore.name}` : "Digital butiksinspektion."}
        actions={isManager ? (
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setView("edit")}>
            <Edit2 className="h-4 w-4" /> Redigera
          </Button>
        ) : undefined}
      />

      {/* Start / Resume */}
      <div className="mb-8 rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-sm)]">
        {inProgressSession ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning/15">
                <Clock className="h-5 w-5 text-warning-foreground" />
              </div>
              <div>
                <p className="font-semibold">Pågående runda</p>
                <p className="text-xs text-muted-foreground">
                  Startad {new Date(inProgressSession.started_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {isManager && (
                <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={() => setDeleteSessionTarget(inProgressSession)} aria-label="Ta bort">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <Button className="rounded-full gap-1.5 shrink-0" onClick={() => resumeSession(inProgressSession)}>
                Fortsätt <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Starta ny runda</p>
                <p className="text-xs text-muted-foreground">{zones.length} zoner · {totalCheckpoints} kontrollpunkter</p>
              </div>
            </div>
            <Button className="rounded-full gap-1.5 shrink-0" onClick={startSession}>
              <Plus className="h-4 w-4" /> Starta
            </Button>
          </div>
        )}
      </div>

      {/* Zone overview */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-semibold">Zoner ({zones.length})</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {zones.map((z, i) => (
            <div key={z.id} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
              <span className="truncate text-xs font-medium">{z.name}</span>
              <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">{z.checkpoints.length}</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Recent sessions */}
      {completedSessions.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">Senaste rundor</h3>
          <div className="space-y-2">
            {completedSessions.slice(0, 10).map((s) => {
              const pct = s.max_score > 0 ? s.total_score / s.max_score : 0;
              const scoreColor = pct >= 0.8 ? "text-success" : pct >= 0.5 ? "text-warning-foreground" : "text-destructive";
              return (
                <div key={s.id} className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card px-5 py-4">
                  <BarChart3 className={cn("h-5 w-5 shrink-0", scoreColor)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {s.completed_at ? new Date(s.completed_at).toLocaleDateString("sv-SE", { dateStyle: "medium" }) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(s as KundrundaSession & { conductor?: { display_name: string } }).conductor?.display_name ?? "Okänd"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={cn("text-base font-bold tabular-nums", scoreColor)}>{Math.round(pct * 100)}%</span>
                    <p className="text-[10px] text-muted-foreground">{s.total_score}/{s.max_score}</p>
                  </div>
                  {isManager && (
                    <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted/60 hover:text-destructive transition-opacity" onClick={() => setDeleteSessionTarget(s)} aria-label="Ta bort">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete session confirm */}
      <AlertDialog open={!!deleteSessionTarget} onOpenChange={(o) => !o && setDeleteSessionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort kundrunda</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker? Alla svar och bilder för denna runda tas bort permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteSession}>Ta bort</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewerIdx !== null && (
        <PhotoViewer images={viewerImages} initialIndex={viewerIdx} onClose={() => setViewerIdx(null)} />
      )}
    </div>
  );
}
