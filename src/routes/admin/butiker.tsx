import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Store,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { supabase, type Store as StoreType } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/butiker")({
  component: AdminStoresPage,
});

function AdminStoresPage() {
  const { user } = useAuth();
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteStoreId, setDeleteStoreId] = useState<string | null>(null);
  const [newStore, setNewStore] = useState({
    name: "",
    city: "",
    region: "",
    address: "",
    phone: "",
    email: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchStores = async () => {
    const { data } = await supabase.from("stores").select("*").order("name");
    if (data) setStores(data);
    setLoading(false);
  };

  useEffect(() => { fetchStores(); }, []);

  const createStore = async () => {
    if (!newStore.name) return;
    setSaving(true);
    await supabase.from("stores").insert(newStore);
    await fetchStores();
    setSaving(false);
    setShowCreate(false);
    setNewStore({ name: "", city: "", region: "", address: "", phone: "", email: "" });
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("stores").update({ is_active: !current }).eq("id", id);
    setStores((prev) => prev.map((s) => s.id === id ? { ...s, is_active: !current } : s));
  };

  const deleteStore = async (id: string) => {
    setSaving(true);
    await supabase.from("stores").delete().eq("id", id);
    await fetchStores();
    setSaving(false);
    setDeleteStoreId(null);
  };

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-destructive">Endast administratörer kan hantera butiker.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Hantera Butiker"
        description="Lägg till, redigera och ta bort butiker."
        actions={
          <Button className="rounded-full" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Lägg till butik
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
          <Building2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Inga butiker tillagda</p>
          <Button className="mt-4 rounded-full" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Lägg till butik
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <div
              key={store.id}
              className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Store className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      store.is_active
                        ? "bg-success/15 text-success hover:bg-success/20"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {store.is_active ? "Aktiv" : "Inaktiv"}
                  </Badge>
                  <Switch
                    checked={store.is_active}
                    onCheckedChange={() => toggleActive(store.id, store.is_active)}
                  />
                </div>
              </div>

              <h3 className="mt-3 text-base font-semibold">{store.name}</h3>
              {store.region && (
                <p className="text-xs font-medium text-primary">{store.region}</p>
              )}

              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {store.address && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{store.address}, {store.city}</span>
                  </div>
                )}
                {store.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{store.phone}</span>
                  </div>
                )}
                {store.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{store.email}</span>
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="mt-4 w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteStoreId(store.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Ta bort
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lägg till butik</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Butiksnamn *</Label>
              <Input
                placeholder="T.ex. Stockholm City"
                value={newStore.name}
                onChange={(e) => setNewStore((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stad</Label>
                <Input
                  placeholder="Stockholm"
                  value={newStore.city}
                  onChange={(e) => setNewStore((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Input
                  placeholder="Region Stockholm"
                  value={newStore.region}
                  onChange={(e) => setNewStore((p) => ({ ...p, region: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adress</Label>
              <Input
                placeholder="Gatuadress"
                value={newStore.address}
                onChange={(e) => setNewStore((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input
                  placeholder="08-123 456"
                  value={newStore.phone}
                  onChange={(e) => setNewStore((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>E-post</Label>
                <Input
                  type="email"
                  placeholder="butik@example.com"
                  value={newStore.email}
                  onChange={(e) => setNewStore((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Avbryt</Button>
            <Button onClick={createStore} disabled={saving || !newStore.name}>
              {saving ? "Sparar..." : "Lägg till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteStoreId} onOpenChange={() => setDeleteStoreId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort butik?</AlertDialogTitle>
            <AlertDialogDescription>
              Denna åtgärd kan inte ångras. All data kopplad till denna butik kommer att tas bort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteStoreId && deleteStore(deleteStoreId)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {saving ? "Tar bort..." : "Ta bort"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
