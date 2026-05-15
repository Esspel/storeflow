import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Download, GripVertical } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, type ChecklistTemplate, type ChecklistTemplateItem, type Store, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/mallar")({
  component: MallarPage,
});

function MallarPage() {
  const { user, activeStore, userStores } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const [templates, setTemplates] = useState<(ChecklistTemplate & { storeIds: string[] })[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    storeIds: [] as string[],
    items: [{ label: "", requires_photo: false }] as { label: string; requires_photo: boolean }[],
  });

  useEffect(() => { load(); }, [user, activeStore]);

  async function load() {
    setLoading(true);
    const [templatesRes, storesRes, tsRes] = await Promise.all([
      supabase.from("checklist_templates").select("*, items:checklist_template_items(*)").order("created_at", { ascending: false }),
      supabase.from("stores").select("*").order("name"),
      supabase.from("template_stores").select("template_id, store_id"),
    ]);

    const storeAssignments = (tsRes.data ?? []) as { template_id: string; store_id: string }[];
    const raw = (templatesRes.data ?? []) as ChecklistTemplate[];
    const withStores = raw.map((t) => ({
      ...t,
      storeIds: storeAssignments.filter((a) => a.template_id === t.id).map((a) => a.store_id),
    }));

    // Filter templates by active store: show templates assigned to active store OR global templates (no store assignment)
    const filtered = withStores.filter((t) => {
      if (t.storeIds.length === 0) return true; // global template
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
    setSaving(true);

    const { data: tmpl } = await supabase.from("checklist_templates").insert({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      created_by: user?.id ?? null,
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

    if (form.storeIds.length > 0) {
      await supabase.from("template_stores").insert(
        form.storeIds.map((sid) => ({ template_id: tmpl.id, store_id: sid }))
      );
    }

    logAudit(user?.id ?? null, "template.create", "checklist_templates", tmpl.id, { title: form.title });
    await load();
    setSaving(false);
    setShowCreate(false);
    setForm({ title: "", description: "", category: "", storeIds: [], items: [{ label: "", requires_photo: false }] });
  }

  async function deleteTemplate() {
    if (!deleteTarget) return;
    await supabase.from("checklist_templates").delete().eq("id", deleteTarget.id);
    logAudit(user?.id ?? null, "template.delete", "checklist_templates", deleteTarget.id, { title: deleteTarget.title });
    setDeleteTarget(null);
    await load();
  }

  const displayStores = user?.role === "admin" ? allStores : userStores;

  const exportCSV = () => {
    const rows = [
      ["Titel", "Kategori", "Beskrivning", "Antal steg", "Butiker"],
      ...templates.map((t) => [
        t.title,
        t.category,
        t.description,
        t.items?.length ?? 0,
        t.storeIds.map((sid) => allStores.find(s => s.id === sid)?.name ?? sid).join(", "),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mallar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Mallar"
        description="Återanvändbara checklistor och rutiners mallar."
        actions={
          <div className="flex gap-2">
            {templates.length > 0 && (
              <Button variant="outline" className="rounded-full" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" /> Exportera CSV
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
                      <span className="text-xs text-muted-foreground">{t.items?.length ?? 0} steg</span>
                    </div>
                  </div>
                </button>
                {isManager && (
                  <Button
                    variant="ghost" size="icon"
                    className="mr-3 rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(t)}
                    aria-label="Ta bort"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {expanded === t.id && (
                <div className="border-t border-border/60 px-5 py-4">
                  {t.description && <p className="mb-3 text-sm text-muted-foreground">{t.description}</p>}
                  {(t.items?.length ?? 0) > 0 && (
                    <ol className="space-y-2">
                      {(t.items ?? []).sort((a, b) => a.sort_order - b.sort_order).map((item: ChecklistTemplateItem, idx: number) => (
                        <li key={item.id} className="flex items-center gap-2.5 text-sm">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{idx + 1}</span>
                          <span>{item.label}</span>
                          {item.requires_photo && <Badge variant="secondary" className="text-xs">Foto krävs</Badge>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {t.storeIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
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

      {/* CREATE DIALOG */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setError(""); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ny mall</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Titel *</Label>
              <Input placeholder="Öppningskontroll" value={form.title}
                onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Input placeholder="Rengöring" value={form.category}
                  onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivning</Label>
              <Textarea placeholder="Kort beskrivning..." value={form.description}
                onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label>Steg</Label>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    <Input
                      placeholder={`Steg ${idx + 1}`} value={item.label}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx] = { ...items[idx], label: e.target.value };
                        setForm(p => ({ ...p, items }));
                      }}
                      className="flex-1"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Checkbox
                        checked={item.requires_photo}
                        onCheckedChange={(v) => {
                          const items = [...form.items];
                          items[idx] = { ...items[idx], requires_photo: !!v };
                          setForm(p => ({ ...p, items }));
                        }}
                      />
                      Foto
                    </label>
                    <Button variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(idx)} disabled={form.items.length === 1}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="rounded-full" onClick={addItem}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Lägg till steg
                </Button>
              </div>
            </div>

            {displayStores.length > 0 && (
              <div className="space-y-1.5">
                <Label>Tilldelade butiker</Label>
                <div className="max-h-32 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                  {displayStores.map(s => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                      <Checkbox checked={form.storeIds.includes(s.id)}
                        onCheckedChange={() => toggleStore(s.id, form.storeIds, (ids) => setForm(p => ({ ...p, storeIds: ids })))} />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Avbryt</Button>
            <Button onClick={createTemplate} disabled={saving}>{saving ? "Sparar..." : "Spara mall"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
