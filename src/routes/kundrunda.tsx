import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, ChartBar as BarChart3, CircleCheck as CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Circle, Clock, CreditCard as Edit2, Download, FileText, GripVertical, Lock, MapPin, Plus, Search, Trash2,
  TriangleAlert as AlertTriangle, Upload, X, ArrowRight, Hash, ZoomIn, Image as ImageIcon,
  GitMerge, Copy, RefreshCw, Info, ExternalLink
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PhotoViewer } from "@/components/photo-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ManageCommonDefects } from "@/components/manage-common-defects";
import {
  supabase,
  type KundrundaZone, type KundrundaCheckpoint, type KundrundaSession,
  type KundrundaResponse, type KundrundaResponseImage,
  type CommonDefect, type AppUser,
  logAudit, createNotification, mittCoopUrl, mittCoopSearchUrl, uploadAttachment, getPublicUrl,
  type ArticleIdType,
} from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { GdprImageReminder } from "@/components/gdpr-image-reminder";
import { ImportDialog, type ImportDialogResult } from "@/components/import-dialog";
import { cn, sanitizeCsvCell } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

export const Route = createFileRoute("/kundrunda")({
  component: KundrundaPage,
});

type ZoneWithCheckpoints = KundrundaZone & {
  checkpoints: KundrundaCheckpoint[];
  store_id?: string | null;
  is_local_override?: boolean;
};
type ResponseMap = Record<string, KundrundaResponse>;

type LocalVersionRecord = {
  id: string;
  store_id: string;
  version_type: "local" | "central" | "parallel";
  central_version_id: number | null;
  central_version_pending: boolean;
  pending_central_version_id: number | null;
  parallel_choice: "central" | "local" | null;
  defects_pending_hk_update: boolean;
  pending_defects_snapshot: { id: string; label: string; sort_order: number }[] | null;
};

function scoreColorClass(pct: number): string {
  return pct >= 0.8 ? "text-success" : pct >= 0.5 ? "text-warning-foreground" : "text-destructive";
}

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
  const color = scoreColorClass(pct);
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

// ── CSV helpers ───────────────────────────────────────────────────────────────

// Comment lines (starting with #) are injected into every downloadable template
// and are skipped by the importer so they don't create bad data.
const KUNDRUNDA_CSV_INSTRUCTIONS = `# INSTRUKTIONER (dessa rader ignoreras vid import)
# Kolumner: Zon,Kontrollpunkt,Beskrivning
#
# Zon: Namnet på zonen (t.ex. "Ingång", "Mejeri")
# Kontrollpunkt: Beskrivning av vad som ska kontrolleras
# Beskrivning: Mer detaljerad information (valfritt)
#
# Regler:
#   - Varje rad skapar en kontrollpunkt i angiven zon
#   - Rader med samma zonnamn grupperas automatiskt
#   - Importera ersätter INTE befintliga data — den lägger till
#
# Tips: Spara filen i UTF-8-format och använd kommatecken (,) som separator
`;

