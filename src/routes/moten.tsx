import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Calendar, CircleCheck as CheckCircle2, ChevronDown, ChevronUp, Clock, Pause, Play, Plus, Trash2, Users, X, ArrowRight, FileText } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  supabase,
  type Meeting, type MeetingAgendaItem, type MeetingDecision, type AppUser,
  logAudit, createNotification,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/moten")({
  component: MeetingsPage,
});

const MEETING_TYPES: { value: Meeting["meeting_type"]; label: string; description: string; defaultDurationMin: number }[] = [
  { value: "ledningsgrupp", label: "Ledningsgrupp", description: "Veckogenomgång för ledningsgruppen. Fredag 13:00, 60 min.", defaultDurationMin: 60 },
  { value: "saljledare", label: "Säljledare", description: "Månadsvis säljledaremöte. Första måndag 13:00, 60 min.", defaultDurationMin: 60 },
  { value: "daglig_styrning", label: "Daglig Styrning", description: "Daglig uppföljning mån–fre kl 09:30. 15 min.", defaultDurationMin: 15 },
  { value: "veckostamning", label: "Veckoavstämning", description: "Flexibel veckovisa uppstämning.", defaultDurationMin: 30 },
];

const DEFAULT_AGENDAS: Record<Meeting["meeting_type"], { title: string; duration: number }[]> = {
  ledningsgrupp: [
    { title: "Föregående protokoll — uppföljning", duration: 5 },
    { title: "Försäljning & budget", duration: 15 },
    { title: "Personal & schema", duration: 10 },
    { title: "Avvikelser & incidenter", duration: 10 },
    { title: "Kommande kampanjer", duration: 10 },
    { title: "Beslut & åtgärder", duration: 10 },
  ],
  saljledare: [
    { title: "Månadsresultat", duration: 15 },
    { title: "Kampanjplanering", duration: 15 },
    { title: "Kundtrender", duration: 10 },
    { title: "Beslut", duration: 20 },
  ],
  daglig_styrning: [
    { title: "Dagens prioriteringar", duration: 5 },
    { title: "Igår — vad gick bra/dåligt?", duration: 5 },
    { title: "Akuta ärenden", duration: 5 },
  ],
  veckostamning: [
    { title: "Veckans mål", duration: 5 },
    { title: "Uppföljning", duration: 10 },
    { title: "Kommande vecka", duration: 10 },
    { title: "Övrigt", duration: 5 },
  ],
};

