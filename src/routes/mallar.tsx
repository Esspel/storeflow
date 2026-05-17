import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { FileText, Plus, Search, Lock, Globe, Store, CreditCard as Edit2, ChevronDown, X, TriangleAlert as AlertTriangle, Check, Shield } from "lucide-react";
import { supabase, type ChecklistTemplate, type TemplateItem, getSessionToken } from "@/lib/supabase";
import { useAuth, useIsAdmin } from "@/lib/auth-context";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/mallar")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: MallarPage,
});

function MallarPage() {
  const { user, activeStore } = useAuth();
  const isAdmin = useIsAdmin();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ChecklistTemplate | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("checklist_templates")
      .select("*, checklist_template_items(*)")
      .order("created_at", { ascending: false });
    setTemplates((data ?? []) as ChecklistTemplate[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search) return templates;
    const q = search.toLowerCase();
    return templates.filter(t => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [templates, search]);

  async function useTemplate(template: ChecklistTemplate) {
    if (!activeStore || !user) { toast.error("Välj en butik"); return; }
    try {
      const { data: task } = await supabase.from("tasks").insert({
        title: template.title,
        description: template.description,
        category: template.category,
        store_id: activeStore.id,
        created_by: user.id,
        priority: "Medel",
        status: "todo",
        template_task_id: template.id,
      }).select().single();

      if (task && template.checklist_template_items) {
        await supabase.from("task_steps").insert(
          template.checklist_template_items.map((item, i) => ({
            task_id: task.id,
            label: item.label,
            is_done: false,
            sort_order: i,
            requires_photo: item.requires_photo,
          }))
        );
      }
      toast.success(`Uppgift skapad från mall: ${template.title}`);
    } catch (e: unknown) {
      toast.error("Fel: " + String(e));
    }
  }

  async function deleteTemplate(id: string) {
    const t = templates.find(t => t.id === id);
    if (t?.is_system_locked && !isAdmin) {
      toast.error("Systemmallar kan inte tas bort");
      return;
    }
    if (!confirm("Ta bort mall?")) return;
    await supabase.from("checklist_templates").delete().eq("id", id);
    toast.success("Mall borttagen");
    load();
  }

  const groupedTemplates = useMemo(() => {
    const groups: Record<string, ChecklistTemplate[]> = {};
    filtered.forEach(t => {
      const cat = t.category || "Övrigt";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [filtered]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Mallar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Återanvändbara checklistor och uppgiftsmallar</p>
        </div>
        {(user?.role === "manager" || isAdmin) && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            Ny mall
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Sök mallar..."
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Laddar mallar...</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedTemplates).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</h2>
              <div className="space-y-2">
                {items.map(template => (
                  <div key={template.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div
                      className="p-4 flex items-start gap-3 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => setExpanded(expanded === template.id ? null : template.id)}
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
                        <FileText className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{template.title}</p>
                          {template.is_system_locked && (
                            <span className="flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                              <Lock className="w-2.5 h-2.5" />
                              Systemskyddad
                            </span>
                          )}
                          {template.is_global && (
                            <span className="flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                              <Globe className="w-2.5 h-2.5" />
                              Global
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {template.checklist_template_items?.length ?? 0} steg
                          </span>
                          <span className="text-xs text-muted-foreground">{template.hierarchy_scope ?? "store"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); useTemplate(template); }}
                          className="px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                        >
                          Använd
                        </button>
                        {(isAdmin || (!template.is_system_locked && user?.role !== "employee")) && (
                          <button
                            onClick={e => { e.stopPropagation(); setEditTemplate(template); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded === template.id && "rotate-180")} />
                      </div>
                    </div>

                    {expanded === template.id && (
                      <div className="border-t border-border px-4 py-3 space-y-1.5 bg-muted/20">
                        {template.description && (
                          <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                        )}
                        {(template.checklist_template_items ?? []).sort((a, b) => a.sort_order - b.sort_order).map(item => (
                          <div key={item.id} className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded border border-border bg-card shrink-0" />
                            <p className="text-xs text-foreground">{item.label}</p>
                            {item.requires_photo && <span className="text-[10px] text-info ml-auto">📷</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editTemplate) && (
        <TemplateDialog
          template={editTemplate}
          isAdmin={isAdmin}
          onClose={() => { setShowCreate(false); setEditTemplate(null); }}
          onSave={() => { setShowCreate(false); setEditTemplate(null); load(); }}
        />
      )}
    </div>
  );
}

function TemplateDialog({ template, isAdmin, onClose, onSave }: {
  template: ChecklistTemplate | null; isAdmin: boolean;
  onClose: () => void; onSave: () => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState(template?.category ?? "Drift");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isGlobal, setIsGlobal] = useState(template?.is_global ?? false);
  const [hierarchyScope, setHierarchyScope] = useState(template?.hierarchy_scope ?? "store");
  const [items, setItems] = useState<{ id?: string; label: string; sort_order: number; requires_photo: boolean }[]>(
    template?.checklist_template_items?.map(i => ({ id: i.id, label: i.label, sort_order: i.sort_order, requires_photo: i.requires_photo })) ?? []
  );
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title) { toast.error("Titel krävs"); return; }
    setSaving(true);
    try {
      if (template) {
        await supabase.from("checklist_templates").update({ title, category, description, is_global: isGlobal, hierarchy_scope: hierarchyScope }).eq("id", template.id);
        // sync items
        const existingIds = (template.checklist_template_items ?? []).map(i => i.id);
        const newIds = items.filter(i => i.id).map(i => i.id!);
        const toDelete = existingIds.filter(id => !newIds.includes(id));
        if (toDelete.length > 0) await supabase.from("checklist_template_items").delete().in("id", toDelete);
        for (const item of items) {
          if (item.id) await supabase.from("checklist_template_items").update({ label: item.label, sort_order: item.sort_order }).eq("id", item.id);
          else await supabase.from("checklist_template_items").insert({ template_id: template.id, label: item.label, sort_order: item.sort_order, requires_photo: item.requires_photo });
        }
        toast.success("Mall uppdaterad");
      } else {
        const { data } = await supabase.from("checklist_templates").insert({
          title, category, description, is_global: isGlobal, hierarchy_scope: hierarchyScope, is_frozen: false, is_system_locked: false, is_store_specific: !isGlobal,
        }).select().single();
        if (data && items.length > 0) {
          await supabase.from("checklist_template_items").insert(items.map(i => ({ template_id: data.id, label: i.label, sort_order: i.sort_order, requires_photo: i.requires_photo })));
        }
        toast.success("Mall skapad");
      }
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
          <h2 className="font-semibold">{template ? "Redigera mall" : "Ny mall"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {template?.is_system_locked && !isAdmin && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              <Shield className="w-4 h-4 shrink-0" />
              Denna mall är systemskyddad. Begränsad redigering.
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titel *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {["Drift", "Städning", "Säkerhet", "Påfyllning", "Administration", "Övrigt"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {isAdmin && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scope</label>
                <select value={hierarchyScope} onChange={e => setHierarchyScope(e.target.value)} className={inputCls}>
                  <option value="store">Butik</option>
                  <option value="distrikt">Distrikt</option>
                  <option value="forening">Förening</option>
                  <option value="hk">Huvudkontor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            )}
          </div>
          {isAdmin && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isGlobal} onChange={e => setIsGlobal(e.target.checked)} className="rounded border-border text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Global mall</p>
                <p className="text-xs text-muted-foreground">Synlig för alla butiker</p>
              </div>
            </label>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Beskrivning</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Steg</label>
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm bg-muted/50 rounded-xl px-3 py-2">{item.label}</span>
                <button onClick={() => setItems(ii => ii.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { setItems(ii => [...ii, { label: newItem.trim(), sort_order: ii.length, requires_photo: false }]); setNewItem(""); } }}
                placeholder="Nytt steg..."
                className={cn(inputCls, "flex-1")}
              />
              <button onClick={() => { if (newItem.trim()) { setItems(ii => [...ii, { label: newItem.trim(), sort_order: ii.length, requires_photo: false }]); setNewItem(""); } }} className="px-3 h-10 rounded-xl bg-muted text-sm font-medium">+</button>
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
