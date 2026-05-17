import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ClipboardList, Play, CircleCheck as CheckCircle2, Circle as XCircle, CircleAlert as AlertCircle, ChevronRight, Plus, X, MapPin, Clock, Star, TriangleAlert as AlertTriangle, RefreshCw, Shield } from "lucide-react";
import {
  supabase, type KundrundaSession, type KundrundaZone, type KundrundaCheckpoint,
  type KundrundaResponse, getSessionToken
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/kundrunda")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: KundrundalPage,
});

type KundrundalView = "list" | "active" | "history";

function KundrundalPage() {
  const { user, activeStore } = useAuth();
  const [view, setView] = useState<KundrundalView>("list");
  const [sessions, setSessions] = useState<KundrundaSession[]>([]);
  const [activeSession, setActiveSession] = useState<KundrundaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVersionChoice, setShowVersionChoice] = useState(false);
  const [hasLocalVersion, setHasLocalVersion] = useState(false);

  const load = useCallback(async () => {
    if (!activeStore) { setLoading(false); return; }
    setLoading(true);
    const [sessRes, localRes] = await Promise.all([
      supabase.from("kundrunda_sessions").select("*, stores(name), app_users(display_name)")
        .eq("store_id", activeStore.id).order("started_at", { ascending: false }).limit(20),
      supabase.from("kundrunda_local_versions").select("id").eq("store_id", activeStore.id).eq("is_active", true).limit(1),
    ]);
    setSessions((sessRes.data ?? []) as KundrundaSession[]);
    setHasLocalVersion((localRes.data?.length ?? 0) > 0);
    const ongoing = (sessRes.data ?? []).find((s: KundrundaSession) => s.status === "in_progress");
    if (ongoing) { setActiveSession(ongoing as KundrundaSession); setView("active"); }
    setLoading(false);
  }, [activeStore]);

  useEffect(() => { load(); }, [load]);

  async function startRunda(useLocal = false) {
    if (!activeStore || !user) return;
    const { data } = await supabase.from("kundrunda_sessions").insert({
      store_id: activeStore.id,
      conducted_by: user.id,
      started_at: new Date().toISOString(),
      status: "in_progress",
      total_score: 0,
      max_score: 0,
    }).select().single();
    if (data) {
      setActiveSession(data as KundrundaSession);
      setView("active");
    }
    setShowVersionChoice(false);
  }

  function handleStartClick() {
    if (hasLocalVersion) setShowVersionChoice(true);
    else startRunda(false);
  }

  const completedSessions = sessions.filter(s => s.status === "completed");
  const avgScore = completedSessions.length > 0
    ? completedSessions.reduce((sum, s) => sum + (s.max_score > 0 ? s.total_score / s.max_score * 100 : 0), 0) / completedSessions.length
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Kundrunda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeStore?.name}</p>
        </div>
        {view === "list" && !activeSession && (
          <button
            onClick={handleStartClick}
            className="flex items-center gap-2 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Play className="w-4 h-4" />
            Starta runda
          </button>
        )}
      </div>

      {view === "list" && (
        <>
          {/* Stats */}
          {completedSessions.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-primary">{Math.round(avgScore)}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">Snittpoäng</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-foreground">{completedSessions.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Avslutade</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-foreground">
                  {completedSessions[0]?.completed_at ? formatDateTime(completedSessions[0].completed_at).slice(0, 10) : "–"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Senaste</p>
              </div>
            </div>
          )}

          {/* Recent sessions */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Tidigare rundor</h2>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Laddar...</div>
            ) : sessions.filter(s => s.status === "completed").length === 0 ? (
              <div className="bg-card border border-border rounded-2xl py-10 text-center">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Inga rundor genomförda ännu</p>
                <button onClick={handleStartClick} className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
                  Starta din första runda
                </button>
              </div>
            ) : (
              sessions.filter(s => s.status === "completed").map(s => {
                const pct = s.max_score > 0 ? Math.round(s.total_score / s.max_score * 100) : 0;
                return (
                  <div key={s.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
                      pct >= 80 ? "bg-success/20 text-success" : pct >= 60 ? "bg-warning/20 text-warning-foreground" : "bg-destructive/10 text-destructive"
                    )}>
                      {pct}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{formatDateTime(s.started_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.app_users?.display_name} · {s.total_score}/{s.max_score} poäng
                      </p>
                    </div>
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", pct >= 80 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-destructive")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {view === "active" && activeSession && (
        <ActiveRunda
          session={activeSession}
          onComplete={() => { setView("list"); setActiveSession(null); load(); }}
          onCancel={() => { setView("list"); setActiveSession(null); load(); }}
          storeId={activeStore?.id ?? ""}
          userId={user?.id ?? ""}
        />
      )}

      {showVersionChoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-lg w-full sm:max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-foreground">Välj version</h2>
            <p className="text-sm text-muted-foreground">Du har en lokal anpassad version. Vilken vill du använda?</p>
            <div className="space-y-2">
              <button
                onClick={() => startRunda(false)}
                className="w-full px-4 py-3 rounded-xl border border-border hover:bg-muted text-left transition-colors"
              >
                <p className="font-medium text-sm text-foreground">Central version</p>
                <p className="text-xs text-muted-foreground mt-0.5">Standard från Huvudkontoret</p>
              </button>
              <button
                onClick={() => startRunda(true)}
                className="w-full px-4 py-3 rounded-xl border border-primary/30 bg-primary-soft hover:bg-primary/10 text-left transition-colors"
              >
                <p className="font-medium text-sm text-foreground">Lokal version</p>
                <p className="text-xs text-muted-foreground mt-0.5">Din anpassade version för {activeStore?.name}</p>
              </button>
            </div>
            <button onClick={() => setShowVersionChoice(false)} className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1">
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveRunda({ session, onComplete, onCancel, storeId, userId }: {
  session: KundrundaSession; onComplete: () => void; onCancel: () => void;
  storeId: string; userId: string;
}) {
  const [zones, setZones] = useState<KundrundaZone[]>([]);
  const [responses, setResponses] = useState<Record<string, KundrundaResponse>>({});
  const [activeZoneIdx, setActiveZoneIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showDefectForm, setShowDefectForm] = useState<string | null>(null);
  const [defectDesc, setDefectDesc] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("kundrunda_zones").select("*, kundrunda_checkpoints(*)").order("sort_order"),
      supabase.from("kundrunda_responses").select("id, session_id, checkpoint_id, result, defect_description, created_at").eq("session_id", session.id),
    ]).then(([zonesRes, respRes]) => {
      setZones((zonesRes.data ?? []) as KundrundaZone[]);
      const respMap: Record<string, KundrundaResponse> = {};
      ((respRes.data ?? []) as KundrundaResponse[]).forEach(r => { respMap[r.checkpoint_id] = r; });
      setResponses(respMap);
      setLoading(false);
    });
  }, [session.id]);

  async function respond(checkpointId: string, result: "ok" | "avvikelse") {
    const existing = responses[checkpointId];
    const prevResponses = responses;

    if (existing) {
      // Optimistic update
      setResponses(r => ({ ...r, [checkpointId]: { ...existing, result } }));
      const { error } = await supabase.from("kundrunda_responses").update({ result }).eq("id", existing.id);
      if (error) {
        setResponses(prevResponses);
        toast.error("Kunde inte spara svar");
        return;
      }
    } else {
      // Optimistic insert with temp ID
      const tempId = `temp-${checkpointId}`;
      const optimistic: KundrundaResponse = {
        id: tempId,
        session_id: session.id,
        checkpoint_id: checkpointId,
        result,
        defect_description: null,
        created_at: new Date().toISOString(),
      };
      setResponses(r => ({ ...r, [checkpointId]: optimistic }));
      const { data, error } = await supabase.from("kundrunda_responses").insert({
        session_id: session.id, checkpoint_id: checkpointId, result,
      }).select("id, session_id, checkpoint_id, result, defect_description, created_at").single();
      if (error || !data) {
        setResponses(prevResponses);
        toast.error("Kunde inte spara svar");
        return;
      }
      setResponses(r => ({ ...r, [checkpointId]: data as KundrundaResponse }));
    }
    if (result === "avvikelse") setShowDefectForm(checkpointId);
  }

  async function submitDefect(checkpointId: string) {
    const resp = responses[checkpointId];
    if (resp && defectDesc) {
      await supabase.from("kundrunda_responses").update({ defect_description: defectDesc }).eq("id", resp.id);
      // Auto-create incident
      await supabase.from("incidents").insert({
        title: `Kundrunda: ${defectDesc.slice(0, 80)}`,
        description: defectDesc,
        category: "Service",
        priority: "Medel",
        store_id: storeId,
        reported_by: userId,
        status: "open",
        ref_number: `KR-${Date.now().toString().slice(-6)}`,
        source: "kundrunda",
      });
    }
    setShowDefectForm(null);
    setDefectDesc("");
  }

  async function completeRunda() {
    setCompleting(true);
    const allCheckpoints = zones.flatMap(z => z.kundrunda_checkpoints ?? []);
    const okCount = Object.values(responses).filter(r => r.result === "ok").length;
    const maxScore = allCheckpoints.length;
    await supabase.from("kundrunda_sessions").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_score: okCount,
      max_score: maxScore,
    }).eq("id", session.id);
    toast.success(`Runda avslutad: ${okCount}/${maxScore} godkänt (${Math.round(okCount / maxScore * 100)}%)`);
    onComplete();
    setCompleting(false);
  }

  const allCheckpoints = zones.flatMap(z => z.kundrunda_checkpoints ?? []);
  const respondedCount = Object.keys(responses).length;
  const totalCheckpoints = allCheckpoints.length;
  const progress = totalCheckpoints > 0 ? (respondedCount / totalCheckpoints) * 100 : 0;

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Laddar zoner...</div>;

  const activeZone = zones[activeZoneIdx];
  const checkpoints = activeZone?.kundrunda_checkpoints ?? [];

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Framsteg</span>
          <span className="text-sm text-muted-foreground">{respondedCount}/{totalCheckpoints}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Zone tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {zones.map((z, i) => {
          const zoneCheckpoints = z.kundrunda_checkpoints ?? [];
          const zoneAnswered = zoneCheckpoints.filter(c => responses[c.id]).length;
          const allAnswered = zoneAnswered === zoneCheckpoints.length && zoneCheckpoints.length > 0;
          return (
            <button
              key={z.id}
              onClick={() => setActiveZoneIdx(i)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                activeZoneIdx === i ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground",
                allAnswered && activeZoneIdx !== i && "border-success/40"
              )}
            >
              {allAnswered && <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
              {z.name}
            </button>
          );
        })}
      </div>

      {/* Checkpoints */}
      <div className="space-y-2">
        {checkpoints.map(cp => {
          const resp = responses[cp.id];
          return (
            <div key={cp.id} className={cn(
              "bg-card border border-border rounded-xl p-4 transition-all",
              resp?.result === "ok" && "border-success/30 bg-success/5",
              resp?.result === "avvikelse" && "border-destructive/30 bg-destructive/5"
            )}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{cp.title}</p>
                  {cp.description && <p className="text-xs text-muted-foreground mt-0.5">{cp.description}</p>}
                  {resp?.defect_description && (
                    <p className="text-xs text-destructive mt-1 bg-destructive/10 rounded px-2 py-1">{resp.defect_description}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => respond(cp.id, "ok")}
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                      resp?.result === "ok" ? "bg-success text-success-foreground" : "border border-border hover:border-success/40 hover:bg-success/10 text-muted-foreground"
                    )}
                    aria-label="OK"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => respond(cp.id, "avvikelse")}
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                      resp?.result === "avvikelse" ? "bg-destructive text-destructive-foreground" : "border border-border hover:border-destructive/40 hover:bg-destructive/10 text-muted-foreground"
                    )}
                    aria-label="Avvikelse"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex gap-2">
        {activeZoneIdx > 0 && (
          <button onClick={() => setActiveZoneIdx(i => i - 1)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted">
            ← Föregående zon
          </button>
        )}
        {activeZoneIdx < zones.length - 1 ? (
          <button onClick={() => setActiveZoneIdx(i => i + 1)} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            Nästa zon →
          </button>
        ) : (
          <button
            onClick={completeRunda}
            disabled={completing || respondedCount < totalCheckpoints}
            className="flex-1 py-2.5 rounded-xl bg-success text-success-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {completing ? "Avslutar..." : `Avsluta runda (${respondedCount}/${totalCheckpoints})`}
          </button>
        )}
      </div>
      <button onClick={onCancel} className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1">
        Avbryt och gå tillbaka
      </button>

      {/* Defect form */}
      {showDefectForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-lg w-full sm:max-w-sm p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Beskriv avvikelsen</h2>
            <textarea
              value={defectDesc}
              onChange={e => setDefectDesc(e.target.value)}
              placeholder="Vad observerades? Vad behöver åtgärdas?"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowDefectForm(null); setDefectDesc(""); }} className="flex-1 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Hoppa över</button>
              <button onClick={() => submitDefect(showDefectForm)} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Spara</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
