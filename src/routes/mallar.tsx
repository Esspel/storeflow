import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Download, GripVertical,
  Upload, X, Repeat, Clock, TriangleAlert as AlertTriangle, Pencil,
  Store as StoreIcon, Building2, Eye, EyeOff,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  supabase, type ChecklistTemplate, type ChecklistTemplateItem,
  type ChecklistTemplateQuestion, type Store, type Forening, logAudit,
} from "@/lib/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { ImportDialog, type ImportDialogResult } from "@/components/import-dialog";
import { cn } from "@/lib/utils";

const RECURRENCE_OPTIONS = [
  { value: "", label: "Ingen" },
  { value: "daily", label: "Dagligen" },
  { value: "every_other_day", label: "Varannan dag" },
  { value: "weekly", label: "Varje vecka" },
  { value: "monthly", label: "Varje månad" },
  { value: "yearly", label: "Varje år" },
];
const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

// Instruction header injected into every downloadable CSV template.
// Lines starting with '#' are treated as comments and skipped by the importer.
const CSV_TEMPLATE_INSTRUCTIONS = `# INSTRUKTIONER (dessa rader ignoreras vid import)
# Kolumner: Titel;Kategori;Beskrivning;Prioritet;Återkommande;Veckodagar;Intervall;Förfaller om (dagar);Steg (detaljer);Frågor
#
# Prioritet: Låg | Medel | Hög | Kritisk
# Återkommande: daily | every_other_day | weekly | monthly | yearly (lämna tomt för ingen)
# Veckodagar: kommaseparerade siffror 0–6 (0=Mån, 1=Tis, ... 6=Sön), används när Återkommande=weekly
#   Exempel: 0,1,4 (Mån, Tis, Fre)
# Intervall: antal enheter mellan upprepningar (t.ex. 2 = varannan vecka), lämna tomt för 1
# Förfaller om (dagar): antal dagar tills uppgiften förfaller från skapande (t.ex. 1)
#
# Steg: separera med " | "  — lägg till [foto] om foto krävs
#   Exempel: "1. Torka hyllor | 2. Dammsuga [foto] | 3. Kontrollera temperaturer"
#
# Frågor: separera med " | " — lägg till [obligatorisk] och/eller [ja_nej]
#   Exempel: "1. Är allt klart? [obligatorisk] [ja_nej] | 2. Kommentar"
#
# Tips: Spara filen i UTF-8-format och använd semikolon (;) som separator
`;

type TemplateWithMeta = ChecklistTemplate & {
  storeIds: string[];
  questions: ChecklistTemplateQuestion[];
};

type HiddenEntry = { forening_id: string; template_id: string };

type FormState = {
  title: string;
  description: string;
  category: string;
  priority: string;
  recurrence_rule: string;
  recurrence_days: number[];
  due_date_offset: string;
  storeIds: string[];
  isGlobal: boolean;
  isLocked: boolean;
  foreningId: string;
  items: { id?: string; label: string; requires_photo: boolean }[];
  questions: { id?: string; label: string; question_type: "text" | "yes_no"; is_required: boolean }[];
};

const emptyForm = (): FormState => ({
  title: "", description: "", category: "", priority: "Medel",
  recurrence_rule: "", recurrence_days: [], due_date_offset: "",
  storeIds: [], isGlobal: false, isLocked: false, foreningId: "",
  items: [{ label: "", requires_photo: false }],
  questions: [],
});

export const Route = createFileRoute("/mallar")({
  component: MallarPage,
});

