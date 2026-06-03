import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink, X, Globe, Store as StoreIcon, Building2, Search, Link as LinkIcon, ChevronLeft } from "lucide-react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, type LinkList, type LinkListItem, type Forening, type Store, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lankregister")({
  component: LankregisterPage,
});

type ListWithItems = LinkList & { items: LinkListItem[] };

type ListFormState = {
  name: string;
  description: string;
  scope: "store" | "forening" | "hk";
  store_id: string;
  forening_id: string;
};

type ItemFormState = {
  title: string;
  url: string;
  description: string;
};

const emptyListForm = (): ListFormState => ({
  name: "", description: "", scope: "store", store_id: "", forening_id: "",
});

const emptyItemForm = (): ItemFormState => ({
  title: "", url: "", description: "",
});

function scopeLabel(scope: string) {
  if (scope === "hk") return "Huvudkontor";
  if (scope === "forening") return "Förening";
  return "Butik";
}

function scopeIcon(scope: string) {
  if (scope === "hk") return <Globe className="h-3.5 w-3.5" />;
  if (scope === "forening") return <Building2 className="h-3.5 w-3.5" />;
  return <StoreIcon className="h-3.5 w-3.5" />;
}

function scopeColor(scope: string): string {
  if (scope === "hk") return "bg-blue-50 text-blue-700 border-blue-200";
  if (scope === "forening") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function LankregisterPage() {
  const { user, activeStore, userStores } = useAuth();

  const isAdmin = user?.role === "admin";
  const isHK = user?.hierarchy_level === "hk" || isAdmin;
  const isForening = user?.hierarchy_level === "forening";
  const isManager = user?.role === "manager" || isAdmin;
  const canManage = isAdmin || isHK || isForening || isManager;

  const [lists, setLists] = useState<ListWithItems[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [allForeningar, setAllForeningar] = useState<Forening[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedList, setSelectedList] = useState<ListWithItems | null>(null);
  const [search, setSearch] = useState("");

  // List CRUD
  const [showCreateList, setShowCreateList] = useState(false);
  const [editListTarget, setEditListTarget] = useState<ListWithItems | null>(null);
  const [deleteListTarget, setDeleteListTarget] = useState<ListWithItems | null>(null);
  const [listForm, setListForm] = useState<ListFormState>(emptyListForm());
  const [savingList, setSavingList] = useState(false);
  const [listError, setListError] = useState("");

  // Item CRUD
  const [showAddItem, setShowAddItem] = useState(false);
  const [editItemTarget, setEditItemTarget] = useState<{ item: LinkListItem; listId: string } | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ item: LinkListItem; listId: string } | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm());
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState("");

  useEffect(() => { load(); }, [user, activeStore]);

  async function load() {
    setLoading(true);
    const [listsRes, storesRes, foreningarRes] = await Promise.all([
      supabase.from("link_lists").select("*, items:link_list_items(*)").order("name"),
      supabase.from("stores").select("*").order("name"),
      supabase.from("foreningar").select("*").order("name"),
    ]);

    const userStoreIds = userStores.map((s) => s.id);
    const userForeningId = user?.forening_id ?? null;
    const raw = (listsRes.data ?? []) as ListWithItems[];
    const storeData = (storesRes.data ?? []) as Store[];

    const filtered = raw.filter((l) => {
      if (isAdmin) return true;
      if (l.scope === "hk") return true;
      if (l.scope === "forening") {
        if (!l.forening_id) return false;
        if (isForening && userForeningId === l.forening_id) return true;
        const storeForeningIds = storeData
          .filter((s) => userStoreIds.includes(s.id))
          .map((s) => s.forening_id);
        return storeForeningIds.includes(l.forening_id);
      }
      if (l.scope === "store") {
        if (!l.store_id) return false;
        return userStoreIds.includes(l.store_id) || activeStore?.id === l.store_id;
      }
      return false;
    });

    const sorted = filtered.map((l) => ({
      ...l,
      items: [...(l.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    }));

    setLists(sorted);
    setAllStores(storeData);
    setAllForeningar((foreningarRes.data ?? []) as Forening[]);

    if (selectedList) {
      const updated = sorted.find((l) => l.id === selectedList.id);
      setSelectedList(updated ?? null);
    }
    setLoading(false);
  }

  async function saveList() {
    setListError("");
    if (!listForm.name.trim()) { setListError("Namn är obligatoriskt."); return; }
    if (listForm.scope === "store" && !listForm.store_id) { setListError("Välj en butik."); return; }
    if (listForm.scope === "forening" && !listForm.forening_id) { setListError("Välj en förening."); return; }
    setSavingList(true);

    const payload = {
      name: listForm.name.trim(),
      description: listForm.description.trim() || null,
      scope: listForm.scope,
      store_id: listForm.scope === "store" ? listForm.store_id : null,
      forening_id: listForm.scope === "forening" ? listForm.forening_id : null,
      created_by: user?.id ?? null,
    };

    if (editListTarget) {
      await supabase.from("link_lists").update(payload).eq("id", editListTarget.id);
      logAudit(user?.id ?? null, "link_list.edit", "link_lists", editListTarget.id, { name: payload.name });
      setEditListTarget(null);
    } else {
      const { data } = await supabase.from("link_lists").insert(payload).select("id").maybeSingle();
      if (data?.id) logAudit(user?.id ?? null, "link_list.create", "link_lists", data.id, { name: payload.name });
      setShowCreateList(false);
    }
    setSavingList(false);
    await load();
  }

  async function deleteList() {
    if (!deleteListTarget) return;
    await supabase.from("link_lists").delete().eq("id", deleteListTarget.id);
    logAudit(user?.id ?? null, "link_list.delete", "link_lists", deleteListTarget.id, { name: deleteListTarget.name });
    if (selectedList?.id === deleteListTarget.id) setSelectedList(null);
    setDeleteListTarget(null);
    await load();
  }

  async function saveItem(listId: string) {
    setItemError("");
    if (!itemForm.title.trim()) { setItemError("Titel är obligatorisk."); return; }
    if (!itemForm.url.trim()) { setItemError("URL är obligatorisk."); return; }
    setSavingItem(true);

    const list = lists.find((l) => l.id === listId);
    const currentMax = (list?.items ?? []).reduce((m, it) => Math.max(m, it.sort_order), -1);

    if (editItemTarget) {
      await supabase.from("link_list_items").update({
        title: itemForm.title.trim(),
        url: itemForm.url.trim(),
        description: itemForm.description.trim() || null,
      }).eq("id", editItemTarget.item.id);
      setEditItemTarget(null);
    } else {
      await supabase.from("link_list_items").insert({
        list_id: listId,
        title: itemForm.title.trim(),
        url: itemForm.url.trim(),
        description: itemForm.description.trim() || null,
        sort_order: currentMax + 1,
      });
      setShowAddItem(false);
    }
    setSavingItem(false);
    await load();
  }

  async function deleteItem() {
    if (!deleteItemTarget) return;
    await supabase.from("link_list_items").delete().eq("id", deleteItemTarget.item.id);
    setDeleteItemTarget(null);
    await load();
  }

  function openCreateList() {
    setListForm({
      ...emptyListForm(),
      scope: isHK ? "hk" : isForening ? "forening" : "store",
      store_id: activeStore?.id ?? "",
      forening_id: user?.forening_id ?? "",
    });
    setListError("");
    setShowCreateList(true);
  }

  function openEditList(l: ListWithItems) {
    setListForm({ name: l.name, description: l.description ?? "", scope: l.scope, store_id: l.store_id ?? "", forening_id: l.forening_id ?? "" });
    setListError("");
    setEditListTarget(l);
  }

  function canEditList(l: ListWithItems): boolean {
    if (isAdmin) return true;
    if (l.scope === "hk") return isHK;
    if (l.scope === "forening") return isForening && l.forening_id === user?.forening_id;
    if (l.scope === "store") return isManager && userStores.some((s) => s.id === l.store_id);
    return false;
  }

  const filteredLists = lists.filter((l) =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) || (l.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const listScopeName = (l: ListWithItems) => {
    if (l.scope === "store") return allStores.find((s) => s.id === l.store_id)?.name ?? "";
    if (l.scope === "forening") return allForeningar.find((f) => f.id === l.forening_id)?.name ?? "";
    return "Alla butiker";
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Länkregister"
        subtitle="Länksamlingar för butiker och föreningar"
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreateList} className="gap-2">
              <Plus className="h-4 w-4" /> Ny lista
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR — list of link lists; hidden on mobile when a list is selected */}
        <div className={cn(
          "flex flex-col border-r border-border/60 bg-muted/5 transition-all",
          "w-full sm:w-80 sm:shrink-0",
          selectedList ? "hidden sm:flex" : "flex"
        )}>
          {/* Search */}
          <div className="border-b border-border/50 px-3 py-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Sök listor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm bg-background"
              />
            </div>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredLists.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <LinkIcon className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Inga länklistor</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {search ? "Inga listor matchar sökningen" : "Skapa din första länklista"}
                  </p>
                </div>
                {canManage && !search && (
                  <Button size="sm" variant="outline" onClick={openCreateList} className="gap-2">
                    <Plus className="h-3.5 w-3.5" /> Skapa lista
                  </Button>
                )}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredLists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedList(l)}
                    className={cn(
                      "group w-full rounded-xl px-3 py-3 text-left transition-all",
                      "hover:bg-muted/60 active:scale-[0.99]",
                      selectedList?.id === l.id
                        ? "bg-primary/8 ring-1 ring-primary/20"
                        : "bg-transparent"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        scopeColor(l.scope)
                      )}>
                        {scopeIcon(l.scope)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{l.name}</p>
                          {canEditList(l) && (
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openEditList(l); }}
                                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-background"
                              >
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDeleteListTarget(l); }}
                                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3 w-3 text-destructive/60" />
                              </button>
                            </div>
                          )}
                        </div>
                        {l.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">{l.description}</p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground/70">{listScopeName(l)}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-[11px] text-muted-foreground/70">{l.items.length} länk{l.items.length !== 1 ? "ar" : ""}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MAIN CONTENT — selected list detail */}
        <div className={cn(
          "flex-1 overflow-y-auto",
          !selectedList ? "hidden sm:block" : "block"
        )}>
          {!selectedList ? (
            <div className="flex flex-col items-center justify-center gap-4 h-full text-center px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <LinkIcon className="h-7 w-7 text-muted-foreground/30" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Välj en länklista</p>
                <p className="mt-1 text-xs text-muted-foreground">Klicka på en lista till vänster för att se dess innehåll</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Detail header */}
              <div className="flex items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3 sm:px-6 sm:py-4 sticky top-0 z-10">
                <button
                  type="button"
                  onClick={() => setSelectedList(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors sm:hidden"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                  scopeColor(selectedList.scope)
                )}>
                  {scopeIcon(selectedList.scope)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold leading-tight truncate">{selectedList.name}</h2>
                  {selectedList.description && (
                    <p className="text-xs text-muted-foreground truncate">{selectedList.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 hidden sm:flex items-center gap-1", scopeColor(selectedList.scope))}>
                    {scopeIcon(selectedList.scope)}
                    {scopeLabel(selectedList.scope)}
                    {selectedList.scope !== "hk" && (
                      <span className="ml-0.5 text-current/70">· {listScopeName(selectedList)}</span>
                    )}
                  </Badge>
                  {canEditList(selectedList) && (
                    <Button
                      size="sm"
                      onClick={() => { setItemForm(emptyItemForm()); setItemError(""); setShowAddItem(true); }}
                      className="gap-1.5 h-8"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Lägg till länk</span>
                      <span className="sm:hidden">Lägg till</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Links list */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {selectedList.items.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-16 text-center border border-dashed border-border/60 rounded-2xl">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                      <LinkIcon className="h-5 w-5 text-muted-foreground/30" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Inga länkar ännu</p>
                      <p className="mt-1 text-xs text-muted-foreground">Lägg till den första länken i listan</p>
                    </div>
                    {canEditList(selectedList) && (
                      <Button size="sm" variant="outline" onClick={() => { setItemForm(emptyItemForm()); setItemError(""); setShowAddItem(true); }} className="gap-2">
                        <Plus className="h-3.5 w-3.5" /> Lägg till länk
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedList.items.map((item) => (
                      <div
                        key={item.id}
                        className="group relative flex flex-col gap-2 rounded-xl border border-border/50 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                              <LinkIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{item.title}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                              )}
                            </div>
                          </div>
                          {canEditList(selectedList) && (
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => { setItemForm({ title: item.title, url: item.url, description: item.description ?? "" }); setItemError(""); setEditItemTarget({ item, listId: selectedList.id }); }}
                                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted"
                              >
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteItemTarget({ item, listId: selectedList.id })}
                                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3 w-3 text-destructive/60" />
                              </button>
                            </div>
                          )}
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground hover:bg-primary/8 hover:text-primary transition-colors group/link"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 group-hover/link:text-primary transition-colors" />
                          <span className="truncate min-w-0">{item.url}</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit list dialog */}
      <Dialog
        open={showCreateList || !!editListTarget}
        onOpenChange={(open) => { if (!open) { setShowCreateList(false); setEditListTarget(null); } }}
      >
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold">{editListTarget ? "Redigera lista" : "Ny länklista"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{editListTarget ? "Uppdatera listans information" : "Skapa en ny samling av länkar"}</p>
            </div>
            <button onClick={() => { setShowCreateList(false); setEditListTarget(null); }} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Namn</label>
              <Input
                placeholder="t.ex. Leverantörslänkar"
                value={listForm.name}
                onChange={(e) => setListForm((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Beskrivning <span className="font-normal">(valfri)</span></label>
              <Textarea
                placeholder="Kort beskrivning av listans innehåll"
                value={listForm.description}
                onChange={(e) => setListForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Synlighet</label>
              <Select value={listForm.scope} onValueChange={(v) => setListForm((p) => ({ ...p, scope: v as ListFormState["scope"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isHK && <SelectItem value="hk">Alla butiker (Huvudkontor)</SelectItem>}
                  {(isForening || isHK || isAdmin) && <SelectItem value="forening">Specifik förening</SelectItem>}
                  <SelectItem value="store">Specifik butik</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {listForm.scope === "store" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Butik</label>
                <Select value={listForm.store_id} onValueChange={(v) => setListForm((p) => ({ ...p, store_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Välj butik" /></SelectTrigger>
                  <SelectContent>
                    {(isAdmin ? allStores : allStores.filter((s) => userStores.some((us) => us.id === s.id))).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {listForm.scope === "forening" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Förening</label>
                <Select value={listForm.forening_id} onValueChange={(v) => setListForm((p) => ({ ...p, forening_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Välj förening" /></SelectTrigger>
                  <SelectContent>
                    {(isAdmin ? allForeningar : allForeningar.filter((f) => f.id === user?.forening_id)).map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {listError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{listError}</p>}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => { setShowCreateList(false); setEditListTarget(null); }} className="flex-1">
                Avbryt
              </Button>
              <Button onClick={saveList} disabled={savingList} className="flex-1">
                {savingList ? "Sparar..." : editListTarget ? "Spara" : "Skapa lista"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit item dialog */}
      <Dialog
        open={showAddItem || !!editItemTarget}
        onOpenChange={(open) => { if (!open) { setShowAddItem(false); setEditItemTarget(null); } }}
      >
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold">{editItemTarget ? "Redigera länk" : "Ny länk"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {editItemTarget ? "Uppdatera länkens uppgifter" : `Lägg till i "${selectedList?.name}"`}
              </p>
            </div>
            <button onClick={() => { setShowAddItem(false); setEditItemTarget(null); }} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Titel</label>
              <Input
                placeholder="t.ex. Leverantörens hemsida"
                value={itemForm.title}
                onChange={(e) => setItemForm((p) => ({ ...p, title: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">URL</label>
              <div className="relative">
                <ExternalLink className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  placeholder="https://..."
                  value={itemForm.url}
                  onChange={(e) => setItemForm((p) => ({ ...p, url: e.target.value }))}
                  className="pl-9"
                />
              </div>
              {itemForm.url && (
                <a href={itemForm.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Testa länk
                </a>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Beskrivning <span className="font-normal">(valfri)</span></label>
              <Textarea
                placeholder="Kort beskrivning av sidan"
                value={itemForm.description}
                onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>

            {itemError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{itemError}</p>}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => { setShowAddItem(false); setEditItemTarget(null); }} className="flex-1">
                Avbryt
              </Button>
              <Button
                onClick={() => saveItem(editItemTarget?.listId ?? selectedList?.id ?? "")}
                disabled={savingItem}
                className="flex-1"
              >
                {savingItem ? "Sparar..." : editItemTarget ? "Spara" : "Lägg till"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete list confirm */}
      <AlertDialog open={!!deleteListTarget} onOpenChange={(open) => { if (!open) setDeleteListTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort lista</AlertDialogTitle>
            <AlertDialogDescription>
              Ta bort "{deleteListTarget?.name}"? Alla länkposter i listan tas bort permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={deleteList} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete item confirm */}
      <AlertDialog open={!!deleteItemTarget} onOpenChange={(open) => { if (!open) setDeleteItemTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort länk</AlertDialogTitle>
            <AlertDialogDescription>
              Ta bort "{deleteItemTarget?.item.title}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
