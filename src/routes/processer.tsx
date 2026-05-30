import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Download, GripVertical,
  Upload, X, Search, Layers, Pencil, ArrowUp, ArrowDown,
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
import {
  supabase, type Process, type ProcessTemplate, type ChecklistTemplate,
  type ChecklistTemplateItem, logAudit,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

// CSV header for processes export
const PROCESS_CSV_INSTRUCTIONS = `# INSTRUKTIONER (dessa rader ignoreras vid import)
# Kolumner: Processnamn;Kategori;Beskrivning;Mall-ID-1;Mall-ID-2;Mall-ID-3;...
# Obs: Lägg till ett Mall-ID per kolumn för varje mall i processen (max 20 mallar)
# Tips: Spara filen i UTF-8-format och använd semikolon (;) som separator
`;

type ProcessWithTemplates = Process & {
  templates: (ProcessTemplate & { template?: ChecklistTemplate & { items?: ChecklistTemplateItem[] } })[];
};

type FormState = {
  name: string;
  description: string;
  category: string;
  templateIds: string[];
  templateLabels: string[];
};

const emptyForm = (): FormState => ({
  name: "", description: "", category: "",
  templateIds: [], templateLabels: [],
});

export const Route = createFileRoute("/processer")({
  component: ProcesserPage,
});

function ProcesserPage() {
  const { user, activeStore } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const [processes, setProcesses] = useState<ProcessWithTemplates[]>([]);
  const [allTemplates, setAllTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ProcessWithTemplates | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProcessWithTemplates | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  useEffect(() => { void load(); }, [user, activeStore]);

  async function load() {
    setLoading(true);
    const [processesRes, templatesRes, ptRes] = await Promise.all([
      supabase.from("processes").select("*").order("name"),
      supabase.from("checklist_templates")
        .select("*, items:checklist_template_items(*)")
        .in("status", ["active", "review"])
        .order("title"),
      supabase.from("process_templates").select("*").order("sort_order"),
    ]);

    const templates = (templatesRes.data ?? []) as ChecklistTemplate[];
    const ptRows = (ptRes.data ?? []) as ProcessTemplate[];
    const procs = (processesRes.data ?? []) as Process[];

    const withTemplates: ProcessWithTemplates[] = procs.map((p) => ({
      ...p,
      templates: ptRows
        .filter((pt) => pt.process_id === p.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((pt) => ({ ...pt, template: templates.find((t) => t.id === pt.template_id) })),
    }));

    setProcesses(withTemplates);
    setAllTemplates(templates);
    setLoading(false);
  }

  const filteredProcesses = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return processes;
    return processes.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  }, [processes, search]);

  const availableTemplates = useMemo(() => {
    const q = templateSearch.toLowerCase();
    return allTemplates.filter((t) =>
      !q || t.title.toLowerCase().includes(q) || (t.category ?? "").toLowerCase().includes(q)
    );
  }, [allTemplates, templateSearch]);

  function addTemplateToForm(f: FormState, setF: (f: FormState) => void, templateId: string) {
    if (f.templateIds.includes(templateId)) return;
    setF({ ...f, templateIds: [...f.templateIds, templateId], templateLabels: [...f.templateLabels, ""] });
  }

  function removeTemplateFromForm(f: FormState, setF: (f: FormState) => void, idx: number) {
    const ids = [...f.templateIds]; ids.splice(idx, 1);
    const labels = [...f.templateLabels]; labels.splice(idx, 1);
    setF({ ...f, templateIds: ids, templateLabels: labels });
  }

  function moveTemplate(f: FormState, setF: (f: FormState) => void, idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= f.templateIds.length) return;
    const ids = [...f.templateIds];
    const labels = [...f.templateLabels];
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    [labels[idx], labels[newIdx]] = [labels[newIdx], labels[idx]];
    setF({ ...f, templateIds: ids, templateLabels: labels });
  }

  async function saveProcess(f: FormState, existingId?: string) {
    setError("");
    if (!f.name.trim()) { setError("Processnamn är obligatoriskt."); return; }
    if (f.templateIds.length === 0) { setError("Lägg till minst en mall i processen."); return; }
    setSaving(true);

    if (existingId) {
      await supabase.from("processes").update({
        name: f.name.trim(),
        description: f.description.trim(),
        category: f.category.trim(),
      }).eq("id", existingId);

      await supabase.from("process_templates").delete().eq("process_id", existingId);
      await supabase.from("process_templates").insert(
        f.templateIds.map((tid, idx) => ({
          process_id: existingId,
          template_id: tid,
          sort_order: idx,
          label: f.templateLabels[idx] ?? "",
        }))
      );
      logAudit(user?.id ?? null, "process.edit", "processes", existingId, { name: f.name });
    } else {
      const { data: proc } = await supabase.from("processes").insert({
        name: f.name.trim(),
        description: f.description.trim(),
        category: f.category.trim(),
        store_id: activeStore?.id ?? null,
        hierarchy_scope: "store",
        created_by: user?.id ?? null,
      }).select("id").maybeSingle();

      if (!proc?.id) { setSaving(false); return; }
      await supabase.from("process_templates").insert(
        f.templateIds.map((tid, idx) => ({
          process_id: proc.id,
          template_id: tid,
          sort_order: idx,
          label: f.templateLabels[idx] ?? "",
        }))
      );
      logAudit(user?.id ?? null, "process.create", "processes", proc.id, { name: f.name });
    }

    await load();
    setSaving(false);
    setShowCreate(false);
    setEditTarget(null);
    setForm(emptyForm());
  }

  async function deleteProcess() {
    if (!deleteTarget) return;
    await supabase.from("processes").delete().eq("id", deleteTarget.id);
    logAudit(user?.id ?? null, "process.delete", "processes", deleteTarget.id, { name: deleteTarget.name });
    setDeleteTarget(null);
    await load();
  }

  function openEdit(p: ProcessWithTemplates) {
    setEditTarget(p);
    setEditForm({
      name: p.name,
      description: p.description ?? "",
      category: p.category ?? "",
      templateIds: p.templates.map((pt) => pt.template_id),
      templateLabels: p.templates.map((pt) => pt.label ?? ""),
    });
    setError("");
  }

  const exportCSV = () => {
    const maxTemplates = Math.max(...processes.map((p) => p.templates.length), 0);
    const templateHeaders = Array.from({ length: maxTemplates }, (_, i) => `Mall-ID-${i + 1}`);
    const headers = ["Processnamn", "Kategori", "Beskrivning", ...templateHeaders];
    const rows = [
      headers,
      ...processes.map((p) => [
        p.name,
        p.category ?? "",
        p.description ?? "",
        ...p.templates.map((pt) => pt.template_id),
      ]),
    ];
    const instructions = `# Exporterat ${new Date().toLocaleDateString("sv-SE")}\n` + PROCESS_CSV_INSTRUCTIONS;
    const csv = instructions + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `processer-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function renderTemplateSelector(f: FormState, setF: (f: FormState) => void) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mallar i processen</p>

        {/* Selected templates ordered list */}
        {f.templateIds.length > 0 && (
          <div className="space-y-1.5">
            {f.templateIds.map((tid, idx) => {
              const tmpl = allTemplates.find((t) => t.id === tid);
              return (
                <div key={tid} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{tmpl?.title ?? tid}</p>
                    {tmpl?.category && <p className="text-[11px] text-muted-foreground">{tmpl.category}</p>}
                  </div>
                  <Input
                    placeholder="Stegnamn (valfritt)"
                    value={f.templateLabels[idx] ?? ""}
                    onChange={(e) => {
                      const labels = [...f.templateLabels]; labels[idx] = e.target.value;
                      setF({ ...f, templateLabels: labels });
                    }}
                    className="w-32 h-6 text-xs border border-border/60"
                  />
                  <button type="button" onClick={() => moveTemplate(f, setF, idx, -1)} disabled={idx === 0}>
                    <ArrowUp className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-30" />
                  </button>
                  <button type="button" onClick={() => moveTemplate(f, setF, idx, 1)} disabled={idx === f.templateIds.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground" />
                  </button>
                  <button type="button" onClick={() => removeTemplateFromForm(f, setF, idx)}>
                    <X className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-destructive" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Template picker */}
        <div className="space-y-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="Sök mallar att lägga till..."
              className="h-8 w-full rounded-lg border border-border/60 bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
            />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border/60 rounded-lg p-1">
            {availableTemplates.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Inga mallar hittades</p>
            ) : (
              availableTemplates.map((t) => {
                const added = f.templateIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => !added && addTemplateToForm(f, setF, t.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      added ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/50"
                    )}
                    disabled={added}
                  >
                    {added ? <span className="h-3.5 w-3.5 text-success">✓</span> : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="flex-1 truncate">{t.title}</span>
                    {t.category && <span className="text-muted-foreground/60">{t.category}</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Processer"
        description="Strukturerade arbetsflöden av mallar."
        actions={
          <div className="flex flex-wrap gap-2">
            {isManager && processes.length > 0 && (
              <Button variant="outline" className="hidden sm:flex rounded-full" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" /> Exportera CSV
              </Button>
            )}
            {isManager && (
              <Button className="hidden sm:flex rounded-full" onClick={() => { setForm(emptyForm()); setShowCreate(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Ny process
              </Button>
            )}
          </div>
        }
      />

      {/* Search */}
      <div className="mt-4 relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök processer..."
          className="h-8 w-full rounded-lg border border-border/60 bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : filteredProcesses.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">{search ? "Inga processer matchar sökningen" : "Inga processer ännu"}</p>
          {!search && isManager && (
            <Button className="mt-4 rounded-full" size="sm" onClick={() => { setForm(emptyForm()); setShowCreate(true); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Skapa process
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filteredProcesses.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
              <div className="flex w-full items-center justify-between hover:bg-muted/20">
                <button
                  className="flex flex-1 items-center gap-3 px-5 py-4 text-left"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
                  {expanded === p.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {p.category && <Badge variant="secondary" className="text-xs">{p.category}</Badge>}
                      <span className="text-xs text-muted-foreground">{p.templates.length} mallar</span>
                    </div>
                  </div>
                </button>
                {isManager && (
                  <div className="mr-3 flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon"
                      className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-primary"
                      onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {expanded === p.id && (
                <div className="border-t border-border/60 px-5 py-4 space-y-3">
                  {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                  <ol className="space-y-2">
                    {p.templates.map((pt, idx) => {
                      const tmpl = pt.template;
                      return (
                        <li key={pt.id} className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary mt-0.5">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{pt.label || tmpl?.title || pt.template_id}</p>
                            {pt.label && tmpl?.title && <p className="text-xs text-muted-foreground">{tmpl.title}</p>}
                            {tmpl && (
                              <div className="mt-0.5 flex items-center gap-2">
                                {tmpl.category && <span className="text-[11px] text-muted-foreground">{tmpl.category}</span>}
                                <span className="text-[11px] text-muted-foreground">{tmpl.items?.length ?? 0} steg</span>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE DIALOG */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setForm(emptyForm()); setError(""); } }}>
        <DialogContent className="max-h-[90dvh] w-full sm:max-w-2xl overflow-hidden p-0 gap-0">
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Ny process</span>
            {form.name && <span className="text-sm font-semibold truncate max-w-xs">{form.name}</span>}
            <div className="ml-auto flex items-center gap-2">
              {error && <span className="text-xs text-destructive">{error}</span>}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowCreate(false)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" onClick={() => void saveProcess(form)} disabled={saving}>
                {saving ? "Sparar..." : "Spara process"}
              </Button>
            </div>
          </div>
          <div className="overflow-y-auto p-6 space-y-5" style={{ maxHeight: "calc(90dvh - 56px)" }}>
            <input
              placeholder="Processens namn..."
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
            <Textarea
              placeholder="Beskriv processen..."
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
            />
            <Input
              placeholder="Kategori (t.ex. Varumottagning)"
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="h-8 text-sm"
            />
            {renderTemplateSelector(form, (f) => setForm(f))}
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) { setEditTarget(null); setError(""); } }}>
        <DialogContent className="max-h-[90dvh] w-full sm:max-w-2xl overflow-hidden p-0 gap-0">
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Redigera process</span>
            <div className="ml-auto flex items-center gap-2">
              {error && <span className="text-xs text-destructive">{error}</span>}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setEditTarget(null)}>Avbryt</Button>
              <Button size="sm" className="rounded-full" onClick={() => editTarget && void saveProcess(editForm, editTarget.id)} disabled={saving}>
                {saving ? "Sparar..." : "Spara ändringar"}
              </Button>
            </div>
          </div>
          <div className="overflow-y-auto p-6 space-y-5" style={{ maxHeight: "calc(90dvh - 56px)" }}>
            <input
              placeholder="Processens namn..."
              value={editForm.name}
              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full border-0 bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
            <Textarea
              placeholder="Beskriv processen..."
              value={editForm.description}
              onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 shadow-none"
            />
            <Input
              placeholder="Kategori"
              value={editForm.category}
              onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
              className="h-8 text-sm"
            />
            {renderTemplateSelector(editForm, (f) => setEditForm(f))}
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort process</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort <strong>{deleteTarget?.name}</strong>?
              Uppgifter kopplade till processen påverkas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void deleteProcess()}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
