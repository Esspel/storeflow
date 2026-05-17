import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Download, GripVertical, Upload, X, Repeat, Clock, TriangleAlert as AlertTriangle, Pencil, Store as StoreIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { supabase, type ChecklistTemplate, type ChecklistTemplateItem, type ChecklistTemplateQuestion, type Store, logAudit } from "@/lib/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RECURRENCE_OPTIONS = [
  { value: "", label: "Ingen" },
  { value: "daily", label: "Dagligen" },
  { value: "every_other_day", label: "Varannan dag" },
  { value: "weekly", label: "Varje vecka" },
  { value: "monthly", label: "Varje månad" },
  { value: "yearly", label: "Varje år" },
];
const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mallar")({
  component: MallarPage,
});

function MallarPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const [templates, setTemplates] = useState<(ChecklistTemplate & { storeIds: string[]; questions: ChecklistTemplateQuestion[] })[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTemplate | null>(null);
  const [editTarget, setEditTarget] = useState<(ChecklistTemplate & { storeIds: string[]; questions: ChecklistTemplateQuestion[] }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [broadcastConfirm, setBroadcastConfirm] = useState<"create" | "edit" | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    category: "",
    priority: "Medel",
    recurrence_rule: "",
    recurrence_days: [] as number[],
    due_date_offset: "" as string,
    storeIds: [] as string[],
    isGlobal: false,
    isLocked: false,
    items: [{ id: "", label: "", requires_photo: false }] as { id: string; label: string; requires_photo: boolean }[],
    questions: [] as { id: string; label: string; question_type: "text" | "yes_no"; is_required: boolean }[],
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    priority: "Medel",
    recurrence_rule: "",
    recurrence_days: [] as number[],
    due_date_offset: "" as string,
    storeIds: [] as string[],
    isGlobal: false,
    isLocked: false,
    items: [{ label: "", requires_photo: false }] as { label: string; requires_photo: boolean }[],
    questions: [] as { label: string; question_type: "text" | "yes_no"; is_required: boolean }[],
  });

  useEffect(() => { load(); }, [user, activeStore]);

  async function load() {
    setLoading(true);
    const [templatesRes, storesRes, tsRes] = await Promise.all([
      supabase.from("checklist_templates").select("*, items:checklist_template_items(*), questions:checklist_template_questions(*)").order("created_at", { ascending: false }),
      supabase.from("stores").select("*").order("name"),
      supabase.from("template_stores").select("template_id, store_id"),
    ]);

    const storeAssignments = (tsRes.data ?? []) as { template_id: string; store_id: string }[];
    const raw = (templatesRes.data ?? []) as ChecklistTemplate[];
    const withStores = raw.map((t) => ({
      ...t,
      storeIds: storeAssignments.filter((a) => a.template_id === t.id).map((a) => a.store_id),
      questions: (t as typeof t & { questions?: ChecklistTemplateQuestion[] }).questions ?? [],
    }));

    // Filter templates by active store: show is_global templates OR store-assigned ones
    const filtered = withStores.filter((t) => {
      if (t.is_global) return true;
      if (t.storeIds.length === 0 && user?.role === "admin") return true; // unassigned, admin only
      if (activeStore && t.storeIds.includes(activeStore.id)) return true;
      if (!activeStore && user?.role === "admin") return true;
      if (!activeStore && userStores.some((us) => t.storeIds.includes(us.id))) return true;
      return false;
    });

    setTemplates(filtered);
    setAllStores((storesRes.data ?? []) as Store[]);
    setLoading(false);
  }

  function toggleStore(id: string, list: string[], set: (ids: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function addItem() {
    setForm((p) => ({ ...p, items: [...p.items, { label: "", requires_photo: false }] }));
  }

  function removeItem(i: number) {
    setForm((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  }

  async function createTemplate() {
    setError("");
    if (!form.title.trim()) { setError("Titel är obligatorisk."); return; }
    if (user?.role === "manager" && form.storeIds.length === 0) {
      setError("Du måste välja minst en butik.");
      return;
    }
    setSaving(true);

    const { data: tmpl } = await supabase.from("checklist_templates").insert({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      priority: form.priority,
      recurrence_rule: form.recurrence_rule || null,
      recurrence_days: form.recurrence_rule === "weekly" && form.recurrence_days.length > 0 ? form.recurrence_days : null,
      due_date_offset: form.due_date_offset !== "" ? parseInt(form.due_date_offset) : null,
      created_by: user?.id ?? null,
      is_global: form.isGlobal,
      locked_by_admin: form.isLocked,
    }).select("id").maybeSingle();

    if (!tmpl?.id) { setSaving(false); return; }

    const validItems = form.items.filter((it) => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({
          template_id: tmpl.id,
          label: it.label.trim(),
          requires_photo: it.requires_photo,
          sort_order: idx,
        }))
      );
    }

    if (!form.isGlobal && form.storeIds.length > 0) {
      await supabase.from("template_stores").insert(
        form.storeIds.map((sid) => ({ template_id: tmpl.id, store_id: sid }))
      );
    }

    const validQuestions = form.questions.filter(q => q.label.trim());
    if (validQuestions.length > 0) {
      await supabase.from("checklist_template_questions").insert(
        validQuestions.map((q, idx) => ({
          template_id: tmpl.id,
          label: q.label.trim(),
          question_type: q.question_type ?? "text",
          is_required: q.is_required,
          sort_order: idx,
        }))
      );
    }

    logAudit(user?.id ?? null, "template.create", "checklist_templates", tmpl.id, { title: form.title });
    await load();
    setSaving(false);
    setShowCreate(false);
    setForm({ title: "", description: "", category: "", priority: "Medel", recurrence_rule: "", recurrence_days: [], due_date_offset: "", storeIds: [], isGlobal: false, isLocked: false, items: [{ label: "", requires_photo: false }], questions: [] as { label: string; question_type: "text" | "yes_no"; is_required: boolean }[] });
  }

  async function deleteTemplate() {
    if (!deleteTarget) return;
    await supabase.from("checklist_templates").delete().eq("id", deleteTarget.id);
    logAudit(user?.id ?? null, "template.delete", "checklist_templates", deleteTarget.id, { title: deleteTarget.title });
    setDeleteTarget(null);
    await load();
  }

  function openEditTemplate(t: ChecklistTemplate & { storeIds: string[]; questions: ChecklistTemplateQuestion[] }) {
    setEditTarget(t);
    setEditForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category ?? "",
      priority: t.priority ?? "Medel",
      recurrence_rule: t.recurrence_rule ?? "",
      recurrence_days: t.recurrence_days ?? [],
      due_date_offset: t.due_date_offset != null ? String(t.due_date_offset) : "",
      storeIds: t.storeIds,
      isGlobal: t.is_global ?? false,
      isLocked: t.locked_by_admin ?? false,
      items: (t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((it) => ({ id: it.id, label: it.label, requires_photo: it.requires_photo })),
      questions: (t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q) => ({ id: q.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required })),
    });
    setError("");
  }

  async function saveEditTemplate() {
    if (!editTarget) return;
    setError("");
    if (!editForm.title.trim()) { setError("Titel är obligatorisk."); return; }
    if (user?.role === "manager" && editForm.storeIds.length === 0) {
      setError("Du måste välja minst en butik.");
      return;
    }
    setSaving(true);

    await supabase.from("checklist_templates").update({
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      category: editForm.category.trim(),
      priority: editForm.priority,
      recurrence_rule: editForm.recurrence_rule || null,
      recurrence_days: editForm.recurrence_rule === "weekly" && editForm.recurrence_days.length > 0 ? editForm.recurrence_days : null,
      due_date_offset: editForm.due_date_offset !== "" ? parseInt(editForm.due_date_offset) : null,
      is_global: editForm.isGlobal,
      locked_by_admin: editForm.isLocked,
    }).eq("id", editTarget.id);

    // Replace items: delete all existing, insert new
    await supabase.from("checklist_template_items").delete().eq("template_id", editTarget.id);
    const validItems = editForm.items.filter((it) => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({ template_id: editTarget.id, label: it.label.trim(), requires_photo: it.requires_photo, sort_order: idx }))
      );
    }

    // Replace questions: delete all existing, insert new
    await supabase.from("checklist_template_questions").delete().eq("template_id", editTarget.id);
    const validQuestions = editForm.questions.filter((q) => q.label.trim());
    if (validQuestions.length > 0) {
      await supabase.from("checklist_template_questions").insert(
        validQuestions.map((q, idx) => ({ template_id: editTarget.id, label: q.label.trim(), question_type: q.question_type, is_required: q.is_required, sort_order: idx }))
      );
    }

    // Replace store assignments (skip if global — no per-store rows needed)
    await supabase.from("template_stores").delete().eq("template_id", editTarget.id);
    if (!editForm.isGlobal && editForm.storeIds.length > 0) {
      await supabase.from("template_stores").insert(editForm.storeIds.map((sid) => ({ template_id: editTarget.id, store_id: sid })));
    }

    logAudit(user?.id ?? null, "template.edit", "checklist_templates", editTarget.id, { title: editForm.title });
    await load();
    setSaving(false);
    setEditTarget(null);
  }

  const displayStores = user?.role === "admin" ? allStores : userStores;
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Download a blank CSV template so users know the expected format
  const downloadBlankTemplate = () => {
    const headers = ["Titel", "Kategori", "Beskrivning", "Prioritet", "Återkommande", "Förfaller om (dagar)", "Steg (detaljer)", "Frågor"];
    const example = [
      "Exempelmall",
      "Rengöring",
      "Beskriv mallen här",
      "Medel",
      "weekly",
      "1",
      "1. Torka hyllor | 2. Dammsuga [foto]",
      "1. Är allt klart? [obligatorisk] [ja_nej]",
    ];
    const csv = [headers, example]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mall-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse and import a CSV file containing templates
  const importCSV = async (file: File) => {
    setImporting(true);
    const text = await file.text();
    // strip BOM
    const cleaned = text.startsWith("\ufeff") ? text.slice(1) : text;
    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setImporting(false); return; }

    // Parse CSV row respecting quoted fields with semicolon separator
    const parseRow = (line: string): string[] => {
      const cols: string[] = [];
      let cur = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = !inQuote;
        } else if (ch === ";" && !inQuote) {
          cols.push(cur); cur = "";
        } else {
          cur += ch;
        }
      }
      cols.push(cur);
      return cols;
    };

    const rows = lines.slice(1).map(parseRow);
    for (const cols of rows) {
      const [title, category, description, priority, recurrence, dueDays, stepsRaw, questionsRaw] = cols;
      if (!title?.trim()) continue;

      const { data: tmpl } = await supabase.from("checklist_templates").insert({
        title: title.trim(),
        category: (category ?? "").trim(),
        description: (description ?? "").trim(),
        priority: (priority ?? "Medel").trim() || "Medel",
        recurrence_rule: (recurrence ?? "").trim() || null,
        due_date_offset: dueDays?.trim() ? parseInt(dueDays.trim()) : null,
        created_by: user?.id ?? null,
      }).select("id").maybeSingle();

      if (!tmpl?.id) continue;

      // Parse steps: "1. Label [foto] | 2. Label"
      if (stepsRaw?.trim()) {
        const stepParts = stepsRaw.split("|").map((s) => s.trim()).filter(Boolean);
        const items = stepParts.map((part, idx) => ({
          template_id: tmpl.id,
          label: part.replace(/^\d+\.\s*/, "").replace(/\s*\[foto\]/i, "").trim(),
          requires_photo: /\[foto\]/i.test(part),
          sort_order: idx,
        }));
        if (items.length > 0) await supabase.from("checklist_template_items").insert(items);
      }

      // Parse questions: "1. Label [obligatorisk] [ja_nej] | 2. Label"
      if (questionsRaw?.trim()) {
        const qParts = questionsRaw.split("|").map((s) => s.trim()).filter(Boolean);
        const questions = qParts.map((part, idx) => ({
          template_id: tmpl.id,
          label: part.replace(/^\d+\.\s*/, "").replace(/\s*\[obligatorisk\]/i, "").replace(/\s*\[ja_nej\]/i, "").trim(),
          question_type: /\[ja_nej\]/i.test(part) ? "yes_no" : "text",
          is_required: /\[obligatorisk\]/i.test(part),
          sort_order: idx,
        }));
        if (questions.length > 0) await supabase.from("checklist_template_questions").insert(questions);
      }

      logAudit(user?.id ?? null, "template.import", "checklist_templates", tmpl.id, { title: title.trim() });
    }

    await load();
    setImporting(false);
  };

  const exportCSV = () => {
    const rows = [
      ["Titel", "Kategori", "Beskrivning", "Antal steg", "Steg (detaljer)", "Frågor", "Butiker", "Skapad"],
      ...templates.map((t) => [
        t.title,
        t.category,
        t.description,
        t.items?.length ?? 0,
        (t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((it, idx) => `${idx + 1}. ${it.label}${it.requires_photo ? " [foto]" : ""}`).join(" | "),
        (t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q, idx) => `${idx + 1}. ${q.label}${q.is_required ? " [obligatorisk]" : ""}`).join(" | "),
        t.storeIds.map((sid) => allStores.find(s => s.id === sid)?.name ?? sid).join(", "),
        t.created_at ? new Date(t.created_at).toLocaleDateString("sv-SE") : "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mallar-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Mallar"
        description="Återanvändbara checklistor och rutiners mallar."
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ""; }}
            />
            {isManager && (
              <Button variant="outline" className="rounded-full" onClick={downloadBlankTemplate}>
                <Download className="mr-2 h-4 w-4" /> CSV-mall
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="rounded-full" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" /> Exportera
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="rounded-full" disabled={importing} onClick={() => importInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> {importing ? "Importerar..." : "Importera CSV"}
              </Button>
            )}
            {isManager && (
              <Button className="rounded-full" onClick={() => { setShowCreate(true); setError(""); }}>
                <Plus className="mr-2 h-4 w-4" /> Ny mall
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="mt-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : templates.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Inga mallar ännu</p>
          {isManager && (
            <Button className="mt-4 rounded-full" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Skapa mall
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
              <div className="flex w-full items-center justify-between hover:bg-muted/20">
                <button
                  className="flex flex-1 items-center gap-3 px-5 py-4 text-left"
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                >
                  {expanded === t.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {t.category && <Badge variant="secondary" className="text-xs">{t.category}</Badge>}
                      {t.is_global && (
                        <span title="Skapad av HK – visas i alla butiker, kan bara redigeras av admin">
                          <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">HK-mall</Badge>
                        </span>
                      )}
                      {t.locked_by_admin && !t.is_global && (
                        <span title="Skrivskyddad av admin – kan inte redigeras av butikschefer">
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">Skrivskyddad</Badge>
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{t.items?.length ?? 0} steg</span>
                      {(t.questions?.length ?? 0) > 0 && <span className="text-xs text-muted-foreground">{t.questions?.length} frågor</span>}
                    </div>
                  </div>
                </button>
                {isManager && (
                  <div className="mr-3 flex items-center gap-1">
                    {(user?.role === "admin" || (!t.locked_by_admin && !t.is_global)) && (
                      <Button
                        variant="ghost" size="icon"
                        className="rounded-full text-muted-foreground hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); openEditTemplate(t); }}
                        aria-label="Redigera"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {(user?.role === "admin" || (!t.locked_by_admin && !t.is_global)) && (
                      <Button
                        variant="ghost" size="icon"
                        className="rounded-full text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}
                        aria-label="Ta bort"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {expanded === t.id && (
                <div className="border-t border-border/60 px-5 py-4 space-y-3">
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  {(t.items?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Checkpoints</p>
                      <ol className="space-y-2">
                        {(t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((item: ChecklistTemplateItem, idx: number) => (
                          <li key={item.id} className="flex items-center gap-2.5 text-sm">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{idx + 1}</span>
                            <span>{item.label}</span>
                            {item.requires_photo && <Badge variant="secondary" className="text-xs">Foto krävs</Badge>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {(t.questions?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Frågor</p>
                      <ol className="space-y-2">
                        {(t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q: ChecklistTemplateQuestion, idx: number) => (
                          <li key={q.id} className="flex items-center gap-2.5 text-sm">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary">{idx + 1}</span>
                            <span>{q.label}</span>
                            {q.question_type === "yes_no" && <Badge variant="secondary" className="text-xs">Ja/Nej</Badge>}
                            {q.is_required && <Badge variant="secondary" className="text-xs text-destructive">Obligatorisk</Badge>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {t.storeIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-muted-foreground">Tilldelade butiker:</span>
                      {t.storeIds.map((sid) => {
                        const s = allStores.find((st) => st.id === sid);
                        return s ? <Badge key={sid} variant="outline" className="text-xs">{s.name}</Badge> : null;
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE DIALOG — two-panel layout */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setError(""); }}>
        <DialogContent className="max-h-[92dvh] w-full sm:max-w-4xl sm:max-h-[92vh] overflow-hidden p-0 gap-0">
          {/* Header bar */}
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Ny mall</span>
            {form.title && <span className="text-sm font-semibold text-foreground truncate max-w-xs">{form.title}</span>}
            <div className="ml-auto flex items-center gap-2">
              {error && <span className="text-xs text-destructive">{error}</span>}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowCreate(false)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" onClick={createTemplate} disabled={saving}>
                {saving ? "Sparar..." : "Spara mall"}
              </Button>
            </div>
          </div>

          <div className="flex overflow-hidden" style={{ maxHeight: "calc(92dvh - 56px)" }}>
            {/* LEFT: Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
              <input
                placeholder="Mallens namn..."
                value={form.title}
                onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none focus:outline-none"
              />
              <Textarea
                placeholder="Kort beskrivning av vad mallen används till..."
                value={form.description}
                onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
                className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
              />

              {/* Steg */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Steg</p>
                <div className="space-y-1.5">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                      <Input
                        placeholder={`Steg ${idx + 1}`}
                        value={item.label}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx] = { ...items[idx], label: e.target.value };
                          setForm(p => ({ ...p, items }));
                        }}
                        className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                      />
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/70 cursor-pointer">
                        <Checkbox
                          checked={item.requires_photo}
                          onCheckedChange={(v) => {
                            const items = [...form.items];
                            items[idx] = { ...items[idx], requires_photo: !!v };
                            setForm(p => ({ ...p, items }));
                          }}
                          className="h-3 w-3"
                        />
                        Foto
                      </label>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeItem(idx)}
                        disabled={form.items.length === 1}
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  onClick={addItem}
                >
                  <Plus className="h-3.5 w-3.5" /> Lägg till steg
                </button>
              </div>

              {/* Frågor */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frågor</p>
                <div className="space-y-2">
                  {form.questions.map((q, idx) => (
                    <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder={`Fråga ${idx + 1}`}
                          value={q.label}
                          onChange={(e) => {
                            const qs = [...form.questions];
                            qs[idx] = { ...qs[idx], label: e.target.value };
                            setForm(p => ({ ...p, questions: qs }));
                          }}
                          className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                        />
                        <button type="button" onClick={() => setForm(p => ({ ...p, questions: p.questions.filter((_, i) => i !== idx) }))}>
                          <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          {(["text", "yes_no"] as const).map((type) => (
                            <button key={type} type="button"
                              className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                                (q.question_type ?? "text") === type ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                              onClick={() => { const qs = [...form.questions]; qs[idx] = { ...qs[idx], question_type: type }; setForm(p => ({ ...p, questions: qs })); }}>
                              {type === "text" ? "Text" : "Ja/Nej"}
                            </button>
                          ))}
                        </div>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                          <Checkbox
                            checked={q.is_required}
                            onCheckedChange={(v) => {
                              const qs = [...form.questions];
                              qs[idx] = { ...qs[idx], is_required: !!v };
                              setForm(p => ({ ...p, questions: qs }));
                            }}
                            className="h-3 w-3"
                          />
                          Obligatorisk
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  onClick={() => setForm(p => ({ ...p, questions: [...p.questions, { label: "", question_type: "text", is_required: false }] }))}
                >
                  <Plus className="h-3.5 w-3.5" /> Lägg till fråga
                </button>
              </div>
            </div>

            {/* RIGHT: Properties sidebar */}
            <div className="w-64 shrink-0 overflow-y-auto border-l border-border/60 bg-muted/30">
              <div className="divide-y divide-border/50">

                {/* Kategori */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground/60">#</span>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">Kategori</span>
                    <Input
                      placeholder="t.ex. Rengöring"
                      value={form.category}
                      onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
                      className="h-7 border border-border/60 text-xs"
                    />
                  </div>
                </div>

                {/* Prioritet */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">Prioritet</span>
                  <Select value={form.priority} onValueChange={(v) => setForm(p => ({ ...p, priority: v }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0 justify-end"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Låg","Medel","Hög","Kritisk"].map(pr => <SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {/* Förfallodagar */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground">Förfaller om (dagar)</span>
                    <Input type="number" min={0} placeholder="t.ex. 1" value={form.due_date_offset} onChange={(e) => setForm(p => ({ ...p, due_date_offset: e.target.value }))} className="h-7 border border-border/60 text-xs" />
                  </div>
                </div>

                {/* Återkommande */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Repeat className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">Återkommande</span>
                    <Select value={form.recurrence_rule || "__none"} onValueChange={(v) => setForm(p => ({ ...p, recurrence_rule: v === "__none" ? "" : v }))}>
                      <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end"><SelectValue placeholder="Ingen" /></SelectTrigger>
                      <SelectContent>{RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value || "__none"} value={o.value || "__none"}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {form.recurrence_rule === "weekly" && (
                    <div className="flex flex-wrap gap-1 pl-7">
                      {WEEKDAYS.map((day, idx) => (
                        <button key={idx} type="button"
                          className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                            form.recurrence_days.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                          onClick={() => { const days = form.recurrence_days.includes(idx) ? form.recurrence_days.filter(d=>d!==idx) : [...form.recurrence_days,idx]; setForm(p => ({ ...p, recurrence_days: days })); }}>
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tilldelade butiker */}
                {displayStores.length > 0 && (
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Tilldelade butiker
                        {user?.role === "manager" && <span className="ml-1 text-destructive">*</span>}
                      </span>
                      {user?.role === "admin" && (
                        <button
                          type="button"
                          className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                          onClick={() => setBroadcastConfirm("create")}
                        >
                          <StoreIcon className="h-3 w-3" /> Alla butiker
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {displayStores.map(s => (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                          <Checkbox
                            checked={form.storeIds.includes(s.id)}
                            onCheckedChange={() => toggleStore(s.id, form.storeIds, (ids) => setForm(p => ({ ...p, storeIds: ids })))}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Global + Låst — admin only */}
                {user?.role === "admin" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Global</span>
                        <p className="text-[10px] text-muted-foreground/60">Visas i alla butiker</p>
                      </div>
                      <Switch
                        checked={form.isGlobal}
                        onCheckedChange={(v) => setForm(p => ({ ...p, isGlobal: v, storeIds: v ? [] : p.storeIds }))}
                      />
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Låst</span>
                        <p className="text-[10px] text-muted-foreground/60">Chefer kan inte redigera</p>
                      </div>
                      <Switch
                        checked={form.isLocked}
                        onCheckedChange={(v) => setForm(p => ({ ...p, isLocked: v }))}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-h-[92dvh] w-full sm:max-w-4xl sm:max-h-[92vh] overflow-hidden p-0 gap-0">
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Redigera mall</span>
            <div className="ml-auto flex items-center gap-2">
              {error && <span className="text-xs text-destructive">{error}</span>}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setEditTarget(null)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" onClick={saveEditTemplate} disabled={saving}>
                {saving ? "Sparar..." : "Spara ändringar"}
              </Button>
            </div>
          </div>

          <div className="flex overflow-hidden" style={{ maxHeight: "calc(92dvh - 56px)" }}>
            {/* LEFT: Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
              <input
                placeholder="Mallens namn..."
                value={editForm.title}
                onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))}
                className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none focus:outline-none"
              />
              <Textarea
                placeholder="Kort beskrivning..."
                value={editForm.description}
                onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
                className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
              />

              {/* Steg */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Steg</p>
                <div className="space-y-1.5">
                  {editForm.items.map((item, idx) => (
                    <div key={idx} className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                      <Input
                        placeholder={`Steg ${idx + 1}`}
                        value={item.label}
                        onChange={(e) => { const items = [...editForm.items]; items[idx] = { ...items[idx], label: e.target.value }; setEditForm(p => ({ ...p, items })); }}
                        className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                      />
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/70 cursor-pointer">
                        <Checkbox
                          checked={item.requires_photo}
                          onCheckedChange={(v) => { const items = [...editForm.items]; items[idx] = { ...items[idx], requires_photo: !!v }; setEditForm(p => ({ ...p, items })); }}
                          className="h-3 w-3"
                        />
                        Foto
                      </label>
                      <button type="button" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setEditForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))} disabled={editForm.items.length === 1}>
                        <X className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary" onClick={() => setEditForm(p => ({ ...p, items: [...p.items, { id: "", label: "", requires_photo: false }] }))}>
                  <Plus className="h-3.5 w-3.5" /> Lägg till steg
                </button>
              </div>

              {/* Frågor */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frågor</p>
                <div className="space-y-2">
                  {editForm.questions.map((q, idx) => (
                    <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder={`Fråga ${idx + 1}`}
                          value={q.label}
                          onChange={(e) => { const qs = [...editForm.questions]; qs[idx] = { ...qs[idx], label: e.target.value }; setEditForm(p => ({ ...p, questions: qs })); }}
                          className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                        />
                        <button type="button" onClick={() => setEditForm(p => ({ ...p, questions: p.questions.filter((_, i) => i !== idx) }))}><X className="h-3.5 w-3.5 text-muted-foreground/50" /></button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          {(["text", "yes_no"] as const).map((type) => (
                            <button key={type} type="button"
                              className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors", (q.question_type ?? "text") === type ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                              onClick={() => { const qs = [...editForm.questions]; qs[idx] = { ...qs[idx], question_type: type }; setEditForm(p => ({ ...p, questions: qs })); }}>
                              {type === "text" ? "Text" : "Ja/Nej"}
                            </button>
                          ))}
                        </div>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                          <Checkbox checked={q.is_required} onCheckedChange={(v) => { const qs = [...editForm.questions]; qs[idx] = { ...qs[idx], is_required: !!v }; setEditForm(p => ({ ...p, questions: qs })); }} className="h-3 w-3" />
                          Obligatorisk
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary" onClick={() => setEditForm(p => ({ ...p, questions: [...p.questions, { id: "", label: "", question_type: "text", is_required: false }] }))}>
                  <Plus className="h-3.5 w-3.5" /> Lägg till fråga
                </button>
              </div>
            </div>

            {/* RIGHT: Properties sidebar */}
            <div className="w-64 shrink-0 overflow-y-auto border-l border-border/60 bg-muted/30">
              <div className="divide-y divide-border/50">
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center"><span className="text-xs text-muted-foreground/60">#</span></div>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">Kategori</span>
                    <Input placeholder="t.ex. Rengöring" value={editForm.category} onChange={(e) => setEditForm(p => ({ ...p, category: e.target.value }))} className="h-7 border border-border/60 text-xs" />
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">Prioritet</span>
                  <Select value={editForm.priority} onValueChange={(v) => setEditForm(p => ({ ...p, priority: v }))}>
                    <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0 justify-end"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Låg","Medel","Hög","Kritisk"].map(pr => <SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground">Förfaller om (dagar)</span>
                    <Input type="number" min={0} placeholder="t.ex. 1" value={editForm.due_date_offset} onChange={(e) => setEditForm(p => ({ ...p, due_date_offset: e.target.value }))} className="h-7 border border-border/60 text-xs" />
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Repeat className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">Återkommande</span>
                    <Select value={editForm.recurrence_rule || "__none"} onValueChange={(v) => setEditForm(p => ({ ...p, recurrence_rule: v === "__none" ? "" : v }))}>
                      <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end"><SelectValue placeholder="Ingen" /></SelectTrigger>
                      <SelectContent>{RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value || "__none"} value={o.value || "__none"}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {editForm.recurrence_rule === "weekly" && (
                    <div className="flex flex-wrap gap-1 pl-7">
                      {WEEKDAYS.map((day, idx) => (
                        <button key={idx} type="button"
                          className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors", editForm.recurrence_days.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                          onClick={() => { const days = editForm.recurrence_days.includes(idx) ? editForm.recurrence_days.filter(d=>d!==idx) : [...editForm.recurrence_days, idx]; setEditForm(p => ({ ...p, recurrence_days: days })); }}>
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {displayStores.length > 0 && (
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Tilldelade butiker
                        {user?.role === "manager" && <span className="ml-1 text-destructive">*</span>}
                      </span>
                      {user?.role === "admin" && (
                        <button
                          type="button"
                          className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                          onClick={() => setBroadcastConfirm("edit")}
                        >
                          <StoreIcon className="h-3 w-3" /> Alla butiker
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {displayStores.map(s => (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                          <Checkbox checked={editForm.storeIds.includes(s.id)} onCheckedChange={() => toggleStore(s.id, editForm.storeIds, (ids) => setEditForm(p => ({ ...p, storeIds: ids })))} className="h-3.5 w-3.5" />
                          <span className="text-xs">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {user?.role === "admin" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Global</span>
                        <p className="text-[10px] text-muted-foreground/60">Visas i alla butiker</p>
                      </div>
                      <Switch checked={editForm.isGlobal} onCheckedChange={(v) => setEditForm(p => ({ ...p, isGlobal: v, storeIds: v ? [] : p.storeIds }))} />
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Låst</span>
                        <p className="text-[10px] text-muted-foreground/60">Chefer kan inte redigera</p>
                      </div>
                      <Switch checked={editForm.isLocked} onCheckedChange={(v) => setEditForm(p => ({ ...p, isLocked: v }))} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* BROADCAST CONFIRM */}
      <AlertDialog open={!!broadcastConfirm} onOpenChange={(o) => !o && setBroadcastConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skicka till alla butiker</AlertDialogTitle>
            <AlertDialogDescription>
              Denna mall kommer bli synlig i <strong>{allStores.length} butiker</strong>. Alla butiker i systemet får tillgång till mallen. Vill du fortsätta?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (broadcastConfirm === "create") {
                setForm(p => ({ ...p, storeIds: [], isGlobal: true }));
              } else {
                setEditForm(p => ({ ...p, storeIds: [], isGlobal: true }));
              }
              setBroadcastConfirm(null);
            }}>
              Skicka till alla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE CONFIRM */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort mall</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort mallen <strong>{deleteTarget?.title}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteTemplate}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