function exportTemplateCsv(zones: ZoneWithCheckpoints[]): void {
  const escape = (s: string) => `"${sanitizeCsvCell((s ?? "").replace(/"/g, '""'))}"`;
  const dataRows = ["Zon,Kontrollpunkt,Beskrivning"];
  for (const z of zones) {
    for (const cp of z.checkpoints) {
      dataRows.push([escape(z.name), escape(cp.label), escape(cp.description ?? "")].join(","));
    }
  }
  const content = KUNDRUNDA_CSV_INSTRUCTIONS + dataRows.join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kundrunda-mall-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSessionsCsv(sessions: KundrundaSession[]): void {
  const escape = (v: string) => `"${sanitizeCsvCell((v ?? "").replace(/"/g, '""'))}"`;
  const rows: string[] = ["Datum,Utförd av,Poäng,Max poäng,Procent,Status"];
  for (const s of sessions) {
    const date = s.completed_at ? new Date(s.completed_at).toLocaleDateString("sv-SE") : new Date(s.started_at).toLocaleDateString("sv-SE");
    const conductor = (s as KundrundaSession & { conductor?: { display_name: string } }).conductor?.display_name ?? "Okänd";
    const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0;
    const status = s.status === "completed" ? "Slutförd" : "Pågående";
    rows.push([escape(date), escape(conductor), String(s.total_score), String(s.max_score), `${pct}%`, status].join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kundrunda-historik-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type ParsedCsvRow = { zoneName: string; checkpointLabel: string; description: string };

function parseTemplateCsv(text: string): ParsedCsvRow[] {
  // Skip comment lines and blank lines
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length < 2) return [];
  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (cols.length < 2) continue;
    const clean = (s: string) => s.replace(/^"|"$/g, "").replace(/""/g, '"').trim();
    rows.push({ zoneName: clean(cols[0] ?? ""), checkpointLabel: clean(cols[1] ?? ""), description: clean(cols[2] ?? "") });
  }
  return rows.filter((r) => r.zoneName && r.checkpointLabel);
}

// ─────────────────────────────────────────────────────────────────────────────

function KundrundaPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  const [zones, setZones] = useState<ZoneWithCheckpoints[]>([]);
  const [sessions, setSessions] = useState<KundrundaSession[]>([]);
  const [storeUsers, setStoreUsers] = useState<AppUser[]>([]);
  const [commonDefects, setCommonDefects] = useState<CommonDefect[]>([]);
  const [showManageDefects, setShowManageDefects] = useState(false);
  const [loading, setLoading] = useState(true);

  const [activeSession, setActiveSession] = useState<KundrundaSession | null>(null);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [responseImages, setResponseImages] = useState<Record<string, KundrundaResponseImage[]>>({});
  const [defectDialog, setDefectDialog] = useState<DefectForm | null>(null);
  const [defectArticleType, setDefectArticleType] = useState<ArticleIdType>("mat-nr");
  const [defectArticlePrompt, setDefectArticlePrompt] = useState<string | null>(null);
  const [defectUserSearch, setDefectUserSearch] = useState("");
  const [defectUserOpen, setDefectUserOpen] = useState(false);
  const [savingDefect, setSavingDefect] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [showCommonDefects, setShowCommonDefects] = useState(false);

  const defectPhotoRef = useRef<HTMLInputElement>(null);
  const refPhotoRef = useRef<HTMLInputElement>(null);
  const [pendingRefCheckpointId, setPendingRefCheckpointId] = useState<string | null>(null);
  const [checkpointRefImages, setCheckpointRefImages] = useState<Record<string, { id: string; storage_path: string }[]>>({});

  const [view, setView] = useState<"home" | "active" | "edit">("home");
  const [sessionReadOnly, setSessionReadOnly] = useState(false);
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set([0]));
  const [showFinishWarning, setShowFinishWarning] = useState(false);

  const [syncStatus, setSyncStatus] = useState<"online" | "offline" | "syncing">("online");
  const pendingSyncRef = useRef<Record<string, KundrundaResponse>>({});

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
  const [priorSessionAction, setPriorSessionAction] = useState<KundrundaSession | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [dragZoneIdx, setDragZoneIdx] = useState<number | null>(null);
  const [dropZoneIdx, setDropZoneIdx] = useState<number | null>(null);
  const [dragCpKey, setDragCpKey] = useState<{ zoneId: string; idx: number } | null>(null);
  const [dropCpIdx, setDropCpIdx] = useState<number | null>(null);
  // Auto-scroll raf handle
  const autoScrollRafRef = useRef<number | null>(null);

  const [importingCsv, setImportingCsv] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDefectsMergeDialog, setShowDefectsMergeDialog] = useState(false);

  const [localVersion, setLocalVersion] = useState<LocalVersionRecord | null>(null);
  const [showVersionChoiceDialog, setShowVersionChoiceDialog] = useState(false);
  const [showParallelChoiceDialog, setShowParallelChoiceDialog] = useState(false);
  const [publishingVersion, setPublishingVersion] = useState(false);
  // Track previous central_version_pending to detect transitions from false→true
  const prevCentralPendingRef = useRef<boolean | null>(null);

  // Edit scope: "global" = admin editing central zones, "local" = chef editing store-local zones
  const [editScope, setEditScope] = useState<"global" | "local">("local");

  const fetchData = async () => {
    const [zonesRes, sessionsRes, defectsRes, localVersionRes] = await Promise.all([
      supabase.from("kundrunda_zones").select("*, checkpoints:kundrunda_checkpoints(*, images:kundrunda_checkpoint_images(*))").order("sort_order").order("sort_order", { referencedTable: "checkpoints" }),
      (() => {
        let q = supabase
          .from("kundrunda_sessions")
          .select("*, store:stores(id,name,sap_site_id), conductor:app_users!conducted_by(id,display_name)")
          .order("created_at", { ascending: false })
          .limit(50);
        if (activeStore) q = q.eq("store_id", activeStore.id);
        else if (userStores.length > 0) q = q.in("store_id", userStores.map(s => s.id));
        return q;
      })(),
      (async () => {
        const storeId = activeStore?.id ?? null;
        if (storeId) {
          const { data: local } = await supabase.from("common_defects").select("*").eq("store_id", storeId).order("sort_order");
          if (local && local.length > 0) return { data: local };
        }
        return supabase.from("common_defects").select("*").is("store_id", null).order("sort_order");
      })(),
      activeStore
        ? supabase.from("kundrunda_local_versions").select("*").eq("store_id", activeStore.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (zonesRes.data) {
      const z = zonesRes.data as ZoneWithCheckpoints[];
      setZones(z);
      const refMap: Record<string, { id: string; storage_path: string }[]> = {};
      for (const zone of z) {
        for (const cp of zone.checkpoints) {
          refMap[cp.id] = (cp.images ?? []).map(img => ({ id: img.id, storage_path: img.storage_path }));
        }
      }
      setCheckpointRefImages(refMap);
    }
    if (sessionsRes.data) setSessions(sessionsRes.data as KundrundaSession[]);
    if (defectsRes.data) setCommonDefects(defectsRes.data as CommonDefect[]);
    setLocalVersion(localVersionRes.data as LocalVersionRecord | null ?? null);
    setLoading(false);
  };

  const draftKey = `kundrunda-draft-${user?.id ?? "anon"}-${activeStore?.id ?? "all"}`;
  const [localDraftTime, setLocalDraftTime] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(`kundrunda-draft-${user?.id ?? "anon"}-${activeStore?.id ?? "all"}`);
      if (raw) return (JSON.parse(raw) as { savedAt?: string }).savedAt ?? null;
    } catch {}
    return null;
  });

  const saveLocalDraft = (session: KundrundaSession, respMap: ResponseMap) => {
    try {
      const savedAt = new Date().toISOString();
      localStorage.setItem(draftKey, JSON.stringify({ sessionId: session.id, responses: respMap, savedAt }));
      setLocalDraftTime(savedAt);
    } catch {}
  };

  const flushPendingSync = async () => {
    const pending = { ...pendingSyncRef.current };
    if (Object.keys(pending).length === 0) return;
    setSyncStatus("syncing");
    try {
      for (const resp of Object.values(pending)) {
        if (resp.id && resp.id !== "pending") {
          await supabase.from("kundrunda_responses").update({
            result: resp.result, defect_description: resp.defect_description,
            action_taken: resp.action_taken, responsible_user_id: resp.responsible_user_id,
            sap_article_id: resp.sap_article_id,
          }).eq("id", resp.id);
        }
        delete pendingSyncRef.current[resp.checkpoint_id];
      }
      setSyncStatus("online");
    } catch {
      setSyncStatus("offline");
    }
  };

  const flushPendingSyncRef = useRef(flushPendingSync);
  useEffect(() => { flushPendingSyncRef.current = flushPendingSync; });

  useEffect(() => {
    const onOnline = () => { setSyncStatus("online"); void flushPendingSyncRef.current(); };
    const onOffline = () => setSyncStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) setSyncStatus("offline");
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

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
    setEditScope(isAdmin ? "global" : "local");
  }, [activeStore]);

  // Auto-initialize local version for managers; show version dialog when pending flag transitions false→true
  useEffect(() => {
    if (loading) return;
    if (isManager && activeStore && localVersion === null) {
      ensureLocalVersionRecord();
    }
    const pending = localVersion?.central_version_pending ?? false;
    if (pending && prevCentralPendingRef.current === false) {
      setShowVersionChoiceDialog(true);
    }
    prevCentralPendingRef.current = pending;
  }, [loading, localVersion, isManager, isAdmin, activeStore]);

  // Zones used during a session: prefer store-local, fall back to global
  const storeLocalZones = activeStore ? zones.filter(z => z.store_id === activeStore.id) : [];
  const globalZones = zones.filter(z => !z.store_id);
  // For parallel mode, use the user's last pick; default to local if not yet chosen
  const parallelUsesCentral = localVersion?.version_type === "parallel" && localVersion?.parallel_choice === "central";
  const activeZones = parallelUsesCentral
    ? (globalZones.length > 0 ? globalZones : storeLocalZones)
    : (storeLocalZones.length > 0 ? storeLocalZones : globalZones);

  // Zones filtered by current edit scope
  const editableZones = editScope === "global"
    ? globalZones
    : activeStore
      ? storeLocalZones
      : [];

  const publishCentralVersion = async () => {
    if (!user) return;
    setPublishingVersion(true);
    try {
      const { error } = await supabase.rpc("publish_central_kundrunda", { publisher_id: user.id });
      if (error) throw error;
      toast.success("Central kundrunda publicerad");
    } catch (err) {
      toast.error("Kunde inte publicera: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPublishingVersion(false);
      await fetchData();
    }
  };

  const resolveVersionChoice = async (choice: "central" | "local" | "parallel") => {
    if (!activeStore) return;
    // Ensure local version record exists before acting
    if (!localVersion) await ensureLocalVersionRecord();
    const lv = localVersion ?? (await supabase.from("kundrunda_local_versions").select("*").eq("store_id", activeStore.id).maybeSingle()).data;
    if (!lv) return;
    if (choice === "central") {
      // Replace store-local zones with current HK zones server-side
      await supabase.rpc("apply_central_kundrunda_to_store", { p_store_id: activeStore.id });
    } else {
      const updates: Partial<LocalVersionRecord> = {
        central_version_pending: false,
        pending_central_version_id: null,
        version_type: choice,
        central_version_id: lv.pending_central_version_id,
      };
      await supabase.from("kundrunda_local_versions").update(updates).eq("id", lv.id);
    }
    setShowVersionChoiceDialog(false);
    await fetchData();
  };

  const ensureLocalVersionRecord = async () => {
    if (!activeStore || !user) return;
    if (localVersion) return;
    await supabase.rpc("init_store_local_kundrunda", { p_store_id: activeStore.id });
    await fetchData();
  };

  const handleParallelChoice = async (choice: "central" | "local") => {
    setShowParallelChoiceDialog(false);
    if (localVersion) {
      await supabase.from("kundrunda_local_versions").update({ parallel_choice: choice }).eq("id", localVersion.id);
      setLocalVersion(prev => prev ? { ...prev, parallel_choice: choice } : null);
    }
    // Determine which zones to use based on the just-made choice (activeZones is stale at this point)
    const zonesToUse = choice === "central"
      ? (globalZones.length > 0 ? globalZones : storeLocalZones)
      : (storeLocalZones.length > 0 ? storeLocalZones : globalZones);
    await startSession(zonesToUse);
  };

  const handleStartSession = async () => {
    if (localVersion?.version_type === "parallel") {
      setShowParallelChoiceDialog(true);
      return;
    }
    await startSession(activeZones);
  };

  const startSession = async (zonesToUse = activeZones) => {
    const totalCheckpoints = zonesToUse.reduce((sum, z) => sum + z.checkpoints.length, 0);
    if (totalCheckpoints === 0) {
      toast.error("Lägg till minst en kontrollpunkt innan du startar en runda.");
      return;
    }
    const { data } = await supabase.from("kundrunda_sessions").insert({
      store_id: activeStore?.id ?? null,
      conducted_by: user?.id,
      status: "in_progress",
      total_score: 0,
      max_score: zonesToUse.reduce((sum, z) => sum + z.checkpoints.length, 0),
    }).select("*, store:stores(id,name,sap_site_id)").maybeSingle();
    if (data) {
      setActiveSession(data as KundrundaSession);
      setResponses({});
      setResponseImages({});
      setSessionReadOnly(false);
      setExpandedZones(new Set([0]));
      saveLocalDraft(data as KundrundaSession, {});
      setView("active");
      logAudit(user?.id ?? null, "kundrunda.session.start", "kundrunda_sessions", data.id, {});
    }
  };

  // Optimistic locking: verify session version before writing.
  // Returns false (and shows a toast) if another client has modified the session.
  const checkVersionMatch = async (): Promise<boolean> => {
    if (!activeSession) return false;
    const { data } = await supabase
      .from("kundrunda_sessions")
      .select("version")
      .eq("id", activeSession.id)
      .maybeSingle();
    if (data && data.version !== activeSession.version) {
      toast.error("Ändringarna kunde inte sparas eftersom rundan har uppdaterats av en annan användare. Läs in sidan på nytt.", { duration: 8000 });
      return false;
    }
    return true;
  };

  // Increment the session version in DB and sync local state.
  const bumpVersion = async () => {
    if (!activeSession) return;
    const next = (activeSession.version ?? 1) + 1;
    await supabase.from("kundrunda_sessions").update({ version: next }).eq("id", activeSession.id);
    setActiveSession(p => p ? { ...p, version: next } : null);
  };

  const resumeSession = async (session: KundrundaSession) => {    const [respRes, imgRes] = await Promise.all([
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
    const isCompleted = session.status === "completed";
    setSessionReadOnly(isCompleted);
    if (!isCompleted) saveLocalDraft(session, map);
    const firstIncomplete = activeZones.findIndex(z => !z.checkpoints.every(c => map[c.id]?.result));
    setExpandedZones(new Set([Math.max(0, isCompleted ? 0 : firstIncomplete)]));
    setView("active");
  };

  const recordOk = async (checkpoint: KundrundaCheckpoint) => {
    if (!activeSession) return;
    if (navigator.onLine && !(await checkVersionMatch())) return;
    const existing = responses[checkpoint.id];
    if (existing?.result === "avvikelse") {
      if (existing.incident_id) await supabase.from("incidents").delete().eq("id", existing.incident_id);
      if (existing.created_task_id) await supabase.from("tasks").delete().eq("id", existing.created_task_id);
    }
    const optimistic: KundrundaResponse = {
      ...(existing ?? {} as KundrundaResponse),
      checkpoint_id: checkpoint.id,
      zone_id: checkpoint.zone_id,
      session_id: activeSession.id,
      result: "ok",
      defect_description: null,
      action_taken: null,
      responsible_user_id: null,
      sap_article_id: null,
    };
    let updatedResponses: ResponseMap = {};
    setResponses(prev => {
      const updated = { ...prev, [checkpoint.id]: optimistic };
      updatedResponses = updated;
      saveLocalDraft(activeSession, updated);
      const zoneIdx = activeZones.findIndex(z => z.id === checkpoint.zone_id);
      if (zoneIdx >= 0) {
        const zone = activeZones[zoneIdx];
        const allDone = zone.checkpoints.every(c => (c.id === checkpoint.id ? true : updated[c.id]?.result));
        if (allDone) {
          haptic.success();
          if (zoneIdx < activeZones.length - 1) {
            setExpandedZones(prev2 => {
              const next = new Set(prev2);
              next.delete(zoneIdx);
              next.add(zoneIdx + 1);
              return next;
            });
          }
        }
      }
      return updated;
    });
    if (navigator.onLine) {
      if (existing) {
        await supabase.from("kundrunda_responses").update({ result: "ok", defect_description: null, action_taken: null, responsible_user_id: null, sap_article_id: null }).eq("id", existing.id);
      } else {
        const { data } = await supabase.from("kundrunda_responses").insert({
          session_id: activeSession.id, checkpoint_id: checkpoint.id, zone_id: checkpoint.zone_id, result: "ok",
        }).select().maybeSingle();
        if (data) {
          updatedResponses = { ...updatedResponses, [checkpoint.id]: data as KundrundaResponse };
          setResponses(p => ({ ...p, [checkpoint.id]: data as KundrundaResponse }));
        }
      }
    } else {
      pendingSyncRef.current[checkpoint.id] = optimistic;
      setSyncStatus("offline");
    }
    await updateScore(updatedResponses);
    if (navigator.onLine) await bumpVersion();
  };

  const approveZone = async (zone: ZoneWithCheckpoints) => {
    if (!activeSession) return;
    if (navigator.onLine && !(await checkVersionMatch())) return;
    const unanswered = zone.checkpoints.filter(cp => !responses[cp.id]?.result);
    if (unanswered.length === 0) return;

    const optimistics: ResponseMap = {};
    for (const cp of unanswered) {
      optimistics[cp.id] = {
        ...(responses[cp.id] ?? {} as KundrundaResponse),
        checkpoint_id: cp.id, zone_id: cp.zone_id,
        session_id: activeSession.id, result: "ok",
        defect_description: null, action_taken: null,
        responsible_user_id: null, sap_article_id: null,
      };
    }
    const updatedResponses = { ...responses, ...optimistics };
    setResponses(updatedResponses);
    saveLocalDraft(activeSession, updatedResponses);
    haptic.success();

    await Promise.all(unanswered.map(cp => {
      const existing = responses[cp.id];
      if (existing) {
        return supabase.from("kundrunda_responses").update({ result: "ok", defect_description: null, action_taken: null, responsible_user_id: null, sap_article_id: null }).eq("id", existing.id);
      }
      return supabase.from("kundrunda_responses").insert({
        session_id: activeSession.id, checkpoint_id: cp.id, zone_id: cp.zone_id, result: "ok",
      });
    }));
    await updateScore(updatedResponses);
    await bumpVersion();
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
    setShowCommonDefects(false);
  };

  const saveDefect = async () => {
    if (!activeSession || !defectDialog) return;
    if (!defectDialog.defect_description.trim()) { haptic.error(); return; }
    if (!defectDialog.action_taken.trim()) { haptic.error(); return; }
    if (navigator.onLine && !(await checkVersionMatch())) return;
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

    const updatedEntry: Partial<KundrundaResponse> = {
      result: "avvikelse",
      defect_description: defectDialog.defect_description,
      action_taken: defectDialog.action_taken,
      responsible_user_id: defectDialog.responsible_user_id || null,
      sap_article_id: defectDialog.sap_article_id || null,
    };
    const updatedResponses = {
      ...responses,
      [defectDialog.checkpoint_id]: { ...(responses[defectDialog.checkpoint_id] ?? {} as KundrundaResponse), ...updatedEntry },
    };
    setResponses(updatedResponses);

    if (defectDialog.defect_description.trim() && responseId) {
      const zone = activeZones.find(z => z.id === defectDialog.zone_id);
      const checkpoint = zone?.checkpoints.find(c => c.id === defectDialog.checkpoint_id);
      const title = `Kundrunda: ${zone?.name ?? ""} — ${checkpoint?.label ?? ""}`;
      const due = new Date();
      due.setDate(due.getDate() + 1);
      const { data: incident } = await supabase.from("incidents").insert({
        title, description: defectDialog.defect_description, category: "Drift", priority: "Medel",
        store_id: activeSession.store_id, reported_by: user?.id,
        responsible_user_id: defectDialog.responsible_user_id || null,
        sap_article_id: defectDialog.sap_article_id || null,
        status: "open", source: "kundrunda",
      }).select("id").maybeSingle();
      let taskId: string | null = null;
      if (defectDialog.responsible_user_id) {
        const { data: task } = await supabase.from("tasks").insert({
          title, description: defectDialog.defect_description, category: "Drift", priority: "Medel",
          store_id: activeSession.store_id, assigned_to: defectDialog.responsible_user_id,
          created_by: user?.id, sap_article_id: defectDialog.sap_article_id || null,
          due_date: due.toISOString(), status: "todo",
        }).select("id").maybeSingle();
        if (task) {
          taskId = task.id;
          if (defectDialog.responsible_user_id !== user?.id) {
            createNotification(defectDialog.responsible_user_id, "task_assigned", `Kundrunda-uppgift: ${zone?.name ?? ""}`, defectDialog.defect_description.slice(0, 100), "/uppgifter");
          }
        }
      }
      if (responseId) {
        await supabase.from("kundrunda_responses").update({ created_task_id: taskId, incident_id: incident?.id ?? null }).eq("id", responseId);
      }
    }

    await updateScore(updatedResponses);
    await bumpVersion();
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
      if (data) setCheckpointRefImages(p => ({ ...p, [checkpointId]: [...(p[checkpointId] ?? []), { id: data.id, storage_path: path }] }));
    }
  };

  const deleteRefPhoto = async (checkpointId: string, imgId: string) => {
    await supabase.from("kundrunda_checkpoint_images").delete().eq("id", imgId);
    setCheckpointRefImages(p => ({ ...p, [checkpointId]: (p[checkpointId] ?? []).filter(i => i.id !== imgId) }));
  };

  const updateScore = async (currentResponses: ResponseMap) => {
    if (!activeSession) return;
    let okCount = 0;
    for (const r of Object.values(currentResponses)) { if (r.result === "ok") okCount++; }
    const total = activeZones.reduce((s, z) => s + z.checkpoints.length, 0);
    await supabase.from("kundrunda_sessions").update({ total_score: okCount, max_score: total }).eq("id", activeSession.id);
    setActiveSession(p => p ? { ...p, total_score: okCount, max_score: total } : null);
  };

  const completeSession = async (force = false) => {
    if (!activeSession) return;
    if (!force && answeredCount < totalCheckpoints) { setShowFinishWarning(true); return; }
    await supabase.from("kundrunda_sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", activeSession.id);
    logAudit(user?.id ?? null, "kundrunda.session.complete", "kundrunda_sessions", activeSession.id, {});
    try { localStorage.removeItem(draftKey); } catch {}
    await fetchData();
    setActiveSession(null);
    setResponses({});
    setResponseImages({});
    setShowFinishWarning(false);
    setView("home");
  };

  const suspendSession = () => {
    if (activeSession) saveLocalDraft(activeSession, responses);
    setShowFinishWarning(false);
    setView("home");
  };

  const deleteSession = async () => {
    if (!deleteSessionTarget) return;
    const target = deleteSessionTarget;
    setDeleteSessionTarget(null);
    if (activeSession?.id === target.id) {
      setActiveSession(null); setResponses({}); setResponseImages({}); setView("home");
    }
    try {
      const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
      for (const key of keys) {
        if (!key?.startsWith("kundrunda-draft-")) continue;
        try {
          const p = JSON.parse(localStorage.getItem(key) ?? "");
          if (p.sessionId === target.id) { localStorage.removeItem(key); break; }
        } catch {}
      }
    } catch {}
    await supabase.from("kundrunda_response_images").delete().eq("session_id", target.id);
    await supabase.from("kundrunda_responses").delete().eq("session_id", target.id);
    await supabase.from("kundrunda_sessions").delete().eq("id", target.id);
    logAudit(user?.id ?? null, "kundrunda.session.delete", "kundrunda_sessions", target.id, {});
    await fetchData();
  };

  const bulkDeleteSessions = async () => {
    if (selectedSessionIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedSessionIds);
    for (const id of ids) {
      await supabase.from("kundrunda_response_images").delete().eq("session_id", id);
      await supabase.from("kundrunda_responses").delete().eq("session_id", id);
      await supabase.from("kundrunda_sessions").delete().eq("id", id);
      logAudit(user?.id ?? null, "kundrunda.session.delete", "kundrunda_sessions", id, { bulk: true });
    }
    setSelectedSessionIds(new Set());
    setBulkDeleting(false);
    await fetchData();
  };

  // Zone / checkpoint CRUD — scope-aware
  const saveZone = async () => {
    if (!editZone || !editZoneForm.name.trim()) return;
    await supabase.from("kundrunda_zones").update({ name: editZoneForm.name.trim() }).eq("id", editZone.id);
    setEditZone(null);
    await fetchData();
  };

  const addZone = async () => {
    if (!newZoneName.trim()) return;
    const isLocalScope = editScope === "local";
    const maxOrder = Math.max(0, ...editableZones.map(z => z.sort_order));
    await supabase.from("kundrunda_zones").insert({
      name: newZoneName.trim(),
      sort_order: maxOrder + 1,
      store_id: isLocalScope ? (activeStore?.id ?? null) : null,
      is_local_override: isLocalScope,
    });
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
    await supabase.from("kundrunda_checkpoints").insert({
      zone_id: zoneId,
      label: newCheckpointLabel.trim(),
      description: newCheckpointDesc.trim() || null,
      sort_order: maxOrder + 1,
      store_id: editScope === "local" ? (activeStore?.id ?? null) : null,
      is_local_override: editScope === "local",
    });
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

  const applyZoneReorder = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const reordered = [...editableZones];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const withOrder = reordered.map((z, i) => ({ ...z, sort_order: i }));
    setZones(prev => {
      const ids = withOrder.map(z => z.id);
      const orderMap = Object.fromEntries(withOrder.map(z => [z.id, z.sort_order]));
      const sorted = [...prev].sort((a, b) => {
        const ai = ids.indexOf(a.id);
        const bi = ids.indexOf(b.id);
        if (ai !== -1 && bi !== -1) return ai - bi;
        return (orderMap[a.id] ?? a.sort_order) - (orderMap[b.id] ?? b.sort_order);
      });
      return sorted.map((z, i) => ({ ...z, sort_order: i }));
    });
    await Promise.all(withOrder.map((z, i) => supabase.from("kundrunda_zones").update({ sort_order: i }).eq("id", z.id)));
  };

  const applyCheckpointReorder = async (zoneId: string, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    const cps = [...zone.checkpoints];
    const [moved] = cps.splice(fromIdx, 1);
    cps.splice(toIdx, 0, moved);
    const withOrder = cps.map((c, i) => ({ ...c, sort_order: i }));
    setZones(prev => prev.map(z => z.id !== zoneId ? z : { ...z, checkpoints: withOrder }));
    await Promise.all(withOrder.map((c, i) => supabase.from("kundrunda_checkpoints").update({ sort_order: i }).eq("id", c.id)));
  };

  // Auto-scroll while dragging near viewport edges
  const startAutoScroll = (clientY: number) => {
    if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
    const EDGE = 80;
    const MAX_SPEED = 14;
    const tick = () => {
      const vh = window.innerHeight;
      if (clientY < EDGE) {
        window.scrollBy(0, -((EDGE - clientY) / EDGE) * MAX_SPEED);
      } else if (clientY > vh - EDGE) {
        window.scrollBy(0, ((clientY - (vh - EDGE)) / EDGE) * MAX_SPEED);
      }
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  };

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current) { cancelAnimationFrame(autoScrollRafRef.current); autoScrollRafRef.current = null; }
  };

  const allCheckpoints = editableZones.flatMap(z => z.checkpoints.map(cp => ({ ...cp, zoneName: z.name })));

  const mergeHKDefects = async () => {
    if (!activeStore || !localVersion?.pending_defects_snapshot) return;
    const snapshot = localVersion.pending_defects_snapshot as { id: string; label: string; sort_order: number }[];
    const existing = new Map(commonDefects.filter(d => d.store_id === activeStore.id).map(d => [d.label, d]));
    const toInsert = snapshot.filter(hk => !existing.has(hk.label)).map(hk => ({
      store_id: activeStore.id,
      label: hk.label,
      sort_order: hk.sort_order,
    }));
    if (toInsert.length > 0) await supabase.from("common_defects").insert(toInsert);
    await supabase.from("kundrunda_local_versions").update({
      defects_pending_hk_update: false,
      pending_defects_snapshot: null,
    }).eq("id", localVersion.id);
    setShowDefectsMergeDialog(false);
    await fetchData();
  };

  // CSV import: create zones/checkpoints in specified scope, optionally replacing all existing
  const handleCsvImport = async (result: ImportDialogResult) => {
    if (!isManager) return;
    setImportingCsv(true);
    setShowImportDialog(false);
    try {
      const rows = parseTemplateCsv(await result.file.text());
      if (rows.length === 0) return;

      const rawScope = result.options.scope;
      const importScope: "global" | "local" = isAdmin
        ? (rawScope === "global" ? "global" : "local")
        : "local";
      const shouldReplace = !!result.options.replace;
      const isLocalScope = importScope === "local";
      const storeId = isLocalScope ? (activeStore?.id ?? null) : null;

      if (isLocalScope) await ensureLocalVersionRecord();

      const targetZones = isLocalScope ? storeLocalZones : globalZones;

      // Replace mode: delete all existing zones in this scope first
      if (shouldReplace && targetZones.length > 0) {
        for (const z of targetZones) {
          await supabase.from("kundrunda_checkpoints").delete().eq("zone_id", z.id);
        }
        await supabase.from("kundrunda_zones").delete().in("id", targetZones.map(z => z.id));
      }

      // Re-derive editable zones after potential delete
      const currentZones = shouldReplace ? [] : targetZones;

      // Group rows by zone name
      const zoneMap = new Map<string, ParsedCsvRow[]>();
      for (const row of rows) {
        if (!zoneMap.has(row.zoneName)) zoneMap.set(row.zoneName, []);
        zoneMap.get(row.zoneName)!.push(row);
      }

      let sortIdx = currentZones.length;
      for (const [zoneName, zoneRows] of zoneMap) {
        let zoneId: string | null = currentZones.find(z => z.name.toLowerCase().trim() === zoneName.toLowerCase().trim())?.id ?? null;
        if (!zoneId) {
          const { data: z } = await supabase.from("kundrunda_zones").insert({
            name: zoneName, sort_order: sortIdx++,
            store_id: storeId, is_local_override: isLocalScope,
          }).select("id").maybeSingle();
          zoneId = z?.id ?? null;
        }
        if (!zoneId) continue;

        const existingZone = currentZones.find(z => z.id === zoneId);
        let cpSortIdx = existingZone?.checkpoints.length ?? 0;
        for (const row of zoneRows) {
          const exists = !shouldReplace && existingZone?.checkpoints.some(c => c.label.toLowerCase().trim() === row.checkpointLabel.toLowerCase().trim());
          if (!exists) {
            await supabase.from("kundrunda_checkpoints").insert({
              zone_id: zoneId, label: row.checkpointLabel,
              description: row.description || null,
              sort_order: cpSortIdx++,
              store_id: storeId, is_local_override: isLocalScope,
            });
          }
        }
      }
      await fetchData();
    } finally {
      setImportingCsv(false);
    }
  };

  const totalCheckpoints = useMemo(
    () => activeZones.reduce((s, z) => s + z.checkpoints.length, 0),
    [activeZones],
  );
  const { answeredCount, defectCount } = useMemo(() => {
    let answered = 0, defects = 0;
    for (const r of Object.values(responses)) {
      if (r.result) answered++;
      if (r.result === "avvikelse") defects++;
    }
    return { answeredCount: answered, defectCount: defects };
  }, [responses]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8 space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 animate-pulse rounded-xl bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded-md bg-muted/60" />
            </div>
            <div className="h-9 w-24 animate-pulse rounded-full bg-muted shrink-0" />
          </div>
        </div>
        {[1,2,3].map(i => (
          <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3">
            <div className="h-7 w-7 animate-pulse rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-2/5 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-1/4 animate-pulse rounded-md bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── ACTIVE SESSION VIEW ────────────────────────────────────────────────────
  if (view === "active" && activeSession !== null) {
    const sessionPct = totalCheckpoints > 0 ? answeredCount / totalCheckpoints : 0;
    const isAllDone = answeredCount === totalCheckpoints;
    const incompleteZones = activeZones.filter(z => !z.checkpoints.every(c => responses[c.id]?.result));

    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="sticky top-0 z-20 shrink-0 border-b border-border/60 bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted hover:bg-muted/70 active:scale-95 transition-all" onClick={suspendSession} aria-label="Stäng">
                <X className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{sessionReadOnly ? "Granskning — låst" : "Kundrunda"}</p>
                <p className="text-xs text-muted-foreground">{activeSession.store?.name ?? "Butik"}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {sessionReadOnly ? (
                <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Lock className="h-3 w-3" /> Slutförd — låst
                </div>
              ) : (
                <>
                  {syncStatus !== "online" && (
                    <div className={cn("flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium", syncStatus === "offline" ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", syncStatus === "offline" ? "bg-warning-foreground" : "bg-muted-foreground animate-pulse")} />
                      {syncStatus === "offline" ? "Sparat lokalt" : "Synkar..."}
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-xs font-medium tabular-nums">{answeredCount}<span className="text-muted-foreground">/{totalCheckpoints}</span></p>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted mt-0.5">
                      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${sessionPct * 100}%` }} />
                    </div>
                  </div>
                  <Button size="sm" className={cn("rounded-full text-xs shrink-0", isAllDone ? "bg-success text-success-foreground hover:bg-success/90" : "")} onClick={() => completeSession(false)}>
                    {isAllDone ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Slutför</> : "Avsluta"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-3 py-3 sm:px-5 sm:py-4 space-y-2">
            {activeZones.map((zone, zoneIdx) => {
              const isExpanded = expandedZones.has(zoneIdx);
              const zoneDone = zone.checkpoints.every(c => responses[c.id]?.result);
              const zoneDefects = zone.checkpoints.filter(c => responses[c.id]?.result === "avvikelse").length;
              const zoneAnswered = zone.checkpoints.filter(c => responses[c.id]?.result).length;

              return (
                <div key={zone.id} className={cn("overflow-hidden rounded-2xl border bg-card transition-colors", zoneDone ? "border-success/30" : "border-border/60")}>
                  <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left" onClick={() => setExpandedZones(prev => { const next = new Set(prev); if (next.has(zoneIdx)) next.delete(zoneIdx); else next.add(zoneIdx); return next; })}>
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors", zoneDone ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                      {zoneDone ? <CheckCircle2 className="h-4 w-4" /> : zoneIdx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold">{zone.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {zoneAnswered}/{zone.checkpoints.length}
                        {zoneDefects > 0 && <span className="ml-1 text-destructive">{zoneDefects} avvik.</span>}
                      </span>
                    </div>
                    {!zoneDone && !sessionReadOnly && (
                      <button className="mr-2 flex h-7 items-center gap-1 rounded-full border border-success/40 px-2 text-[11px] text-success hover:bg-success/10 transition-colors" onClick={(e) => { e.stopPropagation(); approveZone(zone); }}>
                        <CheckCircle2 className="h-3 w-3" /> Alla OK
                      </button>
                    )}
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform", isExpanded && "rotate-90")} />
                  </button>

                  {isExpanded && (
                    <div className="divide-y divide-border/40 border-t border-border/40">
                      {zone.checkpoints.map((cp) => {
                        const resp = responses[cp.id];
                        const isOk = resp?.result === "ok";
                        const isDefect = resp?.result === "avvikelse";
                        const refImages = checkpointRefImages[cp.id] ?? [];
                        return (
                          <div key={cp.id} className={cn("p-4 transition-colors", isOk ? "bg-success/5" : isDefect ? "bg-destructive/5" : "")}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="mt-0.5 shrink-0">
                                  {isOk ? <CheckCircle2 className="h-5 w-5 text-success" />
                                    : isDefect ? <AlertTriangle className="h-5 w-5 text-destructive" />
                                    : <Circle className="h-5 w-5 text-muted-foreground/30" />
                                  }
                                </div>
                                <div className="min-w-0">
                                  <span className="font-medium text-sm leading-snug">{cp.label}</span>
                                  {cp.description && (
                                    <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{cp.description}</p>
                                  )}
                                </div>
                              </div>
                              {!sessionReadOnly && (
                                <div className="flex shrink-0 gap-2">
                                  <button onClick={() => { haptic.light(); recordOk(cp); }}
                                    className={cn("flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-all active:scale-95", isOk ? "border-success bg-success/15 text-success" : "border-border/60 text-muted-foreground hover:border-success/50 hover:text-success")}
                                    aria-label="OK">
                                    <CheckCircle2 className="h-5 w-5" />
                                  </button>
                                  <button onClick={() => openDefectDialog(cp)}
                                    className={cn("flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-all active:scale-95", isDefect ? "border-destructive bg-destructive/15 text-destructive" : "border-border/60 text-muted-foreground hover:border-destructive/50 hover:text-destructive")}
                                    aria-label="Avvikelse">
                                    <AlertTriangle className="h-5 w-5" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {refImages.length > 0 && (
                              <div className="mt-3 pt-2">
                                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Referens</p>
                                <div className="flex gap-1.5 overflow-x-auto">
                                  {refImages.map((img, idx) => (
                                    <button key={img.id} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60" onClick={() => { setViewerImages(refImages.map(i => getPublicUrl(i.storage_path))); setViewerIdx(idx); }}>
                                      <img src={getPublicUrl(img.storage_path)} alt="" className="h-full w-full object-cover" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {isDefect && (
                              <div className="mt-3 pt-2 space-y-1">
                                {resp?.defect_description && <p className="text-xs text-destructive/80">{resp.defect_description}</p>}
                                {resp?.sap_article_id && (() => {
                                  const mcUrl = mittCoopUrl(resp.sap_article_id, activeSession.store?.sap_site_id ?? null);
                                  return mcUrl ? (
                                    <a href={mcUrl} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-mono">
                                      <ExternalLink className="h-3 w-3" />
                                      {resp.sap_article_id} — Mitt Coop-sortiment
                                    </a>
                                  ) : (
                                    <p className="text-[11px] text-muted-foreground font-mono">{resp.sap_article_id}</p>
                                  );
                                })()}
                                <button className="text-[11px] text-primary underline" onClick={() => openDefectDialog(cp)}>Redigera</button>
                                {resp?.id && (responseImages[resp.id] ?? []).length > 0 && (
                                  <div className="flex gap-1.5 pt-1 overflow-x-auto">
                                    {(responseImages[resp.id] ?? []).map((img, idx) => (
                                      <button key={img.id} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/60" onClick={() => { setViewerImages((responseImages[resp.id!] ?? []).map(i => getPublicUrl(i.storage_path))); setViewerIdx(idx); }}>
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
                  )}
                </div>
              );
            })}
            <div className="h-4" />
          </div>
        </div>

        {/* Defect dialog */}
        <Dialog open={!!defectDialog} onOpenChange={(o) => { if (!o) { setDefectDialog(null); setShowCommonDefects(false); } }}>
          {defectDialog && (
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">Avvikelse — detaljer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Common defect quick-select — collapsible */}
                {(() => {
                  const filtered = commonDefects.filter(d =>
                    !d.checkpoint_ids?.length || d.checkpoint_ids.includes(defectDialog.checkpoint_id)
                  );
                  return filtered.length > 0 ? (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                        onClick={() => setShowCommonDefects(v => !v)}
                      >
                        <span>Vanliga avvikelser ({filtered.length})</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showCommonDefects && "rotate-180")} />
                      </button>
                      {showCommonDefects && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {filtered.map(d => (
                            <button key={d.id} type="button"
                              className="min-h-[36px] rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                              onClick={() => { setDefectDialog(p => p ? { ...p, defect_description: d.label } : null); setShowCommonDefects(false); }}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}
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
                  <Label className="text-xs">Åtgärd som ska vidtas</Label>
                  <Input
                    value={defectDialog.action_taken}
                    onChange={(e) => setDefectDialog(p => p ? { ...p, action_taken: e.target.value } : null)}
                    placeholder="Planerad åtgärd..."
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Foto på avvikelsen</Label>
                  <GdprImageReminder />
                  <input ref={defectPhotoRef} type="file" accept="image/*" className="hidden"
                    onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadDefectPhoto(f); e.target.value = ""; }}
                  />
                  <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5 text-xs w-full" onClick={() => defectPhotoRef.current?.click()}>
                    <Camera className="h-3.5 w-3.5" /> Lägg till foto
                  </Button>
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
                  <Label className="text-xs">
                    {defectArticleType === "ean" ? "EAN" : defectArticleType === "bnr" ? "BNR" : "Materialnummer"}
                  </Label>
                  <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
                    <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <input
                      value={defectDialog.sap_article_id}
                      onChange={(e) => setDefectDialog(p => p ? { ...p, sap_article_id: e.target.value.replace(/\D/g, "") } : null)}
                      onBlur={(e) => { if (e.target.value.trim()) setDefectArticlePrompt(e.target.value.trim()); }}
                      placeholder={defectArticleType === "ean" ? "t.ex. 7310865003294" : "t.ex. 1047133"}
                      inputMode="numeric" pattern="[0-9]*" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                      className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                    />
                    <select
                      value={defectArticleType}
                      onChange={(e) => setDefectArticleType(e.target.value as ArticleIdType)}
                      className="border-0 bg-transparent text-[10px] text-muted-foreground outline-none cursor-pointer shrink-0"
                    >
                      <option value="mat-nr">Mat-nr</option>
                      <option value="ean">EAN</option>
                      <option value="bnr">BNR</option>
                    </select>
                    {defectDialog.sap_article_id && (
                      <button type="button" onClick={() => setDefectDialog(p => p ? { ...p, sap_article_id: "" } : null)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {defectDialog.sap_article_id && (() => {
                    const url = defectArticleType === "mat-nr"
                      ? (mittCoopUrl(defectDialog.sap_article_id, activeSession.store?.sap_site_id ?? null) ?? `https://mittcoop.coop.se/sortiment/articles/${defectDialog.sap_article_id}`)
                      : mittCoopSearchUrl(defectDialog.sap_article_id, activeSession.store?.sap_site_id ?? null);
                    return url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ArrowRight className="h-3 w-3" /> Öppna i Mitt Coop-sortiment
                      </a>
                    ) : null;
                  })()}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ansvarig</Label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDefectUserOpen(o => !o)}
                      className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <span className={defectDialog.responsible_user_id ? "text-foreground" : "text-muted-foreground"}>
                        {defectDialog.responsible_user_id
                          ? storeUsers.find(u => u.id === defectDialog.responsible_user_id)?.display_name ?? "Välj person"
                          : "Välj person"}
                      </span>
                      {defectDialog.responsible_user_id && (
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDefectDialog(p => p ? { ...p, responsible_user_id: "" } : null); setDefectUserOpen(false); }} />
                      )}
                    </button>
                    {defectUserOpen && (
                      <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-lg border border-border/60 bg-card shadow-lg">
                        <div className="p-2 border-b border-border/40">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                              autoFocus
                              type="text"
                              value={defectUserSearch}
                              onChange={(e) => setDefectUserSearch(e.target.value)}
                              placeholder="Sök person..."
                              className="w-full h-8 rounded-md border border-border/60 bg-background pl-8 pr-2 text-sm outline-none"
                            />
                          </div>
                        </div>
                        <div className="max-h-44 overflow-y-auto p-1">
                          <button
                            type="button"
                            onClick={() => { setDefectDialog(p => p ? { ...p, responsible_user_id: "" } : null); setDefectUserOpen(false); setDefectUserSearch(""); }}
                            className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/50"
                          >
                            Ingen
                          </button>
                          {storeUsers
                            .filter(u => !defectUserSearch || u.display_name.toLowerCase().includes(defectUserSearch.toLowerCase()))
                            .map(u => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => { setDefectDialog(p => p ? { ...p, responsible_user_id: u.id } : null); setDefectUserOpen(false); setDefectUserSearch(""); }}
                                className={cn("w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50", defectDialog.responsible_user_id === u.id && "bg-primary/10 font-medium")}
                              >
                                {u.display_name}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {defectDialog.responsible_user_id && (
                    <p className="text-[11px] text-muted-foreground">En uppgift och en avvikelse skapas automatiskt.</p>
                  )}
                </div>
                {(!defectDialog.defect_description.trim() || !defectDialog.action_taken.trim()) && !savingDefect && (defectDialog.defect_description.length > 0 || defectDialog.action_taken.length > 0) && (
                  <p className="text-xs text-destructive">Beskrivning och åtgärd är obligatoriska fält.</p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setDefectDialog(null); setShowCommonDefects(false); }}>Avbryt</Button>
                  <Button size="sm" className="rounded-full" disabled={savingDefect || !defectDialog?.defect_description.trim() || !defectDialog?.action_taken.trim()} onClick={saveDefect}>
                    {savingDefect ? "Sparar..." : "Spara avvikelse"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          )}
        </Dialog>

        <AlertDialog open={showFinishWarning} onOpenChange={setShowFinishWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rundan är inte klar</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Du har {totalCheckpoints - answeredCount} punkt{totalCheckpoints - answeredCount !== 1 ? "er" : ""} kvar:</p>
                  <ul className="space-y-1">
                    {incompleteZones.map(z => {
                      const remaining = z.checkpoints.filter(c => !responses[c.id]?.result).length;
                      return (
                        <li key={z.id} className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-warning-foreground shrink-0" />
                          <strong>{z.name}</strong>: {remaining} punkt{remaining !== 1 ? "er" : ""} kvar
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="rounded-full w-full sm:w-auto" onClick={suspendSession}>Spara som utkast</Button>
              <AlertDialogCancel className="sm:hidden">Fortsätt rundan</AlertDialogCancel>
              <Button variant="outline" className="rounded-full w-full sm:w-auto hidden sm:flex" onClick={() => setShowFinishWarning(false)}>Fortsätt rundan</Button>
              <AlertDialogAction className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => completeSession(true)}>Avsluta ändå</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {viewerIdx !== null && <PhotoViewer images={viewerImages} initialIndex={viewerIdx} onClose={() => setViewerIdx(null)} />}
      </div>
    );
  }

  // ── EDIT VIEW ─────────────────────────────────────────────────────────────
  if (view === "edit" && isManager) {
    const canEditGlobal = isAdmin;
    const displayZones = editableZones;

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
          <div className="ml-auto flex flex-wrap gap-2">
            {canEditGlobal && (
              <Button variant="outline" size="sm" className="hidden sm:flex rounded-full gap-1.5" onClick={publishCentralVersion} disabled={publishingVersion}>
                <Upload className="h-3.5 w-3.5" />
                {publishingVersion ? "Publicerar..." : "Publicera central"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="hidden sm:flex rounded-full gap-1.5" onClick={() => exportTemplateCsv(displayZones)}>
              <Download className="h-3.5 w-3.5" /> Exportera CSV
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:flex rounded-full gap-1.5" disabled={importingCsv} onClick={() => setShowImportDialog(true)}>
              <Upload className="h-3.5 w-3.5" /> {importingCsv ? "Importerar..." : "Importera CSV"}
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowManageDefects(true)}>
              Vanliga avvikelser
            </Button>
          </div>
        </div>

        {/* Scope toggle for admin */}
        {canEditGlobal && (
          <div className="mb-5 flex overflow-hidden rounded-xl border border-border/60 bg-muted/30">
            <button
              className={cn("flex-1 px-4 py-2.5 text-sm font-medium transition-colors", editScope === "global" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setEditScope("global")}
            >
              Central version (HK)
            </button>
            <button
              className={cn("flex-1 px-4 py-2.5 text-sm font-medium transition-colors", editScope === "local" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setEditScope("local")}
            >
              Butiksversion (lokal)
            </button>
          </div>
        )}

        {editScope === "local" && !canEditGlobal && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            <Edit2 className="h-3.5 w-3.5 shrink-0" />
            Din butiks lokala version. Ändringar påverkar bara din butik.
          </div>
        )}

        {/* Defects merge pending banner */}
        {isManager && localVersion?.defects_pending_hk_update && localVersion?.pending_defects_snapshot && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
            <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">HK har uppdaterat sina vanliga avvikelser</p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Välj om du vill slå ihop HKs uppdateringar med din butiks lokala avvikelser.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="rounded-full text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={async () => {
                  await supabase.from("kundrunda_local_versions").update({ defects_pending_hk_update: false, pending_defects_snapshot: null }).eq("id", localVersion.id);
                  setLocalVersion(p => p ? { ...p, defects_pending_hk_update: false, pending_defects_snapshot: null } : null);
                }}>
                Ignorera
              </Button>
              <Button size="sm" className="rounded-full text-xs h-8" onClick={() => setShowDefectsMergeDialog(true)}>
                <GitMerge className="h-3.5 w-3.5 mr-1" /> Slå ihop
              </Button>
            </div>
          </div>
        )}

        {/* Kundrunda CSV Import Dialog */}
        <ImportDialog
          open={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImport={handleCsvImport}
          title="Importera kundrunda-mall"
          description="Ladda upp en CSV-fil med zoner och kontrollpunkter"
          loading={importingCsv}
          importLabel="Importera"
          options={[
            {
              key: "replace",
              type: "checkbox",
              label: "Ersätt befintliga data",
              description: "Tar bort alla nuvarande zoner och kontrollpunkter i valt scope och ersätter med CSV-filens innehåll",
              defaultValue: false,
            },
            ...(canEditGlobal ? [{
              key: "scope",
              type: "select" as const,
              label: "Importera till",
              description: "Välj om importen ska gälla HK-versionen eller den aktiva butikens lokala version",
              options: [
                { value: "local", label: "Butiksversion (lokal)" },
                { value: "global", label: "Central version (HK)" },
              ],
              defaultValue: editScope,
            }] : []),
          ]}
        />

        {/* Add zone */}
        <div className="mb-6 flex gap-2">
          <Input placeholder="Ny zon..." value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} className="text-sm" onKeyDown={(e) => { if (e.key === "Enter") addZone(); }} />
          <Button size="sm" className="rounded-full shrink-0" disabled={!newZoneName.trim()} onClick={addZone}>
            <Plus className="h-4 w-4 mr-1" /> Lägg till zon
          </Button>
        </div>

        {displayZones.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">Inga zoner i denna version. Lägg till en zon eller importera en CSV-mall.</p>
          </div>
        )}

        <div className="space-y-4">
          {displayZones.map((zone, zoneIdx) => (
            <div key={zone.id}>
              {dragZoneIdx !== null && dragZoneIdx !== zoneIdx && dropZoneIdx === zoneIdx && zoneIdx < dragZoneIdx && (
                <div className="h-1 rounded-full bg-primary/50 mx-1 mb-2" />
              )}
              <div className={cn("rounded-2xl border border-border/60 bg-card overflow-hidden transition-opacity", dragZoneIdx === zoneIdx && "opacity-40", dropZoneIdx === zoneIdx && dragZoneIdx !== zoneIdx && "ring-2 ring-primary/40")}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragZoneIdx(zoneIdx); setDropZoneIdx(zoneIdx); }}
                onDragEnd={() => {
                  stopAutoScroll();
                  const from = dragZoneIdx;
                  const to = dropZoneIdx;
                  setDragZoneIdx(null);
                  setDropZoneIdx(null);
                  if (from !== null && to !== null) applyZoneReorder(from, to);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  startAutoScroll(e.clientY);
                  if (dragZoneIdx !== null) setDropZoneIdx(zoneIdx);
                }}>
              <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab active:cursor-grabbing shrink-0" />
                  <h3 className="font-semibold text-sm">{zone.name}</h3>
                  {zone.is_local_override && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">Lokal</span>}
                </div>
                <div className="flex gap-1">
                  <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-primary" onClick={() => { setEditZone(zone); setEditZoneForm({ name: zone.name }); }}><Edit2 className="h-3.5 w-3.5" /></button>
                  <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={() => setDeleteZoneTarget(zone)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              <div className="divide-y divide-border/40">
                {zone.checkpoints.map((cp, cpIdx) => {
                  const refs = checkpointRefImages[cp.id] ?? [];
                  const isDraggingCp = dragCpKey?.zoneId === zone.id && dragCpKey?.idx === cpIdx;
                  return (
                    <div key={cp.id}>
                      {dragCpKey?.zoneId === zone.id && dropCpIdx === cpIdx && dragCpKey.idx !== cpIdx && cpIdx < dragCpKey.idx && (
                        <div className="h-0.5 rounded-full bg-primary/50 mx-2 mb-1" />
                      )}
                      <div className={cn("px-4 py-3 space-y-2 transition-opacity", isDraggingCp && "opacity-40", dragCpKey?.zoneId === zone.id && dropCpIdx === cpIdx && dragCpKey.idx !== cpIdx && "ring-1 ring-primary/40 rounded-lg")}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; setDragCpKey({ zoneId: zone.id, idx: cpIdx }); setDropCpIdx(cpIdx); }}
                        onDragEnd={() => {
                          stopAutoScroll();
                          const src = dragCpKey;
                          const to = dropCpIdx;
                          setDragCpKey(null);
                          setDropCpIdx(null);
                          if (src && to !== null) applyCheckpointReorder(src.zoneId, src.idx, to);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = "move";
                          startAutoScroll(e.clientY);
                          if (dragCpKey?.zoneId === zone.id) setDropCpIdx(cpIdx);
                        }}>
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40 cursor-grab active:cursor-grabbing" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{cp.label}</p>
                          {cp.description && <p className="mt-0.5 text-xs text-muted-foreground">{cp.description}</p>}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-primary" onClick={() => { setEditCheckpoint(cp); setEditCheckpointForm({ label: cp.label, description: cp.description ?? "" }); }}><Edit2 className="h-3.5 w-3.5" /></button>
                          <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={() => setDeleteCheckpointTarget({ checkpoint: cp, zoneId: zone.id })}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {refs.map((img) => (
                          <div key={img.id} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60">
                            <img src={getPublicUrl(img.storage_path)} alt="" className="h-full w-full object-cover" />
                            <button className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteRefPhoto(cp.id, img.id)}>
                              <X className="h-4 w-4 text-white" />
                            </button>
                          </div>
                        ))}
                        <button className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                          onClick={() => { setPendingRefCheckpointId(cp.id); refPhotoRef.current?.click(); }}>
                          <ImageIcon className="h-4 w-4" />
                          <span className="text-[9px]">Ref-bild</span>
                        </button>
                      </div>
                    </div>
                    {dragCpKey?.zoneId === zone.id && dropCpIdx === cpIdx && dragCpKey.idx !== cpIdx && cpIdx > dragCpKey.idx && (
                      <div className="h-0.5 rounded-full bg-primary/50 mx-4 mt-1" />
                    )}
                  </div>
                  );
                })}

                <div className="px-4 py-3 space-y-2">
                  <Input placeholder="Ny kontrollpunkt..." value={newCheckpointLabel} onChange={(e) => setNewCheckpointLabel(e.target.value)} className="text-sm" onKeyDown={(e) => { if (e.key === "Enter") addCheckpoint(zone.id); }} />
                  <Textarea placeholder="Beskrivning (valfritt)..." value={newCheckpointDesc} onChange={(e) => setNewCheckpointDesc(e.target.value)} rows={2} className="resize-none text-xs" />
                  <Button size="sm" variant="outline" className="rounded-full text-xs" disabled={!newCheckpointLabel.trim()} onClick={() => addCheckpoint(zone.id)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till punkt
                  </Button>
                </div>
              </div>
            </div>
            {dragZoneIdx !== null && dragZoneIdx !== zoneIdx && dropZoneIdx === zoneIdx && zoneIdx > dragZoneIdx && (
              <div className="h-1 rounded-full bg-primary/50 mx-1 mt-2" />
            )}
          </div>
          ))}
        </div>

        <input ref={refPhotoRef} type="file" accept="image/*" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f && pendingRefCheckpointId) await uploadRefPhoto(f, pendingRefCheckpointId); e.target.value = ""; setPendingRefCheckpointId(null); }} />

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

        <ManageCommonDefects
          open={showManageDefects}
          onOpenChange={setShowManageDefects}
          storeId={isAdmin ? null : (activeStore?.id ?? null)}
          isAdmin={isAdmin}
          checkpoints={allCheckpoints.map(cp => ({ id: cp.id, label: cp.label, zoneName: cp.zoneName }))}
          onDefectsChanged={fetchData}
        />

        {/* Defects merge confirmation — must be in edit view since banner is here */}
        <AlertDialog open={showDefectsMergeDialog} onOpenChange={(o) => !o && setShowDefectsMergeDialog(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Slå ihop avvikelser med HK</AlertDialogTitle>
              <AlertDialogDescription>
                HKs nya avvikelser läggs till i din butiks lista. Befintliga lokala avvikelser påverkas inte. Länkade avvikelser vars text ändrats hos HK uppdateras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={mergeHKDefects}>Slå ihop</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── HOME VIEW ─────────────────────────────────────────────────────────────
  const inProgressSessions = sessions.filter(s => s.status === "in_progress");
  const inProgressSession = inProgressSessions[0] ?? null;
  const completedSessions = sessions.filter(s => s.status === "completed");

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Kundrunda"
        description={activeStore ? `Butiksrond för ${activeStore.name}` : "Digital butiksinspektion."}
        actions={
          <div className="flex items-center gap-2">
            {completedSessions.length > 0 && (
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => exportSessionsCsv(sessions)}>
                <Download className="h-4 w-4" /> Exportera historik
              </Button>
            )}
            {isManager && (
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setView("edit")}>
                <Edit2 className="h-4 w-4" /> Redigera
              </Button>
            )}
          </div>
        }
      />

      {/* Pending central version notification */}
      {localVersion?.central_version_pending && (
        <div className="mb-4 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-warning-foreground">Ny central version tillgänglig</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Huvudkontoret har publicerat en uppdaterad kundrundamall. Välj hur du vill hantera din lokala version.
              </p>
            </div>
            <Button size="sm" className="rounded-full shrink-0 bg-warning/20 text-warning-foreground hover:bg-warning/30 border-0" onClick={() => setShowVersionChoiceDialog(true)}>
              Hantera
            </Button>
          </div>
        </div>
      )}

      {localVersion?.version_type === "parallel" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <GitMerge className="h-3.5 w-3.5 shrink-0" />
          Parallell version aktiv — du kan välja Central eller Lokal version vid varje runda.
        </div>
      )}

      {/* Multiple unfinished rounds */}
      {inProgressSessions.length > 1 && (
        <div className="mb-6 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{inProgressSessions.length} oavslutade rundor</span>
          </div>
          <div className="divide-y divide-border">
            {inProgressSessions.map((s) => (
              <div key={s.id}>
                <button
                  onClick={() => setPriorSessionAction(priorSessionAction?.id === s.id ? null : s)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-sm text-foreground">
                      Startad {new Date(s.started_at).toLocaleString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {(s as KundrundaSession & { conductor?: { display_name: string } }).conductor?.display_name && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        · {(s as KundrundaSession & { conductor?: { display_name: string } }).conductor!.display_name}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", priorSessionAction?.id === s.id && "rotate-180")} />
                </button>
                {priorSessionAction?.id === s.id && (
                  <div className="flex gap-2 px-5 pb-3">
                    <Button size="sm" variant="outline" onClick={() => { setPriorSessionAction(null); resumeSession(s); }}>
                      Fortsatt runda
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { setPriorSessionAction(null); setDeleteSessionTarget(s); }}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Ta bort
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
                  Startad kl {new Date(inProgressSession.started_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                  {(inProgressSession as KundrundaSession & { conductor?: { display_name: string } }).conductor?.display_name && (
                    <span className="ml-1">· {(inProgressSession as KundrundaSession & { conductor?: { display_name: string } }).conductor!.display_name}</span>
                  )}
                  {localDraftTime && <span className="ml-1 text-muted-foreground/70">· Autosparat {new Date(localDraftTime).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {isManager && (
                <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={() => setDeleteSessionTarget(inProgressSession)} aria-label="Ta bort">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <Button size="sm" variant="outline" className="rounded-full gap-1.5 shrink-0 text-xs" onClick={handleStartSession}>Ny runda</Button>
              <Button className="rounded-full gap-1.5 shrink-0" onClick={() => resumeSession(inProgressSession)}>
                Återuppta <ArrowRight className="h-4 w-4" />
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
                <p className="text-xs text-muted-foreground">{activeZones.length} zoner · {totalCheckpoints} kontrollpunkter</p>
              </div>
            </div>
            <Button className="rounded-full gap-1.5 shrink-0" onClick={handleStartSession}>
              <Plus className="h-4 w-4" /> Starta
            </Button>
          </div>
        )}
      </div>

      {/* Recent sessions */}
      {completedSessions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Senaste rundor</h3>
            <div className="flex items-center gap-2">
              {selectedSessionIds.size > 0 && (
                <Button
                  size="sm" variant="destructive" className="rounded-full gap-1.5 h-7 text-xs"
                  disabled={bulkDeleting}
                  onClick={bulkDeleteSessions}
                >
                  <Trash2 className="h-3 w-3" />
                  Ta bort {selectedSessionIds.size} valda
                </Button>
              )}
              {selectedSessionIds.size > 0 && (
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedSessionIds(new Set())}>
                  Avmarkera
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {completedSessions.slice(0, 10).map((s) => {
              const pct = s.max_score > 0 ? s.total_score / s.max_score : 0;
              const scoreColor = scoreColorClass(pct);
              const conductedByMe = s.conducted_by === user?.id;
              const canDelete = isManager || conductedByMe;
              const isSelected = selectedSessionIds.has(s.id);
              return (
                <div key={s.id} className={cn("group flex items-center gap-3 rounded-2xl border bg-card px-4 py-4 transition-colors", isSelected ? "border-primary/40 bg-primary/5" : "border-border/60")}>
                  {canDelete && (
                    <button
                      className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-background hover:border-primary/60")}
                      onClick={() => setSelectedSessionIds(prev => { const n = new Set(prev); isSelected ? n.delete(s.id) : n.add(s.id); return n; })}
                      aria-label={isSelected ? "Avmarkera" : "Markera"}
                    >
                      {isSelected && <span className="text-[10px] font-bold leading-none">✓</span>}
                    </button>
                  )}
                  {!canDelete && <div className="w-5 shrink-0" />}
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
                  <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary" onClick={() => resumeSession(s)} aria-label="Granska">
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  {canDelete && (
                    <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteSessionTarget(s)} aria-label="Ta bort">
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
            <AlertDialogDescription>Är du säker? Alla svar och bilder för denna runda tas bort permanent.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteSession}>Ta bort</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewerIdx !== null && <PhotoViewer images={viewerImages} initialIndex={viewerIdx} onClose={() => setViewerIdx(null)} />}

      {/* Version choice dialog */}
      <Dialog open={showVersionChoiceDialog} onOpenChange={(o) => { if (!o) setShowVersionChoiceDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ny central version tillgänglig</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">Huvudkontoret har publicerat en ny kundrundamall. Välj hur din butik ska hantera uppdateringen.</p>
          <div className="space-y-2 mt-2">
            <button className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-left hover:bg-muted/50 transition-colors" onClick={() => resolveVersionChoice("central")}>
              <Upload className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">Uppdatera till central version</p>
                <p className="text-xs text-muted-foreground">Ersätt din lokala mall med den nya centrala versionen.</p>
              </div>
            </button>
            <button className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-left hover:bg-muted/50 transition-colors" onClick={() => resolveVersionChoice("local")}>
              <Copy className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Behåll lokal version</p>
                <p className="text-xs text-muted-foreground">Fortsätt använda din befintliga lokala mall utan förändringar.</p>
              </div>
            </button>
            <button className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-left hover:bg-muted/50 transition-colors" onClick={() => resolveVersionChoice("parallel")}>
              <GitMerge className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
              <div>
                <p className="text-sm font-semibold">Kör båda parallellt</p>
                <p className="text-xs text-muted-foreground">Välj vid varje runda om du vill använda central eller lokal version.</p>
              </div>
            </button>
          </div>
          <div className="flex justify-end mt-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setShowVersionChoiceDialog(false)}>Bestäm senare</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Defects merge confirmation */}
      <AlertDialog open={showDefectsMergeDialog} onOpenChange={(o) => !o && setShowDefectsMergeDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slå ihop avvikelser med HK</AlertDialogTitle>
            <AlertDialogDescription>
              HKs nya avvikelser läggs till i din butiks lista. Befintliga lokala avvikelser påverkas inte. Länkade avvikelser vars text ändrats hos HK uppdateras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={mergeHKDefects}>Slå ihop</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Parallel version choice */}
      <Dialog open={showParallelChoiceDialog} onOpenChange={(o) => { if (!o) setShowParallelChoiceDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Välj mall för denna runda</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Du kör parallell version. Vilken mall vill du använda för denna runda?</p>
          <div className="space-y-2 mt-2">
            {([
              { choice: "central" as const, icon: Upload, iconClass: "text-primary", title: "Central version", desc: "Använd HK:s mall för denna runda." },
              { choice: "local" as const, icon: Copy, iconClass: "text-muted-foreground", title: "Lokal version", desc: "Använd butikens anpassade mall för denna runda." },
            ]).map(({ choice, icon: Icon, iconClass, title, desc }) => (
              <button key={choice} className="w-full flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-left hover:bg-muted/50 transition-colors"
                onClick={() => handleParallelChoice(choice)}>
                <Icon className={cn("h-5 w-5 shrink-0", iconClass)} />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setShowParallelChoiceDialog(false)}>Avbryt</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Article type disambiguation */}
      <AlertDialog open={!!defectArticlePrompt} onOpenChange={(o) => { if (!o) setDefectArticlePrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vad är <span className="font-mono">{defectArticlePrompt}</span>?</AlertDialogTitle>
            <AlertDialogDescription>Välj vilken typ av nummer — det avgör länken till Mitt Coop-sortiment.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            {(["mat-nr", "ean", "bnr"] as ArticleIdType[]).map((t) => (
              <AlertDialogAction key={t} onClick={() => { setDefectArticleType(t); setDefectArticlePrompt(null); }}>
                {t === "mat-nr" ? "Materialnummer" : t === "ean" ? "EAN-streckkod" : "BNR (Beställningsnr)"}
              </AlertDialogAction>
            ))}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