function statusBadge(s: Meeting["status"]) {
  if (s === "in_progress") return <Badge className="bg-warning/15 text-warning-foreground">Pågår</Badge>;
  if (s === "completed") return <Badge className="bg-success/15 text-success">Slutfört</Badge>;
  if (s === "cancelled") return <Badge variant="secondary">Inställt</Badge>;
  return <Badge variant="secondary">Planerat</Badge>;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmtSecs(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

function AgendaTimer({ item, onComplete }: { item: MeetingAgendaItem; onComplete: () => void }) {
  const budget = item.duration_minutes * 60;
  const elapsed = item.started_at && !item.completed_at
    ? Math.floor((Date.now() - new Date(item.started_at).getTime()) / 1000)
    : item.started_at && item.completed_at
      ? Math.floor((new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()) / 1000)
      : 0;
  const [secs, setSecs] = useState(elapsed);
  const [running, setRunning] = useState(!!item.started_at && !item.completed_at);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSecs(s => s + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const pct = Math.min(1, secs / budget);
  const over = secs > budget;

  return (
    <div className="flex items-center gap-2">
      <div className={cn("font-mono text-sm tabular-nums font-medium", over ? "text-destructive" : "text-foreground")}>
        {fmtSecs(secs)}
        <span className="text-[10px] text-muted-foreground">/{pad(item.duration_minutes)}:00</span>
      </div>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      {!item.completed_at && (
        <button
          onClick={() => { setRunning(r => !r); }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-card hover:bg-muted/50"
        >
          {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
      )}
      {running && !item.completed_at && (
        <button
          onClick={onComplete}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-success/15 text-success hover:bg-success/25"
        >
          <CheckCircle2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

type MeetingFull = Meeting & {
  agenda_items?: MeetingAgendaItem[];
  decisions?: (MeetingDecision & { responsible?: { display_name: string } })[];
  moderator?: { display_name: string };
};

function MeetingsPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const [meetings, setMeetings] = useState<MeetingFull[]>([]);
  const [storeUsers, setStoreUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<MeetingFull | null>(null);

  const [newMeeting, setNewMeeting] = useState<{
    type: Meeting["meeting_type"];
    title: string;
    scheduled_at: string;
    moderator_id: string;
  }>({
    type: "daglig_styrning",
    title: "Daglig Styrning",
    scheduled_at: (() => { const d = new Date(); d.setMinutes(0, 0, 0); return d.toISOString().slice(0, 16); })(),
    moderator_id: "",
  });
  const [creating, setCreating] = useState(false);

  const [newDecision, setNewDecision] = useState({ description: "", responsible_user_id: "", due_date: "", createTask: false });
  const [addingDecision, setAddingDecision] = useState(false);

  const fetchMeetings = async () => {
    let q = supabase
      .from("meetings")
      .select("*, moderator:app_users!moderator_id(id,display_name), agenda_items:meeting_agenda_items(*), decisions:meeting_decisions(*, responsible:app_users!responsible_user_id(id,display_name))")
      .order("scheduled_at", { ascending: false })
      .limit(30);
    if (activeStore) q = q.eq("store_id", activeStore.id);
    else if (userStores.length > 0) q = q.in("store_id", userStores.map(s => s.id));
    const { data } = await q;
    if (data) setMeetings(data as MeetingFull[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchMeetings();
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

  const createMeeting = async () => {
    if (!newMeeting.title.trim()) return;
    setCreating(true);
    const { data: meeting } = await supabase.from("meetings").insert({
      meeting_type: newMeeting.type,
      title: newMeeting.title.trim(),
      store_id: activeStore?.id ?? null,
      scheduled_at: new Date(newMeeting.scheduled_at).toISOString(),
      status: "scheduled",
      moderator_id: newMeeting.moderator_id || null,
      created_by: user?.id,
    }).select().maybeSingle();

    if (meeting) {
      const agenda = DEFAULT_AGENDAS[newMeeting.type];
      if (agenda.length > 0) {
        await supabase.from("meeting_agenda_items").insert(
          agenda.map((a, i) => ({ meeting_id: meeting.id, title: a.title, duration_minutes: a.duration, sort_order: i }))
        );
      }
      logAudit(user?.id ?? null, "meeting.create", "meetings", meeting.id, { type: newMeeting.type });
    }

    setCreating(false);
    setShowCreate(false);
    await fetchMeetings();
  };

  const updateMeetingStatus = async (id: string, status: Meeting["status"]) => {
    const updates: Record<string, unknown> = { status };
    if (status === "in_progress") updates.started_at = new Date().toISOString();
    if (status === "completed") updates.ended_at = new Date().toISOString();
    await supabase.from("meetings").update(updates).eq("id", id);
    logAudit(user?.id ?? null, "meeting.status", "meetings", id, { status });
    await fetchMeetings();
    if (showDetail?.id === id) setShowDetail(p => p ? { ...p, status, ...updates } as MeetingFull : null);
  };

  const completeAgendaItem = async (meetingId: string, itemId: string) => {
    await supabase.from("meeting_agenda_items").update({ completed_at: new Date().toISOString() }).eq("id", itemId);
    await fetchMeetings();
    if (showDetail?.id === meetingId) {
      setShowDetail(p => p ? {
        ...p,
        agenda_items: p.agenda_items?.map(a => a.id === itemId ? { ...a, completed_at: new Date().toISOString() } : a),
      } : null);
    }
  };

  const addDecision = async () => {
    if (!showDetail || !newDecision.description.trim()) return;
    setAddingDecision(true);

    let createdTaskId: string | null = null;
    if (newDecision.createTask && newDecision.responsible_user_id) {
      const { data: task } = await supabase.from("tasks").insert({
        title: newDecision.description.trim(),
        category: "Drift",
        priority: "Medel",
        store_id: activeStore?.id ?? null,
        assigned_to: newDecision.responsible_user_id,
        created_by: user?.id,
        due_date: newDecision.due_date ? new Date(newDecision.due_date).toISOString() : null,
        status: "todo",
      }).select().maybeSingle();
      if (task) {
        createdTaskId = task.id;
        if (newDecision.responsible_user_id !== user?.id) {
          createNotification(
            newDecision.responsible_user_id,
            "task_assigned",
            `Mötesuppgift: ${newDecision.description.slice(0, 60)}`,
            `Från möte: ${showDetail.title}`,
            "/uppgifter",
          );
        }
      }
    }

    await supabase.from("meeting_decisions").insert({
      meeting_id: showDetail.id,
      description: newDecision.description.trim(),
      responsible_user_id: newDecision.responsible_user_id || null,
      due_date: newDecision.due_date || null,
      created_task_id: createdTaskId,
      created_by: user?.id,
    });

    logAudit(user?.id ?? null, "meeting.decision.add", "meeting_decisions", showDetail.id, { description: newDecision.description });

    setNewDecision({ description: "", responsible_user_id: "", due_date: "", createTask: false });
    setAddingDecision(false);
    await fetchMeetings();
    const { data: updated } = await supabase
      .from("meetings")
      .select("*, moderator:app_users!moderator_id(id,display_name), agenda_items:meeting_agenda_items(*), decisions:meeting_decisions(*, responsible:app_users!responsible_user_id(id,display_name))")
      .eq("id", showDetail.id)
      .maybeSingle();
    if (updated) setShowDetail(updated as MeetingFull);
  };

  const typeInfo = (type: Meeting["meeting_type"]) => MEETING_TYPES.find(t => t.value === type);

  const upcoming = meetings.filter(m => m.status === "scheduled" || m.status === "in_progress");
  const past = meetings.filter(m => m.status === "completed" || m.status === "cancelled");

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Möten"
        description={activeStore ? `Möteshantering för ${activeStore.name}` : "Strukturerade möten med tidsbudget och beslutslogg."}
        actions={
          isManager ? (
            <Button className="rounded-full" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nytt möte
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : (
        <div className="space-y-8">
          {/* Upcoming / In progress */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Planerade & pågående</h2>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-12 text-center">
                <Calendar className="mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Inga planerade möten</p>
                {isManager && (
                  <Button size="sm" className="mt-4 rounded-full" onClick={() => setShowCreate(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Skapa möte
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((m) => {
                  const info = typeInfo(m.meeting_type);
                  const decisionsCount = m.decisions?.length ?? 0;
                  const doneItems = m.agenda_items?.filter(a => a.completed_at).length ?? 0;
                  const totalItems = m.agenda_items?.length ?? 0;
                  return (
                    <div
                      key={m.id}
                      className="cursor-pointer rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)]"
                      onClick={() => setShowDetail(m)}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-sm">{m.title}</p>
                          <p className="text-xs text-muted-foreground">{info?.label}</p>
                        </div>
                        {statusBadge(m.status)}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(m.scheduled_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                        <span className="ml-1">· {info?.defaultDurationMin} min</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{totalItems > 0 ? `${doneItems}/${totalItems} punkter` : "Ingen agenda"}</span>
                        {decisionsCount > 0 && <span>{decisionsCount} beslut</span>}
                      </div>
                      {totalItems > 0 && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneItems / totalItems) * 100}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past meetings */}
          {past.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tidigare möten</h2>
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Möte</th>
                      <th className="hidden px-5 py-3 text-left text-xs font-medium text-muted-foreground sm:table-cell">Typ</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Datum</th>
                      <th className="hidden px-5 py-3 text-center text-xs font-medium text-muted-foreground md:table-cell">Beslut</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {past.slice(0, 10).map((m) => (
                      <tr key={m.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setShowDetail(m)}>
                        <td className="px-5 py-3 font-medium">{m.title}</td>
                        <td className="hidden px-5 py-3 text-xs text-muted-foreground sm:table-cell">{typeInfo(m.meeting_type)?.label}</td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {new Date(m.scheduled_at).toLocaleDateString("sv-SE")}
                        </td>
                        <td className="hidden px-5 py-3 text-center text-xs text-muted-foreground md:table-cell">
                          {m.decisions?.length ?? 0}
                        </td>
                        <td className="px-5 py-3 text-center">{statusBadge(m.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile FAB */}
      {isManager && (
        <button
          className="fixed bottom-6 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lg)] transition-transform active:scale-95 lg:hidden"
          aria-label="Nytt möte"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* CREATE DIALOG */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nytt möte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Mötestyp</Label>
              <div className="grid grid-cols-2 gap-2">
                {MEETING_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setNewMeeting(p => ({ ...p, type: t.value, title: t.label }))}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left text-xs transition-colors",
                      newMeeting.type === t.value ? "border-primary bg-primary-soft text-primary" : "border-border/60 bg-card hover:bg-muted/40"
                    )}
                  >
                    <p className="font-semibold">{t.label}</p>
                    <p className="text-muted-foreground mt-0.5 leading-snug line-clamp-2">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Titel</Label>
              <Input
                value={newMeeting.title}
                onChange={(e) => setNewMeeting(p => ({ ...p, title: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Datum & tid</Label>
              <input
                type="datetime-local"
                value={newMeeting.scheduled_at}
                onChange={(e) => setNewMeeting(p => ({ ...p, scheduled_at: e.target.value }))}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moderator</Label>
              <Select value={newMeeting.moderator_id || "__none"} onValueChange={(v) => setNewMeeting(p => ({ ...p, moderator_id: v === "__none" ? "" : v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Ingen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Ingen</SelectItem>
                  {storeUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowCreate(false)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" disabled={creating || !newMeeting.title.trim()} onClick={createMeeting}>
                {creating ? "Skapar..." : "Skapa möte"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG */}
      <Dialog open={!!showDetail} onOpenChange={(o) => { if (!o) setShowDetail(null); }}>
        {showDetail && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3 pr-6">
                <div>
                  <DialogTitle className="text-base">{showDetail.title}</DialogTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {typeInfo(showDetail.meeting_type)?.label} · {new Date(showDetail.scheduled_at).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {statusBadge(showDetail.status)}
              </div>
            </DialogHeader>

            <div className="space-y-6">
              {/* Status actions */}
              {isManager && (
                <div className="flex flex-wrap gap-2">
                  {showDetail.status === "scheduled" && (
                    <Button size="sm" className="rounded-full gap-1.5" onClick={() => updateMeetingStatus(showDetail.id, "in_progress")}>
                      <Play className="h-3.5 w-3.5" /> Starta möte
                    </Button>
                  )}
                  {showDetail.status === "in_progress" && (
                    <Button size="sm" className="rounded-full gap-1.5 bg-success hover:bg-success/90" onClick={() => updateMeetingStatus(showDetail.id, "completed")}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Avsluta möte
                    </Button>
                  )}
                  {(showDetail.status === "scheduled" || showDetail.status === "in_progress") && (
                    <Button size="sm" variant="outline" className="rounded-full gap-1.5 text-muted-foreground" onClick={() => updateMeetingStatus(showDetail.id, "cancelled")}>
                      <X className="h-3.5 w-3.5" /> Ställ in
                    </Button>
                  )}
                </div>
              )}

              {/* Agenda */}
              {showDetail.agenda_items && showDetail.agenda_items.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</h3>
                  <div className="space-y-2">
                    {[...showDetail.agenda_items].sort((a, b) => a.sort_order - b.sort_order).map((item) => {
                      const done = !!item.completed_at;
                      return (
                        <div key={item.id} className={cn(
                          "rounded-xl border p-3 transition-colors",
                          done ? "border-success/30 bg-success/5 opacity-70" : "border-border/60 bg-card"
                        )}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {done
                                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                                : <Clock className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                              }
                              <span className={cn("text-sm font-medium truncate", done && "line-through text-muted-foreground")}>{item.title}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">{item.duration_minutes} min</span>
                            </div>
                            {showDetail.status === "in_progress" && !done && (
                              <AgendaTimer item={item} onComplete={() => completeAgendaItem(showDetail.id, item.id)} />
                            )}
                          </div>
                          {item.description && <p className="mt-1.5 pl-6 text-xs text-muted-foreground">{item.description}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Decisions */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Beslut & åtgärder ({showDetail.decisions?.length ?? 0})
                </h3>
                {showDetail.decisions && showDetail.decisions.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {showDetail.decisions.map((d) => (
                      <div key={d.id} className="rounded-xl border border-border/60 bg-card p-3">
                        <p className="text-sm">{d.description}</p>
                        <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {d.responsible && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{d.responsible.display_name}</span>}
                          {d.due_date && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(d.due_date).toLocaleDateString("sv-SE")}</span>}
                          {d.created_task_id && <Badge className="bg-primary-soft text-primary text-[10px]">Uppgift skapad</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(showDetail.status === "in_progress" || showDetail.status === "scheduled") && isManager && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Lägg till beslut</p>
                    <Textarea
                      value={newDecision.description}
                      onChange={(e) => setNewDecision(p => ({ ...p, description: e.target.value }))}
                      placeholder="Beskriv beslutet eller åtgärden..."
                      rows={2}
                      className="resize-none text-sm"
                    />
                    <div className="flex gap-2">
                      <Select value={newDecision.responsible_user_id || "__none"} onValueChange={(v) => setNewDecision(p => ({ ...p, responsible_user_id: v === "__none" ? "" : v }))}>
                        <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Ansvarig" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Ingen</SelectItem>
                          {storeUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <input
                        type="date"
                        value={newDecision.due_date}
                        onChange={(e) => setNewDecision(p => ({ ...p, due_date: e.target.value }))}
                        className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs"
                      />
                    </div>
                    {newDecision.responsible_user_id && (
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={newDecision.createTask}
                          onChange={(e) => setNewDecision(p => ({ ...p, createTask: e.target.checked }))}
                          className="h-3.5 w-3.5"
                        />
                        Skapa uppgift automatiskt och tilldela ansvarig
                      </label>
                    )}
                    <div className="flex justify-end">
                      <Button size="sm" className="rounded-full gap-1.5" disabled={addingDecision || !newDecision.description.trim()} onClick={addDecision}>
                        {addingDecision ? "Sparar..." : <><Plus className="h-3.5 w-3.5" /> Lägg till</>}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              {showDetail.notes && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anteckningar</h3>
                  <p className="text-sm text-muted-foreground">{showDetail.notes}</p>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