function MallarPage() {
  const { user, activeStore, userStores } = useAuth();

  const isAdmin = user?.role === "admin";
  const isHK = user?.hierarchy_level === "hk" || isAdmin;
  const isForening = user?.hierarchy_level === "forening";
  const isManager = user?.role === "manager" || isAdmin;
  // Förening users can manage forening-scoped templates; HK/admin manage HK-scoped
  const canCreateForening = isForening || isAdmin;
  const canCreateHK = isHK; // admin counts as HK too

  const [templates, setTemplates] = useState<TemplateWithMeta[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [allForeningar, setAllForeningar] = useState<Forening[]>([]);
  const [hiddenEntries, setHiddenEntries] = useState<HiddenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createScope, setCreateScope] = useState<"store" | "hk" | "forening">("store");
  const [deleteTarget, setDeleteTarget] = useState<TemplateWithMeta | null>(null);
  const [editTarget, setEditTarget] = useState<TemplateWithMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [broadcastConfirm, setBroadcastConfirm] = useState<"create" | "edit" | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  const [importing, setImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // View filter: "all" | "hk" | "forening" | "store"
  const [viewFilter, setViewFilter] = useState<"all" | "hk" | "forening" | "store">("all");

  useEffect(() => { load(); }, [user, activeStore]);

  async function load() {
    setLoading(true);
    const [templatesRes, storesRes, tsRes, foreningarRes, hiddenRes] = await Promise.all([
      supabase.from("checklist_templates")
        .select("*, items:checklist_template_items(*), questions:checklist_template_questions(*)")
        .order("created_at", { ascending: false }),
      supabase.from("stores").select("*").order("name"),
      supabase.from("template_stores").select("template_id, store_id"),
      supabase.from("foreningar").select("*").order("name"),
      supabase.from("forening_hidden_templates").select("forening_id, template_id"),
    ]);

    const storeAssignments = (tsRes.data ?? []) as { template_id: string; store_id: string }[];
    const raw = (templatesRes.data ?? []) as ChecklistTemplate[];
    const withMeta: TemplateWithMeta[] = raw.map((t) => ({
      ...t,
      storeIds: storeAssignments.filter((a) => a.template_id === t.id).map((a) => a.store_id),
      questions: (t as typeof t & { questions?: ChecklistTemplateQuestion[] }).questions ?? [],
    }));

    const hidden = (hiddenRes.data ?? []) as HiddenEntry[];

    // Determine user's forening_id for filtering
    const userForeningId = user?.forening_id ?? null;
    // Stores the user belongs to
    const userStoreIds = userStores.map((s) => s.id);

    const filtered = withMeta.filter((t) => {
      const scope = t.hierarchy_scope;

      // HK-scope templates (is_global=true or hierarchy_scope='hk')
      if (scope === "hk" || t.is_global) {
        // Check if hidden by user's förening
        if (userForeningId && hidden.some((h) => h.template_id === t.id && h.forening_id === userForeningId)) {
          // Still show to forening users so they can manage the hide list
          return isForening || isAdmin;
        }
        return true;
      }

      // Förening-scope templates
      if (scope === "forening") {
        if (!t.forening_id) return false;
        if (isAdmin) return true;
        if (isForening && user?.forening_id === t.forening_id) return true;
        // Stores in the same förening see it
        if (userForeningId && userForeningId === t.forening_id) return true;
        // Direct store match via store's forening_id
        const userStoreForeningIds = allStores
          .filter((s) => userStoreIds.includes(s.id))
          .map((s) => s.forening_id);
        if (userStoreForeningIds.includes(t.forening_id)) return true;
        return false;
      }

      // Store-scope templates
      if (t.storeIds.length === 0 && isAdmin) return true;
      if (activeStore && t.storeIds.includes(activeStore.id)) return true;
      if (!activeStore && userStores.some((us) => t.storeIds.includes(us.id))) return true;
      return false;
    });

    setTemplates(filtered);
    setAllStores((storesRes.data ?? []) as Store[]);
    setAllForeningar((foreningarRes.data ?? []) as Forening[]);
    setHiddenEntries(hidden);
    setLoading(false);
  }

  function toggleStore(id: string, list: string[], set: (ids: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function openCreate(scope: "store" | "hk" | "forening") {
    setCreateScope(scope);
    const f = emptyForm();
    if (scope === "hk") { f.isGlobal = true; }
    if (scope === "forening") {
      f.foreningId = user?.forening_id ?? "";
    }
    setForm(f);
    setError("");
    setShowCreate(true);
  }

  async function createTemplate() {
    setError("");
    if (!form.title.trim()) { setError("Titel är obligatorisk."); return; }
    if (createScope === "store" && user?.role === "manager" && form.storeIds.length === 0) {
      setError("Du måste välja minst en butik.");
      return;
    }
    if (createScope === "forening" && !form.foreningId) {
      setError("Välj en förening.");
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
      is_global: createScope === "hk",
      locked_by_admin: form.isLocked,
      hierarchy_scope: createScope,
      forening_id: createScope === "forening" ? form.foreningId : null,
    }).select("id").maybeSingle();

    if (!tmpl?.id) { setSaving(false); return; }

    const validItems = form.items.filter((it) => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({ template_id: tmpl.id, label: it.label.trim(), requires_photo: it.requires_photo, sort_order: idx }))
      );
    }

    if (createScope === "store" && form.storeIds.length > 0) {
      await supabase.from("template_stores").insert(form.storeIds.map((sid) => ({ template_id: tmpl.id, store_id: sid })));
    }

    const validQuestions = form.questions.filter((q) => q.label.trim());
    if (validQuestions.length > 0) {
      await supabase.from("checklist_template_questions").insert(
        validQuestions.map((q, idx) => ({ template_id: tmpl.id, label: q.label.trim(), question_type: q.question_type ?? "text", is_required: q.is_required, sort_order: idx }))
      );
    }

    logAudit(user?.id ?? null, "template.create", "checklist_templates", tmpl.id, { title: form.title, scope: createScope });
    await load();
    setSaving(false);
    setShowCreate(false);
  }

  async function deleteTemplate() {
    if (!deleteTarget) return;
    await supabase.from("checklist_templates").delete().eq("id", deleteTarget.id);
    logAudit(user?.id ?? null, "template.delete", "checklist_templates", deleteTarget.id, { title: deleteTarget.title });
    setDeleteTarget(null);
    await load();
  }

  function openEdit(t: TemplateWithMeta) {
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
      foreningId: t.forening_id ?? "",
      items: (t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((it) => ({ id: it.id, label: it.label, requires_photo: it.requires_photo })),
      questions: (t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q) => ({ id: q.id, label: q.label, question_type: q.question_type ?? "text", is_required: q.is_required })),
    });
    setError("");
  }

  async function saveEdit() {
    if (!editTarget) return;
    setError("");
    if (!editForm.title.trim()) { setError("Titel är obligatorisk."); return; }
    const scope = editTarget.hierarchy_scope ?? "store";
    if (scope === "store" && user?.role === "manager" && editForm.storeIds.length === 0) {
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

    await supabase.from("checklist_template_items").delete().eq("template_id", editTarget.id);
    const validItems = editForm.items.filter((it) => it.label.trim());
    if (validItems.length > 0) {
      await supabase.from("checklist_template_items").insert(
        validItems.map((it, idx) => ({ template_id: editTarget.id, label: it.label.trim(), requires_photo: it.requires_photo, sort_order: idx }))
      );
    }

    await supabase.from("checklist_template_questions").delete().eq("template_id", editTarget.id);
    const validQuestions = editForm.questions.filter((q) => q.label.trim());
    if (validQuestions.length > 0) {
      await supabase.from("checklist_template_questions").insert(
        validQuestions.map((q, idx) => ({ template_id: editTarget.id, label: q.label.trim(), question_type: q.question_type, is_required: q.is_required, sort_order: idx }))
      );
    }

    await supabase.from("template_stores").delete().eq("template_id", editTarget.id);
    if (!editForm.isGlobal && scope === "store" && editForm.storeIds.length > 0) {
      await supabase.from("template_stores").insert(editForm.storeIds.map((sid) => ({ template_id: editTarget.id, store_id: sid })));
    }

    logAudit(user?.id ?? null, "template.edit", "checklist_templates", editTarget.id, { title: editForm.title });
    await load();
    setSaving(false);
    setEditTarget(null);
  }

  async function toggleHideHKTemplate(t: TemplateWithMeta) {
    if (!user?.forening_id) return;
    const alreadyHidden = hiddenEntries.some((h) => h.template_id === t.id && h.forening_id === user.forening_id);
    if (alreadyHidden) {
      await supabase.from("forening_hidden_templates")
        .delete()
        .eq("template_id", t.id)
        .eq("forening_id", user.forening_id);
    } else {
      await supabase.from("forening_hidden_templates").insert({
        template_id: t.id,
        forening_id: user.forening_id,
        hidden_by: user.id,
      });
    }
    await load();
  }

  function canEdit(t: TemplateWithMeta): boolean {
    if (isAdmin) return !t.is_system_locked;
    const scope = t.hierarchy_scope ?? "store";
    if (scope === "hk") return false; // only admin can edit HK templates
    if (scope === "forening") {
      return isForening && t.created_by === user?.id;
    }
    // store scope
    return isManager && !t.locked_by_admin && !t.is_global;
  }

  function canDelete(t: TemplateWithMeta): boolean {
    return canEdit(t);
  }

  const displayStores = isAdmin ? allStores : userStores;

  // CSV: download blank import template with instructions
  const downloadBlankTemplate = () => {
    const headers = ["Titel", "Kategori", "Beskrivning", "Prioritet", "Återkommande", "Veckodagar", "Intervall", "Förfaller om (dagar)", "Steg (detaljer)", "Frågor"];
    const example = [
      "Exempelmall", "Rengöring", "Beskriv mallen här", "Medel", "weekly", "0,1,2,3,4", "1", "1",
      "1. Torka hyllor | 2. Dammsuga [foto]",
      "1. Är allt klart? [obligatorisk] [ja_nej]",
    ];
    const csv = CSV_TEMPLATE_INSTRUCTIONS
      + [headers, example].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    triggerDownload(csv, "mall-import-template.csv");
  };

  const exportCSV = () => {
    const headers = ["Titel", "Kategori", "Beskrivning", "Scope", "Antal steg", "Steg (detaljer)", "Frågor", "Butiker", "Skapad"];
    const rows = [
      headers,
      ...templates.map((t) => [
        t.title, t.category, t.description,
        t.hierarchy_scope ?? "store",
        t.items?.length ?? 0,
        (t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((it, idx) => `${idx + 1}. ${it.label}${it.requires_photo ? " [foto]" : ""}`).join(" | "),
        (t.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((q, idx) => `${idx + 1}. ${q.label}${q.is_required ? " [obligatorisk]" : ""}${q.question_type === "yes_no" ? " [ja_nej]" : ""}`).join(" | "),
        t.storeIds.map((sid) => allStores.find((s) => s.id === sid)?.name ?? sid).join(", "),
        t.created_at ? new Date(t.created_at).toLocaleDateString("sv-SE") : "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    triggerDownload("\ufeff" + csv, `mallar-${activeStore?.name ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  function triggerDownload(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function parseRow(line: string): string[] {
    const cols: string[] = [];
    let cur = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ";" && !inQuote) { cols.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur);
    return cols;
  }

  const importCSV = async (result: ImportDialogResult) => {
    setImporting(true);
    setShowImportDialog(false);
    const text = await result.file.text();
    const cleaned = text.startsWith("\ufeff") ? text.slice(1) : text;
    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (lines.length < 2) { setImporting(false); return; }

    const importScope = isAdmin
      ? String(result.options.scope ?? "store")
      : isForening ? "forening" : "store";

    const rows = lines.slice(1).map(parseRow);
    for (const cols of rows) {
      const [title, category, description, priority, recurrence, weekdaysRaw, intervalRaw, dueDays, stepsRaw, questionsRaw] = cols;
      if (!title?.trim()) continue;

      const recurrenceRule = (recurrence ?? "").trim() || null;
      const recurrenceDays = weekdaysRaw?.trim()
        ? weekdaysRaw.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 6)
        : null;
      const recurrenceInterval = intervalRaw?.trim() ? parseInt(intervalRaw.trim()) : null;

      const { data: tmpl } = await supabase.from("checklist_templates").insert({
        title: title.trim(),
        category: (category ?? "").trim(),
        description: (description ?? "").trim(),
        priority: (priority ?? "Medel").trim() || "Medel",
        recurrence_rule: recurrenceRule,
        recurrence_days: recurrenceDays && recurrenceDays.length > 0 ? recurrenceDays : null,
        recurrence_interval: recurrenceInterval && recurrenceInterval > 1 ? recurrenceInterval : null,
        due_date_offset: dueDays?.trim() ? parseInt(dueDays.trim()) : null,
        created_by: user?.id ?? null,
        hierarchy_scope: importScope,
        is_global: importScope === "hk",
        forening_id: importScope === "forening" ? (user?.forening_id ?? result.options.foreningId as string ?? null) : null,
      }).select("id").maybeSingle();

      if (!tmpl?.id) continue;

      if (stepsRaw?.trim()) {
        const items = stepsRaw.split("|").map((s) => s.trim()).filter(Boolean).map((part, idx) => ({
          template_id: tmpl.id,
          label: part.replace(/^\d+\.\s*/, "").replace(/\s*\[foto\]/i, "").trim(),
          requires_photo: /\[foto\]/i.test(part),
          sort_order: idx,
        }));
        if (items.length > 0) await supabase.from("checklist_template_items").insert(items);
      }

      if (questionsRaw?.trim()) {
        const questions = questionsRaw.split("|").map((s) => s.trim()).filter(Boolean).map((part, idx) => ({
          template_id: tmpl.id,
          label: part.replace(/^\d+\.\s*/, "").replace(/\s*\[obligatorisk\]/i, "").replace(/\s*\[ja_nej\]/i, "").trim(),
          question_type: /\[ja_nej\]/i.test(part) ? "yes_no" : "text",
          is_required: /\[obligatorisk\]/i.test(part),
          sort_order: idx,
        }));
        if (questions.length > 0) await supabase.from("checklist_template_questions").insert(questions);
      }

      // Assign to active store for store-scope templates
      if (importScope === "store" && activeStore) {
        await supabase.from("template_stores").insert({ template_id: tmpl.id, store_id: activeStore.id });
      }

      logAudit(user?.id ?? null, "template.import", "checklist_templates", tmpl.id, { title: title.trim(), scope: importScope });
    }

    await load();
    setImporting(false);
  };

  // Templates grouped for display
  const hkTemplates = templates.filter((t) => t.hierarchy_scope === "hk" || (t.is_global && !t.hierarchy_scope));
  const foreningTemplates = templates.filter((t) => t.hierarchy_scope === "forening");
  const storeTemplates = templates.filter((t) => !t.hierarchy_scope || t.hierarchy_scope === "store");

  const visibleGroups: { label: string; badge: string; badgeClass: string; items: TemplateWithMeta[] }[] = [];
  if (viewFilter === "all" || viewFilter === "hk") {
    if (hkTemplates.length > 0 || viewFilter === "hk") {
      visibleGroups.push({ label: "HK-mallar", badge: "HK", badgeClass: "border-blue-300 text-blue-600", items: hkTemplates });
    }
  }
  if (viewFilter === "all" || viewFilter === "forening") {
    if (foreningTemplates.length > 0 || viewFilter === "forening") {
      visibleGroups.push({ label: "Föreningsmallar", badge: "Förening", badgeClass: "border-teal-300 text-teal-600", items: foreningTemplates });
    }
  }
  if (viewFilter === "all" || viewFilter === "store") {
    if (storeTemplates.length > 0 || viewFilter === "store") {
      visibleGroups.push({ label: "Butiksmallar", badge: "Butik", badgeClass: "border-border text-muted-foreground", items: storeTemplates });
    }
  }

  const getTemplateBadge = (t: TemplateWithMeta) => {
    const scope = t.hierarchy_scope ?? "store";
    if (scope === "hk" || t.is_global) return { label: "HK-mall", cls: "border-blue-300 text-blue-600" };
    if (scope === "forening") {
      const f = allForeningar.find((x) => x.id === t.forening_id);
      return { label: `${f?.name ?? "Förening"}-mall`, cls: "border-teal-300 text-teal-600" };
    }
    return null;
  };

  const isHiddenForMyForening = (t: TemplateWithMeta) =>
    !!(user?.forening_id && hiddenEntries.some((h) => h.template_id === t.id && h.forening_id === user.forening_id));

  // Shared form panels rendered for both create and edit dialogs
  function renderFormContent(
    f: FormState,
    setF: React.Dispatch<React.SetStateAction<FormState>>,
    scope: "store" | "hk" | "forening"
  ) {
    return (
      <div className="flex overflow-hidden" style={{ maxHeight: "calc(92dvh - 56px)" }}>
        {/* LEFT */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
          <input
            placeholder="Mallens namn..."
            value={f.title}
            onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))}
            className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none focus:outline-none"
          />
          <Textarea
            placeholder="Kort beskrivning av vad mallen används till..."
            value={f.description}
            onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))}
            rows={2}
            className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
          />

          {/* Steg */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Steg</p>
            <div className="space-y-1.5">
              {f.items.map((item, idx) => (
                <div key={idx} className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                  <Input
                    placeholder={`Steg ${idx + 1}`}
                    value={item.label}
                    onChange={(e) => {
                      const items = [...f.items]; items[idx] = { ...items[idx], label: e.target.value };
                      setF((p) => ({ ...p, items }));
                    }}
                    className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                  />
                  <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/70 cursor-pointer">
                    <Checkbox
                      checked={item.requires_photo}
                      onCheckedChange={(v) => {
                        const items = [...f.items]; items[idx] = { ...items[idx], requires_photo: !!v };
                        setF((p) => ({ ...p, items }));
                      }}
                      className="h-3 w-3"
                    />
                    Foto
                  </label>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setF((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                    disabled={f.items.length === 1}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              onClick={() => setF((p) => ({ ...p, items: [...p.items, { label: "", requires_photo: false }] }))}
            >
              <Plus className="h-3.5 w-3.5" /> Lägg till steg
            </button>
          </div>

          {/* Frågor */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frågor</p>
            <div className="space-y-2">
              {f.questions.map((q, idx) => (
                <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={`Fråga ${idx + 1}`}
                      value={q.label}
                      onChange={(e) => {
                        const qs = [...f.questions]; qs[idx] = { ...qs[idx], label: e.target.value };
                        setF((p) => ({ ...p, questions: qs }));
                      }}
                      className="flex-1 border-0 bg-transparent p-0 h-auto text-sm shadow-none focus-visible:ring-0"
                    />
                    <button type="button" onClick={() => setF((p) => ({ ...p, questions: p.questions.filter((_, i) => i !== idx) }))}>
                      <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {(["text", "yes_no"] as const).map((type) => (
                        <button key={type} type="button"
                          className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                            (q.question_type ?? "text") === type ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                          onClick={() => { const qs = [...f.questions]; qs[idx] = { ...qs[idx], question_type: type }; setF((p) => ({ ...p, questions: qs })); }}>
                          {type === "text" ? "Text" : "Ja/Nej"}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={q.is_required}
                        onCheckedChange={(v) => { const qs = [...f.questions]; qs[idx] = { ...qs[idx], is_required: !!v }; setF((p) => ({ ...p, questions: qs })); }}
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
              onClick={() => setF((p) => ({ ...p, questions: [...p.questions, { label: "", question_type: "text", is_required: false }] }))}
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
              <div className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center">
                <span className="text-xs text-muted-foreground/60">#</span>
              </div>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="text-xs text-muted-foreground">Kategori</span>
                <Input placeholder="t.ex. Rengöring" value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))} className="h-7 border border-border/60 text-xs" />
              </div>
            </div>

            {/* Prioritet */}
            <div className="flex items-center gap-3 px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Prioritet</span>
              <Select value={f.priority} onValueChange={(v) => setF((p) => ({ ...p, priority: v }))}>
                <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0 justify-end"><SelectValue /></SelectTrigger>
                <SelectContent>{["Låg", "Medel", "Hög", "Kritisk"].map((pr) => <SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Förfallodagar */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground">Förfaller om (dagar)</span>
                <Input type="number" min={0} placeholder="t.ex. 1" value={f.due_date_offset} onChange={(e) => setF((p) => ({ ...p, due_date_offset: e.target.value }))} className="h-7 border border-border/60 text-xs" />
              </div>
            </div>

            {/* Återkommande */}
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <Repeat className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span className="w-20 shrink-0 text-xs text-muted-foreground">Återkommande</span>
                <Select value={f.recurrence_rule || "__none"} onValueChange={(v) => setF((p) => ({ ...p, recurrence_rule: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="flex-1 h-7 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0 justify-end"><SelectValue placeholder="Ingen" /></SelectTrigger>
                  <SelectContent>{RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value || "__none"} value={o.value || "__none"}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {f.recurrence_rule === "weekly" && (
                <div className="flex flex-wrap gap-1 pl-7">
                  {WEEKDAYS.map((day, idx) => (
                    <button key={idx} type="button"
                      className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                        f.recurrence_days.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50")}
                      onClick={() => {
                        const days = f.recurrence_days.includes(idx) ? f.recurrence_days.filter((d) => d !== idx) : [...f.recurrence_days, idx];
                        setF((p) => ({ ...p, recurrence_days: days }));
                      }}>
                      {day}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Förening selector — shown when scope is forening and user is admin */}
            {scope === "forening" && isAdmin && (
              <div className="px-4 py-3 space-y-1">
                <span className="text-xs text-muted-foreground">Publicera till förening</span>
                <Select value={f.foreningId || "__none"} onValueChange={(v) => setF((p) => ({ ...p, foreningId: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-7 border border-border/60 text-xs"><SelectValue placeholder="Välj förening" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Välj förening</SelectItem>
                    {allForeningar.map((f2) => <SelectItem key={f2.id} value={f2.id}>{f2.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Store assignments — only for store-scope templates */}
            {scope === "store" && displayStores.length > 0 && (
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Tilldelade butiker{user?.role === "manager" && <span className="ml-1 text-destructive">*</span>}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      onClick={() => setBroadcastConfirm(editTarget ? "edit" : "create")}
                    >
                      <StoreIcon className="h-3 w-3" /> Alla butiker
                    </button>
                  )}
                </div>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {displayStores.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                      <Checkbox
                        checked={f.storeIds.includes(s.id)}
                        onCheckedChange={() => toggleStore(s.id, f.storeIds, (ids) => setF((p) => ({ ...p, storeIds: ids })))}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Locked — admin only, for HK templates */}
            {isAdmin && scope === "hk" && (
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Låst</span>
                  <p className="text-[10px] text-muted-foreground/60">Chefer kan inte redigera</p>
                </div>
                <Switch checked={f.isLocked} onCheckedChange={(v) => setF((p) => ({ ...p, isLocked: v }))} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Mallar"
        description="Återanvändbara checklistor och rutiner."
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Import dialog */}
            <ImportDialog
              open={showImportDialog}
              onClose={() => setShowImportDialog(false)}
              onImport={importCSV}
              title="Importera mallar"
              description="Ladda upp en CSV-fil med mallar. Rader som börjar med # ignoreras."
              loading={importing}
              importLabel="Importera mallar"
              options={[
                ...(isAdmin ? [{
                  key: "scope",
                  type: "select" as const,
                  label: "Malltyp",
                  description: "Välj om mallarna ska skapas som HK-, förenings- eller butiksmallar",
                  options: [
                    { value: "store", label: "Butiksmall (aktiv butik)" },
                    { value: "hk", label: "HK-mall (global)" },
                    { value: "forening", label: "Föreningsmall" },
                  ],
                  defaultValue: "store",
                }, {
                  key: "foreningId",
                  type: "select" as const,
                  label: "Förening",
                  description: "Vilken förening ska föreningsmallar publiceras till",
                  options: [{ value: "", label: "Välj förening..." }, ...allForeningar.map(f => ({ value: f.id, label: f.name }))],
                  defaultValue: "",
                  showWhen: { key: "scope", value: "forening" },
                }] : isForening ? [{
                  key: "scope",
                  type: "select" as const,
                  label: "Malltyp",
                  options: [
                    { value: "forening", label: "Föreningsmall" },
                    { value: "store", label: "Butiksmall" },
                  ],
                  defaultValue: "forening",
                }] : []),
              ]}
            />
            {isManager && (
              <Button variant="outline" className="hidden sm:flex rounded-full" onClick={downloadBlankTemplate}>
                <Download className="mr-2 h-4 w-4" /> CSV-mall
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="hidden sm:flex rounded-full" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" /> Exportera
              </Button>
            )}
            {isManager && (
              <Button variant="outline" className="hidden sm:flex rounded-full" disabled={importing} onClick={() => setShowImportDialog(true)}>
                <Upload className="mr-2 h-4 w-4" /> {importing ? "Importerar..." : "Importera CSV"}
              </Button>
            )}
            {canCreateHK && (
              <Button variant="outline" className="hidden sm:flex rounded-full border-blue-300 text-blue-600 hover:bg-blue-50" onClick={() => openCreate("hk")}>
                <Plus className="mr-2 h-4 w-4" /> Ny HK-mall
              </Button>
            )}
            {canCreateForening && (
              <Button variant="outline" className="hidden sm:flex rounded-full border-teal-300 text-teal-600 hover:bg-teal-50" onClick={() => openCreate("forening")}>
                <Building2 className="mr-2 h-4 w-4" /> Ny föreningsmall
              </Button>
            )}
            {isManager && (
              <Button className="hidden sm:flex rounded-full" onClick={() => openCreate("store")}>
                <Plus className="mr-2 h-4 w-4" /> Ny butiksmall
              </Button>
            )}
          </div>
        }
      />

      {/* View filter tabs */}
      <div className="mt-4 flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1 w-fit">
        {[
          { key: "all", label: "Alla" },
          { key: "hk", label: "HK" },
          { key: "forening", label: "Förening" },
          { key: "store", label: "Butik" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setViewFilter(key as typeof viewFilter)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              viewFilter === key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : templates.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Inga mallar ännu</p>
          {isManager && (
            <Button className="mt-4 rounded-full" size="sm" onClick={() => openCreate("store")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Skapa mall
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                <Badge variant="outline" className={cn("text-xs", group.badgeClass)}>{group.badge}</Badge>
                <span className="text-xs text-muted-foreground">{group.items.length} mallar</span>
              </div>
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga mallar i denna kategori.</p>
              ) : (
                <div className="space-y-3">
                  {group.items.map((t) => {
                    const scopeBadge = getTemplateBadge(t);
                    const isHidden = isHiddenForMyForening(t);
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]",
                          isHidden && "opacity-60"
                        )}
                      >
                        <div className="flex w-full items-center justify-between hover:bg-muted/20">
                          <button
                            className="flex flex-1 items-center gap-3 px-5 py-4 text-left"
                            onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                          >
                            {expanded === t.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            <div>
                              <p className="font-medium">
                                {t.title}
                                {isHidden && <span className="ml-2 text-xs text-muted-foreground">(dold för din förening)</span>}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2">
                                {t.category && <Badge variant="secondary" className="text-xs">{t.category}</Badge>}
                                {scopeBadge && (
                                  <Badge variant="outline" className={cn("text-xs", scopeBadge.cls)}>{scopeBadge.label}</Badge>
                                )}
                                {t.locked_by_admin && !t.is_global && (
                                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">Skrivskyddad</Badge>
                                )}
                                <span className="text-xs text-muted-foreground">{t.items?.length ?? 0} steg</span>
                                {(t.questions?.length ?? 0) > 0 && <span className="text-xs text-muted-foreground">{t.questions?.length} frågor</span>}
                              </div>
                            </div>
                          </button>

                          <div className="mr-3 flex items-center gap-1">
                            {/* Förening can toggle hide/show HK templates */}
                            {isForening && (t.hierarchy_scope === "hk" || t.is_global) && (
                              <Button
                                variant="ghost" size="icon"
                                className={cn("rounded-full", isHidden ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground")}
                                onClick={(e) => { e.stopPropagation(); toggleHideHKTemplate(t); }}
                                title={isHidden ? "Visa HK-mall för din förening" : "Dölj HK-mall för din förening"}
                              >
                                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            {canEdit(t) && (
                              <Button
                                variant="ghost" size="icon"
                                className="rounded-full text-muted-foreground hover:text-primary"
                                onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                                aria-label="Redigera"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete(t) && (
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
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{idx + 1}</span>
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
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE DIALOG */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setError(""); }}>
        <DialogContent className="max-h-[92dvh] w-full sm:max-w-4xl sm:max-h-[92vh] overflow-hidden p-0 gap-0">
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              {createScope === "hk" ? "Ny HK-mall" : createScope === "forening" ? "Ny föreningsmall" : "Ny butiksmall"}
            </span>
            {form.title && <span className="text-sm font-semibold text-foreground truncate max-w-xs">{form.title}</span>}
            <div className="ml-auto flex items-center gap-2">
              {error && <span className="text-xs text-destructive">{error}</span>}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowCreate(false)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" onClick={createTemplate} disabled={saving}>
                {saving ? "Sparar..." : "Spara mall"}
              </Button>
            </div>
          </div>
          {renderFormContent(form, setForm, createScope)}
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
              <Button size="sm" className="rounded-full" onClick={saveEdit} disabled={saving}>
                {saving ? "Sparar..." : "Spara ändringar"}
              </Button>
            </div>
          </div>
          {editTarget && renderFormContent(editForm, setEditForm, (editTarget.hierarchy_scope as "store" | "hk" | "forening") ?? "store")}
        </DialogContent>
      </Dialog>

      {/* BROADCAST CONFIRM */}
      <AlertDialog open={!!broadcastConfirm} onOpenChange={(o) => !o && setBroadcastConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skicka till alla butiker</AlertDialogTitle>
            <AlertDialogDescription>
              Denna mall blir synlig i <strong>{allStores.length} butiker</strong>. Vill du fortsätta?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (broadcastConfirm === "create") setForm((p) => ({ ...p, storeIds: allStores.map((s) => s.id) }));
              else setEditForm((p) => ({ ...p, storeIds: allStores.map((s) => s.id) }));
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
              Är du säker på att du vill ta bort <strong>{deleteTarget?.title}</strong>?
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
