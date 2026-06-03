import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Calendar, CircleCheck as CheckCircle2, Clock, Download, GripVertical, Pause, Pencil, Play, Plus, Search, Settings, Trash2, Users, X, FileText, Upload,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  supabase,
  type Meeting, type MeetingAgendaItem, type MeetingDecision, type AppUser, type MeetingType,
  logAudit, createNotification,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/moten")({
  component: MeetingsPage,
});

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

type AgendaItem = { title: string; duration: number };

function MeetingsPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  // Wake lock: keep screen on during active meetings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockRef = useRef<any>(null);
  const acquireWakeLock = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ("wakeLock" in navigator && !wakeLockRef.current) {
      try { wakeLockRef.current = await (navigator as any).wakeLock.request("screen"); } catch {}
    }
  };
  const releaseWakeLock = () => {
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
  };
  useEffect(() => () => releaseWakeLock(), []);

  const [meetings, setMeetings] = useState<MeetingFull[]>([]);
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [storeUsers, setStoreUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [newMeeting, setNewMeeting] = useState<{
    typeValue: string;
    title: string;
    scheduled_at: string;
    moderator_id: string;
  }>({
    typeValue: "",
    title: "",
    scheduled_at: (() => { const d = new Date(); d.setMinutes(0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })(),
    moderator_id: "",
  });
  const [creating, setCreating] = useState(false);

  // Manage types dialog
  const [showManageTypes, setShowManageTypes] = useState(false);
  const [typeForm, setTypeForm] = useState<{
    label: string;
    description: string;
    default_duration_min: number;
    default_agenda: AgendaItem[];
  }>({ label: "", description: "", default_duration_min: 30, default_agenda: [] });
  const [editTypeTarget, setEditTypeTarget] = useState<MeetingType | null>(null);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<MeetingType | null>(null);
  const [savingType, setSavingType] = useState(false);
  const [dragTypeIdx, setDragTypeIdx] = useState<number | null>(null);
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());
  const [typeSearch, setTypeSearch] = useState("");
  const [bulkDeleteTypesOpen, setBulkDeleteTypesOpen] = useState(false);

  const csvImportRef = useRef<HTMLInputElement>(null);
  const [importingCsv, setImportingCsv] = useState(false);

  // Detail / edit / delete
  const [showDetail, setShowDetail] = useState<MeetingFull | null>(null);
  const [newDecision, setNewDecision] = useState({ description: "", responsible_user_id: "", due_date: "", createTask: false });
  const [decisionUserSearch, setDecisionUserSearch] = useState("");
  const [decisionUserOpen, setDecisionUserOpen] = useState(false);
  const [addingDecision, setAddingDecision] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MeetingFull | null>(null);
  const [editTarget, setEditTarget] = useState<MeetingFull | null>(null);
  const [editForm, setEditForm] = useState({ title: "", scheduled_at: "", moderator_id: "" });
  const [editSaving, setEditSaving] = useState(false);

  const exportMeetingPdf = (m: MeetingFull) => {
    const typeLabel = meetingTypes.find(t => t.value === m.meeting_type)?.label ?? m.meeting_type;
    const dateStr = new Date(m.scheduled_at).toLocaleString("sv-SE", { dateStyle: "full", timeStyle: "short" });
    const agendaItems = [...(m.agenda_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const decisions = m.decisions ?? [];

    const rows = (items: { label: string; value: string }[]) =>
      items.map(({ label, value }) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;white-space:nowrap;width:30%">${label}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827">${value}</td>
        </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8"/>
<title>Mötesprotokoll · ${m.title}</title>
<style>
  @page { margin: 20mm; }
  body { font-family: system-ui,-apple-system,sans-serif; color:#111827; margin:0; }
  h1 { font-size:1.4rem; margin:0 0 4px; }
  .sub { color:#6b7280; font-size:.85rem; margin:0 0 24px; }
  h2 { font-size:.8rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; margin:24px 0 8px; border-bottom:1px solid #e5e7eb; padding-bottom:4px; }
  table { width:100%; border-collapse:collapse; }
  .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:.72rem; font-weight:600; }
  .badge-done { background:#d1fae5; color:#065f46; }
  .badge-pending { background:#f3f4f6; color:#374151; }
  .decision { padding:10px 14px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:8px; }
  .decision-meta { font-size:.75rem; color:#6b7280; margin-top:4px; }
  .footer { margin-top:32px; font-size:.7rem; color:#9ca3af; border-top:1px solid #e5e7eb; padding-top:8px; }
  @media print { .no-print { display:none; } }
</style>
</head>
<body>
<h1>${m.title}</h1>
<p class="sub">${typeLabel} · ${dateStr}</p>
<h2>Mötesinfo</h2>
<table>${rows([
  { label: "Status", value: { scheduled: "Planerat", in_progress: "Pågår", completed: "Slutfört", cancelled: "Inställt" }[m.status] ?? m.status },
  ...(m.moderator ? [{ label: "Moderator", value: (m.moderator as { display_name: string }).display_name }] : []),
  ...(m.started_at ? [{ label: "Startade", value: new Date(m.started_at).toLocaleString("sv-SE") }] : []),
  ...(m.ended_at ? [{ label: "Avslutades", value: new Date(m.ended_at).toLocaleString("sv-SE") }] : []),
])}</table>

${agendaItems.length > 0 ? `<h2>Agenda</h2>
<table>${agendaItems.map(item => `
<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;width:3%">${item.sort_order + 1}.</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827">${item.title}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;white-space:nowrap">${item.duration_minutes} min</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">
    <span class="badge ${item.completed_at ? "badge-done" : "badge-pending"}">${item.completed_at ? "Klar" : "Ej klar"}</span>
  </td>
</tr>`).join("")}</table>` : ""}

${decisions.length > 0 ? `<h2>Beslut & åtgärder (${decisions.length} st)</h2>
${decisions.map((d, i) => {
  const resp = (d.responsible as { display_name: string } | null)?.display_name;
  const due = d.due_date ? new Date(d.due_date).toLocaleDateString("sv-SE") : null;
  return `<div class="decision">
  <div>${i + 1}. ${d.description}</div>
  <div class="decision-meta">${[resp ? `Ansvarig: ${resp}` : null, due ? `Senast: ${due}` : null, d.created_task_id ? "Uppgift skapad" : null].filter(Boolean).join(" · ")}</div>
</div>`;
}).join("")}` : ""}

${m.notes ? `<h2>Anteckningar</h2><p style="color:#374151;font-size:.875rem;">${m.notes}</p>` : ""}

<div class="footer">Protokoll exporterat ${new Date().toLocaleString("sv-SE")} · StoreFlow</div>
</body>
</html>`;

    // Use a hidden iframe to avoid popup-blocker issues
    const existing = document.getElementById("sf-print-frame");
    if (existing) existing.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "sf-print-frame";
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;border:0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 300);
  };

  const exportMeetingsCSV = () => {
    if (meetings.length === 0) return;
    const header = "ID;Titel;Typ;Datum;Status;Moderator;Agenda-punkter;Beslut";
    const rows = meetings.map(m => {
      const typeLabel = meetingTypes.find(t => t.value === m.meeting_type)?.label ?? m.meeting_type;
      const agendaStr = [...(m.agenda_items ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(ai => ai.title).join(" | ");
      const decisionsStr = (m.decisions ?? []).map(d => d.description).join(" | ");
      const cells = [
        m.id,
        m.title,
        typeLabel,
        new Date(m.scheduled_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }),
        m.status,
        m.moderator?.display_name ?? "",
        agendaStr,
        decisionsStr,
      ];
      return cells.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moten-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const MEETING_CSV_HEADER = "Titel;Typ (typvärde);Datum (YYYY-MM-DD HH:MM);Moderator (visningsnamn);Agenda (punkt1|punkt2);Beslut (beslut1|beslut2)";

  const downloadMeetingTemplate = () => {
    const example = [
      MEETING_CSV_HEADER,
      '"Veckomöte";"weekly";"2026-06-10 09:00";"Anna Svensson";"Genomgång vecka|Avvikelser";"Minska svinn|Förbättra mottagning"',
      '"Månadsmöte";"monthly";"2026-07-01 13:00";"Erik Johansson";"Budget|Personal";""',
    ].join("\n");
    const blob = new Blob(["\uFEFF" + example], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "moten-mall.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importMeetingsCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setImportingCsv(true);
    try {
      const text = await file.text();
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).slice(1);

      function parseRow(line: string): string[] {
        const cols: string[] = []; let cur = ""; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
          else if (ch === ";" && !inQ) { cols.push(cur); cur = ""; }
          else { cur += ch; }
        }
        cols.push(cur);
        return cols;
      }

      for (const line of lines) {
        const [title, typeValue, dateStr, moderatorName, agendaStr, decisionsStr] = parseRow(line);
        if (!title?.trim()) continue;

        // Resolve date
        let scheduledAt: string;
        try { scheduledAt = new Date(dateStr?.trim() ?? "").toISOString(); }
        catch { scheduledAt = new Date().toISOString(); }

        // Resolve moderator
        const mod = storeUsers.find(u => u.display_name?.toLowerCase() === (moderatorName ?? "").trim().toLowerCase());

        const { data: meeting } = await supabase.from("meetings").insert({
          title: title.trim(),
          meeting_type: typeValue?.trim() || "other",
          store_id: activeStore?.id ?? null,
          scheduled_at: scheduledAt,
          moderator_id: mod?.id ?? user.id,
          status: "scheduled",
          created_by: user.id,
        }).select("id").maybeSingle();

        if (meeting?.id) {
          // Insert agenda items
          const agendaItems = (agendaStr ?? "").split("|").map(s => s.trim()).filter(Boolean);
          if (agendaItems.length > 0) {
            await supabase.from("meeting_agenda_items").insert(
              agendaItems.map((title, i) => ({ meeting_id: meeting.id, title, sort_order: i + 1, duration_minutes: 5 }))
            );
          }
          // Insert decisions
          const decisions = (decisionsStr ?? "").split("|").map(s => s.trim()).filter(Boolean);
          if (decisions.length > 0) {
            await supabase.from("meeting_decisions").insert(
              decisions.map(description => ({ meeting_id: meeting.id, description, created_by: user.id }))
            );
          }
        }
      }
      await fetchMeetings();
    } finally {
      setImportingCsv(false);
    }
  };

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

  const fetchMeetingTypes = async () => {
    const { data } = await supabase.from("meeting_types").select("*").eq("is_active", true).order("sort_order");
    if (data) {
      const typed = (data as (Omit<MeetingType, "default_agenda"> & { default_agenda: unknown })[]).map(t => ({
        ...t,
        default_agenda: Array.isArray(t.default_agenda) ? (t.default_agenda as AgendaItem[]) : [],
      }));
      setMeetingTypes(typed as MeetingType[]);
      // Set first type as default if not already set
      if (typed.length > 0) {
        setNewMeeting(prev => prev.typeValue ? prev : { ...prev, typeValue: typed[0].value, title: typed[0].label });
      }
    }
  };

  useEffect(() => {
    fetchMeetings();
    fetchMeetingTypes();
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
      meeting_type: newMeeting.typeValue,
      title: newMeeting.title.trim(),
      store_id: activeStore?.id ?? null,
      scheduled_at: new Date(newMeeting.scheduled_at).toISOString(),
      status: "scheduled",
      moderator_id: newMeeting.moderator_id || null,
      created_by: user?.id,
    }).select().maybeSingle();

    if (meeting) {
      const typeData = meetingTypes.find(t => t.value === newMeeting.typeValue);
      const agenda = typeData?.default_agenda ?? [];
      if (agenda.length > 0) {
        await supabase.from("meeting_agenda_items").insert(
          agenda.map((a, i) => ({ meeting_id: meeting.id, title: a.title, duration_minutes: a.duration, sort_order: i }))
        );
      }
      logAudit(user?.id ?? null, "meeting.create", "meetings", meeting.id, { type: newMeeting.typeValue });
    }

    setCreating(false);
    setShowCreate(false);
    await fetchMeetings();
  };

  // ── Manage meeting types ───────────────────────────────────────────────────

  const openNewType = () => {
    setEditTypeTarget(null);
    setTypeForm({ label: "", description: "", default_duration_min: 30, default_agenda: [{ title: "", duration: 5 }] });
  };

  const openEditType = (t: MeetingType) => {
    setEditTypeTarget(t);
    setTypeForm({
      label: t.label,
      description: t.description,
      default_duration_min: t.default_duration_min,
      default_agenda: t.default_agenda.length > 0 ? [...t.default_agenda] : [{ title: "", duration: 5 }],
    });
  };

  const saveType = async () => {
    if (!typeForm.label.trim()) return;
    setSavingType(true);
    const validAgenda = typeForm.default_agenda.filter(a => a.title.trim());
    const payload = {
      label: typeForm.label.trim(),
      description: typeForm.description.trim(),
      default_duration_min: typeForm.default_duration_min,
      default_agenda: validAgenda,
      created_by: user?.id ?? null,
    };
    if (editTypeTarget) {
      await supabase.from("meeting_types").update(payload).eq("id", editTypeTarget.id);
    } else {
      const maxOrder = Math.max(-1, ...meetingTypes.map(t => t.sort_order));
      const slug = typeForm.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      await supabase.from("meeting_types").insert({ ...payload, value: `custom_${slug}_${Date.now()}`, sort_order: maxOrder + 1 });
    }
    setSavingType(false);
    setEditTypeTarget(null);
    await fetchMeetingTypes();
  };

  const deleteType = async () => {
    if (!deleteTypeTarget) return;
    await supabase.from("meeting_types").update({ is_active: false }).eq("id", deleteTypeTarget.id);
    setDeleteTypeTarget(null);
    await fetchMeetingTypes();
  };

  const reorderTypes = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const reordered = [...meetingTypes];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updated = reordered.map((t, i) => ({ ...t, sort_order: i }));
    setMeetingTypes(updated);
    await Promise.all(updated.map(t => supabase.from("meeting_types").update({ sort_order: t.sort_order }).eq("id", t.id)));
  };

  // ── Meeting actions ────────────────────────────────────────────────────────

  const updateMeetingStatus = async (id: string, status: Meeting["status"]) => {
    const updates: Record<string, unknown> = { status };
    if (status === "in_progress") { updates.started_at = new Date().toISOString(); void acquireWakeLock(); }
    if (status === "completed" || status === "cancelled") { updates.ended_at = new Date().toISOString(); releaseWakeLock(); }
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

  const deleteMeeting = async () => {
    if (!deleteTarget) return;
    await supabase.from("meeting_decisions").delete().eq("meeting_id", deleteTarget.id);
    await supabase.from("meeting_agenda_items").delete().eq("meeting_id", deleteTarget.id);
    await supabase.from("meetings").delete().eq("id", deleteTarget.id);
    logAudit(user?.id ?? null, "meeting.delete", "meetings", deleteTarget.id, { title: deleteTarget.title });
    setDeleteTarget(null);
    if (showDetail?.id === deleteTarget.id) setShowDetail(null);
    await fetchMeetings();
  };

  const openEditMeeting = (m: MeetingFull) => {
    setEditTarget(m);
    const d = new Date(m.scheduled_at);
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditForm({
      title: m.title,
      scheduled_at: localIso,
      moderator_id: m.moderator_id ?? "",
    });
  };

  const saveEditMeeting = async () => {
    if (!editTarget || !editForm.title.trim()) return;
    setEditSaving(true);
    await supabase.from("meetings").update({
      title: editForm.title.trim(),
      scheduled_at: new Date(editForm.scheduled_at).toISOString(),
      moderator_id: editForm.moderator_id || null,
    }).eq("id", editTarget.id);
    logAudit(user?.id ?? null, "meeting.edit", "meetings", editTarget.id, { title: editForm.title });
    setEditSaving(false);
    setEditTarget(null);
    if (showDetail?.id === editTarget.id) {
      setShowDetail(p => p ? { ...p, title: editForm.title.trim(), scheduled_at: new Date(editForm.scheduled_at).toISOString(), moderator_id: editForm.moderator_id || null } : null);
    }
    await fetchMeetings();
  };

  const typeInfo = (typeValue: string) => meetingTypes.find(t => t.value === typeValue);

  const upcoming = meetings.filter(m => m.status === "scheduled" || m.status === "in_progress");
  const past = meetings.filter(m => m.status === "completed" || m.status === "cancelled");

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Möten"
        description={activeStore ? `Möteshantering för ${activeStore.name}` : "Strukturerade möten med tidsbudget och beslutslogg."}
        actions={
          <div className="hidden lg:flex gap-2">
            {isManager && (
              <>
                <input ref={csvImportRef} type="file" accept=".csv" className="hidden" onChange={importMeetingsCsv} />
                <Button variant="outline" className="rounded-full" onClick={downloadMeetingTemplate}>
                  <Download className="mr-2 h-4 w-4" /> Mall
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => csvImportRef.current?.click()} disabled={importingCsv}>
                  <Upload className="mr-2 h-4 w-4" /> {importingCsv ? "Importerar..." : "Importera CSV"}
                </Button>
              </>
            )}
            {isManager && meetings.length > 0 && (
              <Button variant="outline" className="rounded-full" onClick={exportMeetingsCSV}>
                <Download className="mr-2 h-4 w-4" /> Exportera CSV
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="rounded-full" onClick={() => { setShowManageTypes(true); openNewType(); }}>
                <Settings className="mr-2 h-4 w-4" /> Mötestyper
              </Button>
            )}
            {isManager && (
              <Button className="rounded-full" onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> Nytt möte
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-4">
              <div className="h-12 w-12 animate-pulse rounded-xl bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-1/3 animate-pulse rounded-md bg-muted/60" />
              </div>
              <div className="h-5 w-20 animate-pulse rounded-full bg-muted/60 shrink-0" />
            </div>
          ))}
        </div>
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
                          <p className="text-xs text-muted-foreground">{info?.label ?? m.meeting_type}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {statusBadge(m.status)}
                          {isManager && (
                            <>
                              <button className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-primary" onClick={(e) => { e.stopPropagation(); openEditMeeting(m); }} aria-label="Redigera">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(m); }} aria-label="Ta bort">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(m.scheduled_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                        <span className="ml-1">· {info?.default_duration_min ?? "?"} min</span>
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
                        <td className="hidden px-5 py-3 text-xs text-muted-foreground sm:table-cell">{typeInfo(m.meeting_type)?.label ?? m.meeting_type}</td>
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
          className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lg)] transition-transform active:scale-95 lg:hidden"
          aria-label="Nytt möte"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* ── CREATE DIALOG ──────────────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setCreateStep(1); }}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <DialogTitle className="text-sm font-medium">Nytt möte</DialogTitle>
            <div className="flex items-center gap-1 sm:hidden ml-auto">
              <span className={cn("h-2 w-2 rounded-full transition-colors", createStep === 1 ? "bg-primary" : "bg-muted-foreground/30")} />
              <span className={cn("h-2 w-2 rounded-full transition-colors", createStep === 2 ? "bg-primary" : "bg-muted-foreground/30")} />
            </div>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Step 1: Type + Title */}
            <div className={cn(createStep === 2 && "hidden sm:block")}>
              <div className="space-y-1.5 mb-4">
                <Label className="text-xs">Mötestyp</Label>
                <TooltipProvider delayDuration={300}>
                  <div className="grid grid-cols-2 gap-2">
                    {meetingTypes.map((t) => (
                      <Tooltip key={t.value}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setNewMeeting(p => ({ ...p, typeValue: t.value, title: t.label }))}
                            className={cn(
                              "rounded-xl border px-3 py-2.5 text-left text-xs transition-colors",
                              newMeeting.typeValue === t.value ? "border-primary bg-primary-soft text-primary" : "border-border/60 bg-card hover:bg-muted/40"
                            )}
                          >
                            <p className="font-semibold">{t.label}</p>
                            {t.description && (
                              <p className="text-muted-foreground mt-0.5 leading-snug line-clamp-2">{t.description}</p>
                            )}
                          </button>
                        </TooltipTrigger>
                        {t.description && (
                          <TooltipContent side="bottom" className="max-w-xs text-xs">
                            {t.description}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Titel</Label>
                <Input
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting(p => ({ ...p, title: e.target.value }))}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Step 2: Date + Moderator */}
            <div className={cn(createStep === 1 && "hidden sm:block")}>
              <div className="space-y-1.5 mb-4">
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
            </div>

            {/* Navigation */}
            <div className="flex justify-between gap-2 pt-1">
              <div className="flex gap-2 sm:hidden">
                {createStep === 1 ? (
                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setShowCreate(false)}>Avbryt</Button>
                ) : (
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => setCreateStep(1)}>Tillbaka</Button>
                )}
              </div>
              <Button variant="outline" size="sm" className="rounded-full hidden sm:flex" onClick={() => setShowCreate(false)}>Avbryt</Button>
              <div className="flex gap-2">
                {createStep === 1 && (
                  <Button size="sm" className="rounded-full sm:hidden" disabled={!newMeeting.title.trim()} onClick={() => setCreateStep(2)}>
                    Nästa
                  </Button>
                )}
                {(createStep === 2 || true) && (
                  <Button size="sm" className={cn("rounded-full", createStep === 1 && "hidden sm:flex")} disabled={creating || !newMeeting.title.trim()} onClick={createMeeting}>
                    {creating ? "Skapar..." : "Skapa möte"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MANAGE TYPES DIALOG ────────────────────────────────────────────── */}
      <Dialog open={showManageTypes} onOpenChange={(o) => { setShowManageTypes(o); if (!o) { setSelectedTypeIds(new Set()); setTypeSearch(""); } }}>
        <DialogContent className="!w-[min(95vw,1100px)] !max-w-none h-[90vh] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-6 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Hantera mötestyper</DialogTitle>
                <p className="text-xs text-muted-foreground">{meetingTypes.length} typer totalt</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedTypeIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full h-8 gap-1.5"
                  onClick={() => setBulkDeleteTypesOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Ta bort {selectedTypeIds.size} st
                </Button>
              )}
              <Button size="sm" className="rounded-full h-8 gap-1.5" onClick={openNewType}>
                <Plus className="h-3.5 w-3.5" /> Ny typ
              </Button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: type list */}
            <div className="w-72 shrink-0 border-r border-border/60 flex flex-col overflow-hidden">
              {/* Search + select all */}
              <div className="p-3 border-b border-border/40 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={typeSearch}
                    onChange={(e) => setTypeSearch(e.target.value)}
                    placeholder="Sök mötestyp..."
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                {isManager && meetingTypes.length > 0 && (
                  <div className="flex items-center gap-2 px-1">
                    <Checkbox
                      id="select-all-types"
                      checked={meetingTypes.filter(t => !typeSearch || t.label.toLowerCase().includes(typeSearch.toLowerCase())).every(t => selectedTypeIds.has(t.id))}
                      onCheckedChange={(checked) => {
                        const visible = meetingTypes.filter(t => !typeSearch || t.label.toLowerCase().includes(typeSearch.toLowerCase()));
                        if (checked) setSelectedTypeIds(new Set([...selectedTypeIds, ...visible.map(t => t.id)]));
                        else { const next = new Set(selectedTypeIds); visible.forEach(t => next.delete(t.id)); setSelectedTypeIds(next); }
                      }}
                    />
                    <label htmlFor="select-all-types" className="text-xs text-muted-foreground cursor-pointer">Markera alla</label>
                  </div>
                )}
              </div>
              {/* List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {meetingTypes
                  .filter(t => !typeSearch || t.label.toLowerCase().includes(typeSearch.toLowerCase()))
                  .map((t, idx) => {
                    const realIdx = meetingTypes.indexOf(t);
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "group flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm cursor-pointer transition-colors select-none",
                          editTypeTarget?.id === t.id ? "bg-primary/10 text-primary" : "hover:bg-muted/40",
                          selectedTypeIds.has(t.id) && "bg-destructive/5 border border-destructive/20"
                        )}
                        draggable
                        onDragStart={() => setDragTypeIdx(realIdx)}
                        onDragEnd={() => setDragTypeIdx(null)}
                        onDragOver={(e) => { e.preventDefault(); if (dragTypeIdx !== null && dragTypeIdx !== realIdx) reorderTypes(dragTypeIdx, realIdx).then(() => setDragTypeIdx(realIdx)); }}
                        onClick={() => openEditType(t)}
                      >
                        {isManager && (
                          <Checkbox
                            checked={selectedTypeIds.has(t.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedTypeIds);
                              if (checked) next.add(t.id); else next.delete(t.id);
                              setSelectedTypeIds(next);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{t.label}</p>
                          {t.description && <p className="text-[11px] text-muted-foreground truncate">{t.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-muted-foreground tabular-nums">{t.default_duration_min}m</span>
                          {isManager && (
                            <button
                              className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive transition-opacity"
                              onClick={(e) => { e.stopPropagation(); setDeleteTypeTarget(t); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                {meetingTypes.filter(t => !typeSearch || t.label.toLowerCase().includes(typeSearch.toLowerCase())).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <p className="text-xs text-muted-foreground">Inga mötestyper{typeSearch ? " matchar sökningen" : ""}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: form */}
            <div className="flex-1 overflow-y-auto">
              {editTypeTarget !== null || !meetingTypes.length ? (
                <div className="p-6 space-y-5 max-w-lg">
                  <div>
                    <h3 className="text-sm font-semibold mb-4">{editTypeTarget ? "Redigera mötestyp" : "Ny mötestyp"}</h3>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Namn</Label>
                    <Input
                      value={typeForm.label}
                      onChange={(e) => setTypeForm(p => ({ ...p, label: e.target.value }))}
                      placeholder="T.ex. Leveransmöte"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Beskrivning</Label>
                    <Textarea
                      value={typeForm.description}
                      onChange={(e) => setTypeForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Kort beskrivning av mötestypen..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Standardlängd (minuter)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={480}
                      value={typeForm.default_duration_min}
                      onChange={(e) => setTypeForm(p => ({ ...p, default_duration_min: parseInt(e.target.value) || 30 }))}
                      className="w-32"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Standardagenda</Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setTypeForm(p => ({ ...p, default_agenda: [...p.default_agenda, { title: "", duration: 5 }] }))}
                      >
                        + Lägg till punkt
                      </button>
                    </div>
                    {typeForm.default_agenda.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={item.title}
                          onChange={(e) => setTypeForm(p => ({
                            ...p,
                            default_agenda: p.default_agenda.map((a, i) => i === idx ? { ...a, title: e.target.value } : a),
                          }))}
                          placeholder={`Punkt ${idx + 1}`}
                          className="flex-1 h-8 text-sm"
                        />
                        <Input
                          type="number"
                          min={1}
                          value={item.duration}
                          onChange={(e) => setTypeForm(p => ({
                            ...p,
                            default_agenda: p.default_agenda.map((a, i) => i === idx ? { ...a, duration: parseInt(e.target.value) || 5 } : a),
                          }))}
                          className="w-16 h-8 text-sm"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">min</span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setTypeForm(p => ({ ...p, default_agenda: p.default_agenda.filter((_, i) => i !== idx) }))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border/60">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setEditTypeTarget(null); setTypeSearch(""); }}>Avbryt</Button>
                    <Button size="sm" className="rounded-full" disabled={savingType || !typeForm.label.trim()} onClick={saveType}>
                      {savingType ? "Sparar..." : editTypeTarget ? "Spara ändringar" : "Skapa mötestyp"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-10">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Settings className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Välj en mötestyp att redigera</p>
                  <p className="text-xs text-muted-foreground mt-1">Klicka på en typ i listan eller skapa en ny</p>
                  <Button size="sm" className="mt-4 rounded-full gap-1.5" onClick={openNewType}>
                    <Plus className="h-3.5 w-3.5" /> Ny mötestyp
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 px-6 py-3 shrink-0 flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {selectedTypeIds.size > 0 ? `${selectedTypeIds.size} markerade` : "Dra för att ändra ordning"}
            </p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowManageTypes(false)}>Stäng</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── BULK DELETE TYPES CONFIRM ─────────────────────────────────────── */}
      <AlertDialog open={bulkDeleteTypesOpen} onOpenChange={setBulkDeleteTypesOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort {selectedTypeIds.size} mötestyper</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker? Befintliga möten av dessa typer påverkas inte men typerna tas bort från listan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await supabase.from("meeting_types").update({ is_active: false }).in("id", [...selectedTypeIds]);
                setSelectedTypeIds(new Set());
                setBulkDeleteTypesOpen(false);
                await fetchMeetingTypes();
              }}
            >
              Ta bort alla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── DETAIL DIALOG ──────────────────────────────────────────────────── */}
      <Dialog open={!!showDetail} onOpenChange={(o) => { if (!o) setShowDetail(null); }}>
        {showDetail && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="text-base">{showDetail.title}</DialogTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {typeInfo(showDetail.meeting_type)?.label ?? showDetail.meeting_type} · {new Date(showDetail.scheduled_at).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {statusBadge(showDetail.status)}
                  {isManager && (
                    <>
                      <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-primary" onClick={() => openEditMeeting(showDetail)} aria-label="Redigera">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-destructive" onClick={() => setDeleteTarget(showDetail)} aria-label="Ta bort">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6">
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
                  {showDetail.status === "completed" && (
                    <Button size="sm" variant="outline" className="rounded-full gap-1.5" onClick={() => exportMeetingPdf(showDetail)}>
                      <FileText className="h-3.5 w-3.5" /> Exportera protokoll
                    </Button>
                  )}
                </div>
              )}

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
                      <div className="relative flex-1">
                        <button
                          type="button"
                          onClick={() => setDecisionUserOpen(o => !o)}
                          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-xs"
                        >
                          <span className={newDecision.responsible_user_id ? "text-foreground" : "text-muted-foreground"}>
                            {newDecision.responsible_user_id
                              ? storeUsers.find(u => u.id === newDecision.responsible_user_id)?.display_name ?? "Ansvarig"
                              : "Ansvarig"}
                          </span>
                          <X className={cn("h-3 w-3 text-muted-foreground transition-opacity", newDecision.responsible_user_id ? "opacity-100 hover:text-destructive" : "opacity-0 pointer-events-none")}
                            onClick={(e) => { e.stopPropagation(); setNewDecision(p => ({ ...p, responsible_user_id: "" })); setDecisionUserOpen(false); }} />
                        </button>
                        {decisionUserOpen && (
                          <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-lg border border-border/60 bg-card shadow-lg">
                            <div className="p-2 border-b border-border/40">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  autoFocus
                                  type="text"
                                  value={decisionUserSearch}
                                  onChange={(e) => setDecisionUserSearch(e.target.value)}
                                  placeholder="Sök person..."
                                  className="w-full h-7 rounded-md border border-border/60 bg-background pl-7 pr-2 text-xs outline-none"
                                />
                              </div>
                            </div>
                            <div className="max-h-36 overflow-y-auto p-1">
                              <button
                                type="button"
                                onClick={() => { setNewDecision(p => ({ ...p, responsible_user_id: "" })); setDecisionUserOpen(false); setDecisionUserSearch(""); }}
                                className="w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
                              >
                                Ingen
                              </button>
                              {storeUsers
                                .filter(u => !decisionUserSearch || u.display_name.toLowerCase().includes(decisionUserSearch.toLowerCase()))
                                .map(u => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => { setNewDecision(p => ({ ...p, responsible_user_id: u.id })); setDecisionUserOpen(false); setDecisionUserSearch(""); }}
                                    className={cn("w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted/50", newDecision.responsible_user_id === u.id && "bg-primary/10 font-medium")}
                                  >
                                    {u.display_name}
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
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

      {/* ── EDIT DIALOG ────────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Redigera möte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Titel</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Datum & tid</Label>
              <input
                type="datetime-local"
                value={editForm.scheduled_at}
                onChange={(e) => setEditForm(p => ({ ...p, scheduled_at: e.target.value }))}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moderator</Label>
              <Select value={editForm.moderator_id || "__none"} onValueChange={(v) => setEditForm(p => ({ ...p, moderator_id: v === "__none" ? "" : v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Ingen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Ingen</SelectItem>
                  {storeUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditTarget(null)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" disabled={editSaving || !editForm.title.trim()} onClick={saveEditMeeting}>
                {editSaving ? "Sparar..." : "Spara ändringar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DELETE MEETING ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort möte</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort mötet <strong>{deleteTarget?.title}</strong>? Alla agendapunkter och beslut tas bort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteMeeting}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── DELETE TYPE CONFIRM ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTypeTarget} onOpenChange={(o) => !o && setDeleteTypeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort mötestyp</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort mötestypen <strong>{deleteTypeTarget?.label}</strong>? Befintliga möten av denna typ påverkas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteType}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
