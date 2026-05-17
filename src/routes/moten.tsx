import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Plus, Play, Square, CircleCheck as CheckCircle2, Clock, Users, X, Calendar, ChevronRight } from "lucide-react";
import { supabase, type Meeting, getSessionToken } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDate, formatDateTime, statusColor, statusLabel } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/moten")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: MotenPage,
});

const MEETING_TYPES: Record<string, string> = {
  ledningsgrupp: "Ledningsgruppsmöte",
  saljledare: "Säljledarmöte",
  daglig_styrning: "Daglig styrning",
  veckostamning: "Veckostämning",
};

function MotenPage() {
  const { user, activeStore } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Meeting | null>(null);

  const load = useCallback(async () => {
    if (!activeStore) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("meetings")
      .select("*, meeting_agenda_items(*), stores(name)")
      .eq("store_id", activeStore.id)
      .order("scheduled_at", { ascending: false });
    setMeetings((data ?? []) as Meeting[]);
    setLoading(false);
  }, [activeStore]);

  useEffect(() => { load(); }, [load]);

  async function startMeeting(id: string) {
    await supabase.from("meetings").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", id);
    toast.success("Möte startat");
    load();
    const updated = meetings.find(m => m.id === id);
    if (updated) setSelected({ ...updated, status: "in_progress", started_at: new Date().toISOString() });
  }

  async function endMeeting(id: string) {
    await supabase.from("meetings").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", id);
    toast.success("Möte avslutat");
    load();
    setSelected(null);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Möten</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeStore?.name}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Planera möte
        </button>
      </div>

      {/* Active meetings */}
      {meetings.filter(m => m.status === "in_progress").map(m => (
        <div key={m.id} className="bg-primary-soft border border-primary/30 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{MEETING_TYPES[m.meeting_type] ?? m.meeting_type}</p>
            <p className="text-xs text-muted-foreground">Startade {formatDateTime(m.started_at ?? "")}</p>
          </div>
          <button onClick={() => setSelected(m)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
            Öppna <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse h-20" />)
        ) : meetings.filter(m => m.status !== "in_progress").length === 0 ? (
          <div className="py-12 text-center bg-card border border-border rounded-2xl">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Inga möten planerade</p>
          </div>
        ) : (
          meetings.filter(m => m.status !== "in_progress").map(m => (
            <div
              key={m.id}
              onClick={() => setSelected(m)}
              className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{MEETING_TYPES[m.meeting_type] ?? m.meeting_type}</p>
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0", statusColor(m.status))}>
                      {statusLabel(m.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(m.scheduled_at)}
                    </span>
                    {m.meeting_agenda_items && (
                      <span className="text-xs text-muted-foreground">
                        {m.meeting_agenda_items.length} punkter
                      </span>
                    )}
                  </div>
                </div>
                {m.status === "scheduled" && (user?.role === "manager" || user?.role === "admin") && (
                  <button
                    onClick={e => { e.stopPropagation(); startMeeting(m.id); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium shrink-0"
                  >
                    <Play className="w-3 h-3" />
                    Starta
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <MeetingDialog
          activeStore={activeStore}
          userId={user?.id ?? ""}
          onClose={() => setShowCreate(false)}
          onSave={() => { setShowCreate(false); load(); }}
        />
      )}

      {selected && (
        <MeetingDetailDialog
          meeting={selected}
          onClose={() => { setSelected(null); load(); }}
          onEnd={() => endMeeting(selected.id)}
          isManager={user?.role === "manager" || user?.role === "admin"}
          userId={user?.id ?? ""}
          storeId={activeStore?.id ?? ""}
        />
      )}
    </div>
  );
}

function MeetingDialog({ activeStore, userId, onClose, onSave }: {
  activeStore: { id: string } | null; userId: string; onClose: () => void; onSave: () => void;
}) {
  const [type, setType] = useState<Meeting["meeting_type"]>("daglig_styrning");
  const [scheduledAt, setScheduledAt] = useState(new Date().toISOString().slice(0, 16));
  const [agendaItems, setAgendaItems] = useState<{ title: string; duration: number }[]>([
    { title: "Genomgång av gårdagen", duration: 5 },
    { title: "Dagens prioriteringar", duration: 10 },
    { title: "Övrigt", duration: 5 },
  ]);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!activeStore) return;
    setSaving(true);
    try {
      const { data } = await supabase.from("meetings").insert({
        meeting_type: type,
        title: MEETING_TYPES[type],
        store_id: activeStore.id,
        scheduled_at: scheduledAt,
        status: "scheduled",
        created_by: userId,
        moderator_id: userId,
        notes: "",
      }).select().single();
      if (data && agendaItems.length > 0) {
        await supabase.from("meeting_agenda_items").insert(
          agendaItems.map((item, i) => ({
            meeting_id: data.id,
            title: item.title,
            description: "",
            duration_minutes: item.duration,
            sort_order: i,
          }))
        );
      }
      toast.success("Möte skapat");
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
          <h2 className="font-semibold">Planera möte</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mötestyp</label>
            <select value={type} onChange={e => setType(e.target.value as Meeting["meeting_type"])} className={inputCls}>
              {Object.entries(MEETING_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum & tid</label>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dagordning</label>
            {agendaItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm bg-muted/50 rounded-xl px-3 py-2 text-foreground">{item.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{item.duration} min</span>
                <button onClick={() => setAgendaItems(a => a.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { setAgendaItems(a => [...a, { title: newItem.trim(), duration: 5 }]); setNewItem(""); } }}
                placeholder="Ny punkt..."
                className={cn(inputCls, "flex-1")}
              />
              <button
                onClick={() => { if (newItem.trim()) { setAgendaItems(a => [...a, { title: newItem.trim(), duration: 5 }]); setNewItem(""); } }}
                className="px-3 h-10 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium"
              >+</button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Avbryt</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
              {saving ? "Sparar..." : "Spara"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MeetingDetailDialog({ meeting, onClose, onEnd, isManager, userId, storeId }: {
  meeting: Meeting; onClose: () => void; onEnd: () => void;
  isManager: boolean; userId: string; storeId: string;
}) {
  const [decisions, setDecisions] = useState<{ description: string; responsible: string }[]>([]);
  const [newDecision, setNewDecision] = useState("");
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function saveAndEnd() {
    setSaving(true);
    try {
      await supabase.from("meetings").update({ notes, status: meeting.status === "in_progress" ? "completed" : meeting.status, ended_at: meeting.status === "in_progress" ? new Date().toISOString() : undefined }).eq("id", meeting.id);
      for (const d of decisions) {
        const { data: decisionRec } = await supabase.from("meeting_decisions").insert({
          meeting_id: meeting.id,
          description: d.description,
          responsible_user_id: userId,
          due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        }).select().single();
        // Create task from decision
        if (decisionRec) {
          await supabase.from("tasks").insert({
            title: d.description,
            description: `Åtgärdspunkt från möte: ${MEETING_TYPES[meeting.meeting_type]}`,
            category: "Administration",
            store_id: storeId,
            assigned_to: userId,
            created_by: userId,
            priority: "Medel",
            status: "todo",
            due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          });
        }
      }
      toast.success("Möte sparat");
      onEnd();
    } catch (e: unknown) {
      toast.error("Fel: " + String(e));
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold text-foreground">{MEETING_TYPES[meeting.meeting_type]}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(meeting.scheduled_at)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4" data-scroll-container>
          {/* Agenda */}
          {meeting.meeting_agenda_items && meeting.meeting_agenda_items.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Dagordning</h3>
              <div className="space-y-1.5">
                {meeting.meeting_agenda_items.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50">
                    <span className="text-xs text-muted-foreground font-medium w-5 shrink-0">{i + 1}.</span>
                    <p className="text-sm text-foreground flex-1">{item.title}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{item.duration_minutes} min</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Anteckningar</h3>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notera viktiga diskussioner och beslut..."
              rows={4}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Decisions / Action items */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Åtgärdspunkter</h3>
            {decisions.map((d, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span className="text-sm text-foreground flex-1">{d.description}</span>
                <button onClick={() => setDecisions(dd => dd.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                value={newDecision}
                onChange={e => setNewDecision(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newDecision.trim()) { setDecisions(d => [...d, { description: newDecision.trim(), responsible: userId }]); setNewDecision(""); } }}
                placeholder="Ny åtgärdspunkt..."
                className="flex-1 h-9 px-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => { if (newDecision.trim()) { setDecisions(d => [...d, { description: newDecision.trim(), responsible: userId }]); setNewDecision(""); } }}
                className="px-3 h-9 rounded-xl bg-muted text-sm font-medium"
              >+</button>
            </div>
          </div>
        </div>
        {isManager && (
          <div className="px-5 pb-5 pt-3 border-t border-border shrink-0">
            <button onClick={saveAndEnd} disabled={saving} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
              {saving ? "Sparar..." : meeting.status === "in_progress" ? "Avsluta möte & spara" : "Spara ändringar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
