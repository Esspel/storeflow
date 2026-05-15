import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  UserCog,
  Users,
  X,
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
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, type AppUser, type Store, type UserGroup, type UserGroupMember, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/personal")({
  component: AccountsPage,
});

function roleBadge(role: string) {
  if (role === "admin") return <Badge className="bg-destructive/10 text-destructive">Admin</Badge>;
  if (role === "manager") return <Badge className="bg-info/15 text-info">Chef</Badge>;
  return <Badge variant="secondary">Anställd</Badge>;
}

type UserWithStores = AppUser & { assignedStoreIds: string[] };

function AccountsPage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserWithStores[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editUser, setEditUser] = useState<UserWithStores | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    display_name: "",
    role: "employee" as "admin" | "manager" | "employee",
    storeIds: [] as string[],
  });
  const [resetPw, setResetPw] = useState("");

  const [showCreateStore, setShowCreateStore] = useState(false);
  const [deleteStore, setDeleteStore] = useState<Store | null>(null);
  const [newStore, setNewStore] = useState({ name: "", city: "", region: "", address: "", phone: "", email: "" });

  // Groups
  const [groups, setGroups] = useState<(UserGroup & { members?: (UserGroupMember & { user?: AppUser })[] })[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", store_id: "", memberIds: [] as string[] });
  const [editGroup, setEditGroup] = useState<(UserGroup & { memberIds: string[] }) | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<UserGroup | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentUser?.role !== "admin") { navigate({ to: "/" }); return; }
    load();
  }, [currentUser]);

  async function load() {
    const [usersRes, storesRes, userStoresRes] = await Promise.all([
      supabase.from("app_users").select("*").order("created_at"),
      supabase.from("stores").select("*").order("name"),
      supabase.from("user_stores").select("user_id, store_id"),
    ]);
    const rawUsers = (usersRes.data ?? []) as AppUser[];
    const storeAssignments = (userStoresRes.data ?? []) as { user_id: string; store_id: string }[];
    const usersWithStores: UserWithStores[] = rawUsers.map((u) => ({
      ...u,
      assignedStoreIds: storeAssignments.filter((a) => a.user_id === u.id).map((a) => a.store_id),
    }));
    setUsers(usersWithStores);
    setStores((storesRes.data ?? []) as Store[]);
    setLoading(false);
    loadGroups();
  }

  async function fetchUsers() {
    const [usersRes, userStoresRes] = await Promise.all([
      supabase.from("app_users").select("*").order("created_at"),
      supabase.from("user_stores").select("user_id, store_id"),
    ]);
    const rawUsers = (usersRes.data ?? []) as AppUser[];
    const storeAssignments = (userStoresRes.data ?? []) as { user_id: string; store_id: string }[];
    setUsers(rawUsers.map((u) => ({
      ...u,
      assignedStoreIds: storeAssignments.filter((a) => a.user_id === u.id).map((a) => a.store_id),
    })));
  }

  function toggleStoreSelection(storeId: string, selected: string[], set: (ids: string[]) => void) {
    if (selected.includes(storeId)) {
      set(selected.filter((id) => id !== storeId));
    } else {
      set([...selected, storeId]);
    }
  }

  async function syncUserStores(userId: string, storeIds: string[]) {
    await supabase.from("user_stores").delete().eq("user_id", userId);
    if (storeIds.length > 0) {
      await supabase.from("user_stores").insert(
        storeIds.map((sid, i) => ({ user_id: userId, store_id: sid, is_primary: i === 0 }))
      );
    }
    // keep legacy store_id in sync with primary store
    await supabase
      .from("app_users")
      .update({ store_id: storeIds[0] ?? null })
      .eq("id", userId);
  }

  const createUser = async () => {
    setError("");
    if (!newUser.username.trim() || !newUser.password || !newUser.display_name.trim()) {
      setError("Fyll i alla obligatoriska fält."); return;
    }
    if (newUser.password.length < 8) { setError("Lösenordet måste vara minst 8 tecken."); return; }
    setSaving(true);

    const { data: existing } = await supabase
      .from("app_users").select("id").eq("username", newUser.username.toLowerCase().trim()).maybeSingle();
    if (existing) { setError("Användarnamnet är redan taget."); setSaving(false); return; }

    const { data: hash } = await supabase.rpc("hash_password", { plain_password: newUser.password });
    const { data: created } = await supabase.from("app_users").insert({
      username: newUser.username.toLowerCase().trim(),
      password_hash: hash,
      display_name: newUser.display_name.trim(),
      role: newUser.role,
      store_id: newUser.storeIds[0] ?? null,
    }).select("id").maybeSingle();

    if (created?.id) {
      await syncUserStores(created.id, newUser.storeIds);
      logAudit(currentUser?.id ?? null, "user.create", "app_users", created.id, { username: newUser.username });
    }

    await fetchUsers();
    setSaving(false);
    setShowCreateUser(false);
    setNewUser({ username: "", password: "", display_name: "", role: "employee", storeIds: [] });
  };

  const updateUser = async () => {
    if (!editUser) return;
    if (resetPw && resetPw.length < 8) { setError("Nytt lösenord måste vara minst 8 tecken."); return; }
    setSaving(true);

    await supabase.from("app_users").update({
      display_name: editUser.display_name.trim(),
      role: editUser.role,
      store_id: editUser.assignedStoreIds[0] ?? null,
    }).eq("id", editUser.id);

    await syncUserStores(editUser.id, editUser.assignedStoreIds);

    if (resetPw.length >= 8) {
      const { data: hash } = await supabase.rpc("hash_password", { plain_password: resetPw });
      await supabase.from("app_users").update({ password_hash: hash }).eq("id", editUser.id);
    }

    logAudit(currentUser?.id ?? null, "user.edit", "app_users", editUser.id, {});
    await fetchUsers();
    setSaving(false);
    setEditUser(null);
    setResetPw("");
    setError("");
  };

  const toggleUserActive = async (id: string, current: boolean) => {
    await supabase.from("app_users").update({ is_active: !current }).eq("id", id);
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, is_active: !current } : u));
  };

  const confirmDeleteUser = async () => {
    if (!deleteUser) return;
    await supabase.from("app_users").delete().eq("id", deleteUser.id);
    logAudit(currentUser?.id ?? null, "user.delete", "app_users", deleteUser.id, { username: deleteUser.username });
    setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
    setDeleteUser(null);
  };

  const createStore = async () => {
    setError("");
    if (!newStore.name.trim()) { setError("Butiksnamn är obligatoriskt."); return; }
    setSaving(true);
    const { data: created } = await supabase.from("stores").insert({
      name: newStore.name.trim(),
      city: newStore.city.trim(),
      region: newStore.region.trim(),
      address: newStore.address.trim(),
      phone: newStore.phone.trim(),
      email: newStore.email.trim(),
    }).select("id").maybeSingle();
    logAudit(currentUser?.id ?? null, "store.create", "stores", created?.id ?? null, { name: newStore.name });
    const { data } = await supabase.from("stores").select("*").order("name");
    setStores((data ?? []) as Store[]);
    setSaving(false);
    setShowCreateStore(false);
    setNewStore({ name: "", city: "", region: "", address: "", phone: "", email: "" });
  };

  const confirmDeleteStore = async () => {
    if (!deleteStore) return;
    setSaving(true);
    await supabase.from("stores").delete().eq("id", deleteStore.id);
    logAudit(currentUser?.id ?? null, "store.delete", "stores", deleteStore.id, { name: deleteStore.name });
    setStores((prev) => prev.filter((s) => s.id !== deleteStore.id));
    setDeleteStore(null);
    setSaving(false);
  };

  // --- Groups ---
  async function loadGroups() {
    const { data } = await supabase
      .from("user_groups")
      .select("*, members:user_group_members(*, user:app_users(id, display_name, username))")
      .order("name");
    setGroups((data ?? []) as typeof groups);
  }

  async function createGroup() {
    setError("");
    if (!newGroup.name.trim()) { setError("Gruppnamn obligatoriskt."); return; }
    setSaving(true);
    const { data: created } = await supabase.from("user_groups").insert({
      name: newGroup.name.trim(),
      store_id: newGroup.store_id || null,
    }).select("id").maybeSingle();
    if (created?.id && newGroup.memberIds.length > 0) {
      await supabase.from("user_group_members").insert(
        newGroup.memberIds.map((uid) => ({ group_id: created.id, user_id: uid }))
      );
    }
    logAudit(currentUser?.id ?? null, "group.create", "user_groups", created?.id ?? null, { name: newGroup.name });
    await loadGroups();
    setSaving(false);
    setShowCreateGroup(false);
    setNewGroup({ name: "", store_id: "", memberIds: [] });
  }

  async function saveEditGroup() {
    if (!editGroup) return;
    setSaving(true);
    await supabase.from("user_groups").update({ name: editGroup.name }).eq("id", editGroup.id);
    await supabase.from("user_group_members").delete().eq("group_id", editGroup.id);
    if (editGroup.memberIds.length > 0) {
      await supabase.from("user_group_members").insert(
        editGroup.memberIds.map((uid) => ({ group_id: editGroup.id, user_id: uid }))
      );
    }
    logAudit(currentUser?.id ?? null, "group.edit", "user_groups", editGroup.id, {});
    await loadGroups();
    setSaving(false);
    setEditGroup(null);
  }

  async function confirmDeleteGroup() {
    if (!deleteGroup) return;
    await supabase.from("user_groups").delete().eq("id", deleteGroup.id);
    logAudit(currentUser?.id ?? null, "group.delete", "user_groups", deleteGroup.id, { name: deleteGroup.name });
    setGroups((prev) => prev.filter((g) => g.id !== deleteGroup.id));
    setDeleteGroup(null);
  }

  if (currentUser?.role !== "admin") return null;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader title="Administration" description="Hantera användarkonton och butiker." />

      <Tabs defaultValue="users" className="mt-6">
        <TabsList className="rounded-full bg-muted/60 p-1">
          <TabsTrigger value="users" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Användarkonton
          </TabsTrigger>
          <TabsTrigger value="stores" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Butiker
          </TabsTrigger>
          <TabsTrigger value="groups" className="rounded-full px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Grupper
          </TabsTrigger>
        </TabsList>

        {/* USERS TAB */}
        <TabsContent value="users" className="mt-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Användarkonton</h2>
              <p className="text-sm text-muted-foreground">{users.length} konton totalt</p>
            </div>
            <Button className="rounded-full" onClick={() => { setShowCreateUser(true); setError(""); }}>
              <Plus className="mr-2 h-4 w-4" /> Nytt konto
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />)}</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground">Konto</th>
                    <th className="hidden px-5 py-3.5 text-left text-xs font-medium text-muted-foreground md:table-cell">Butiker</th>
                    <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Roll</th>
                    <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground">Aktiv</th>
                    <th className="px-5 py-3.5 text-right text-xs font-medium text-muted-foreground">Åtgärder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                            {u.display_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium">{u.display_name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-5 py-3.5 text-muted-foreground md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {u.assignedStoreIds.length === 0 ? (
                            <span className="text-muted-foreground/50">—</span>
                          ) : (
                            u.assignedStoreIds.map((sid) => {
                              const s = stores.find((st) => st.id === sid);
                              return s ? (
                                <span key={sid} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">{s.name}</span>
                              ) : null;
                            })
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">{roleBadge(u.role)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <Switch
                          checked={u.is_active}
                          onCheckedChange={() => u.id !== currentUser?.id && toggleUserActive(u.id, u.is_active)}
                          disabled={u.id === currentUser?.id}
                        />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="sm" className="rounded-full text-xs"
                            onClick={() => { setEditUser({ ...u }); setResetPw(""); setError(""); }}
                          >
                            <UserCog className="mr-1.5 h-3.5 w-3.5" /> Redigera
                          </Button>
                          {u.id !== currentUser?.id && (
                            <Button
                              variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteUser(u)} aria-label="Ta bort"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* GROUPS TAB */}
        <TabsContent value="groups" className="mt-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Användargrupper</h2>
              <p className="text-sm text-muted-foreground">{groups.length} grupper</p>
            </div>
            <Button className="rounded-full" onClick={() => { setShowCreateGroup(true); setError(""); }}>
              <Plus className="mr-2 h-4 w-4" /> Ny grupp
            </Button>
          </div>
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
              <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Inga grupper skapade</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {stores.find((s) => s.id === g.store_id)?.name ?? "Alla butiker"} — {g.members?.length ?? 0} medlemmar
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="rounded-full text-xs"
                        onClick={() => setEditGroup({ ...g, memberIds: g.members?.map((m) => m.user_id) ?? [] })}>
                        Redigera
                      </Button>
                      <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteGroup(g)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {g.members && g.members.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {g.members.map((m) => (
                        <span key={m.id} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
                          {m.user?.display_name ?? m.user_id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* STORES TAB */}
        <TabsContent value="stores" className="mt-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Butiker</h2>
              <p className="text-sm text-muted-foreground">{stores.length} butiker totalt</p>
            </div>
            <Button className="rounded-full" onClick={() => { setShowCreateStore(true); setError(""); }}>
              <Plus className="mr-2 h-4 w-4" /> Ny butik
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1,2,3].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-card" />)}
            </div>
          ) : stores.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
              <Building2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Inga butiker tillagda</p>
              <Button className="mt-4 rounded-full" size="sm" onClick={() => setShowCreateStore(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Lägg till butik
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <div key={store.id} className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{store.name}</h3>
                  {store.region && <p className="text-xs font-medium text-primary">{store.region}</p>}
                  <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                    {store.address && <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /><span>{store.address}{store.city && `, ${store.city}`}</span></div>}
                    {store.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /><span>{store.phone}</span></div>}
                    {store.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{store.email}</span></div>}
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="absolute right-3 top-3 rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteStore(store)} aria-label="Ta bort butik"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* CREATE USER DIALOG */}
      <Dialog open={showCreateUser} onOpenChange={(o) => { setShowCreateUser(o); if (!o) setError(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nytt konto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Användarnamn *</Label>
              <Input placeholder="t.ex. anna.svensson" value={newUser.username}
                onChange={(e) => setNewUser(p => ({ ...p, username: e.target.value }))} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>Visningsnamn *</Label>
              <Input placeholder="Anna Svensson" value={newUser.display_name}
                onChange={(e) => setNewUser(p => ({ ...p, display_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Lösenord *</Label>
              <Input type="password" placeholder="Minst 8 tecken" value={newUser.password}
                onChange={(e) => setNewUser(p => ({ ...p, password: e.target.value }))} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Roll</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser(p => ({ ...p, role: v as "admin" | "manager" | "employee" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Anställd</SelectItem>
                  <SelectItem value="manager">Chef</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Butiker</Label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                {stores.map(s => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                    <Checkbox
                      checked={newUser.storeIds.includes(s.id)}
                      onCheckedChange={() => toggleStoreSelection(s.id, newUser.storeIds, (ids) => setNewUser(p => ({ ...p, storeIds: ids })))}
                    />
                    <span className="text-sm">{s.name}</span>
                    {s.region && <span className="text-xs text-muted-foreground">{s.region}</span>}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateUser(false); setError(""); }}>Avbryt</Button>
            <Button onClick={createUser} disabled={saving}>{saving ? "Skapar..." : "Skapa konto"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT USER DIALOG */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) { setEditUser(null); setError(""); } }}>
        {editUser && (
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Redigera konto</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Användarnamn</Label>
                <Input value={editUser.username} disabled className="bg-muted/40 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Visningsnamn</Label>
                <Input value={editUser.display_name}
                  onChange={(e) => setEditUser(u => u ? { ...u, display_name: e.target.value } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Roll</Label>
                <Select value={editUser.role}
                  onValueChange={(v) => setEditUser(u => u ? { ...u, role: v as "admin" | "manager" | "employee" } : null)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Anställd</SelectItem>
                    <SelectItem value="manager">Chef</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Butiker</Label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                  {stores.map(s => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                      <Checkbox
                        checked={editUser.assignedStoreIds.includes(s.id)}
                        onCheckedChange={() => toggleStoreSelection(s.id, editUser.assignedStoreIds, (ids) => setEditUser(u => u ? { ...u, assignedStoreIds: ids } : null))}
                      />
                      <span className="text-sm">{s.name}</span>
                      {s.region && <span className="text-xs text-muted-foreground">{s.region}</span>}
                      {editUser.assignedStoreIds[0] === s.id && (
                        <span className="ml-auto text-xs text-primary">Primär</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Nytt lösenord (lämna tomt för att behålla)</Label>
                <Input type="password" placeholder="Minst 8 tecken" value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)} autoComplete="new-password" />
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditUser(null); setError(""); }}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Avbryt
              </Button>
              <Button onClick={updateUser} disabled={saving}>{saving ? "Sparar..." : "Spara"}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* CREATE STORE DIALOG */}
      <Dialog open={showCreateStore} onOpenChange={(o) => { setShowCreateStore(o); if (!o) setError(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Lägg till butik</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Butiksnamn *</Label>
              <Input placeholder="T.ex. Stockholm City" value={newStore.name}
                onChange={(e) => setNewStore(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stad</Label>
                <Input placeholder="Stockholm" value={newStore.city}
                  onChange={(e) => setNewStore(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Input placeholder="Region Stockholm" value={newStore.region}
                  onChange={(e) => setNewStore(p => ({ ...p, region: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adress</Label>
              <Input placeholder="Gatuadress" value={newStore.address}
                onChange={(e) => setNewStore(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input placeholder="08-123 456" value={newStore.phone}
                  onChange={(e) => setNewStore(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>E-post</Label>
                <Input type="email" placeholder="butik@example.com" value={newStore.email}
                  onChange={(e) => setNewStore(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateStore(false); setError(""); }}>Avbryt</Button>
            <Button onClick={createStore} disabled={saving || !newStore.name}>{saving ? "Sparar..." : "Lägg till"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE USER CONFIRM */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort konto</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort kontot för <strong>{deleteUser?.display_name}</strong>? Åtgärden kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteUser}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE STORE CONFIRM */}
      <AlertDialog open={!!deleteStore} onOpenChange={(o) => !o && setDeleteStore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort butik</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill permanent ta bort <strong>{deleteStore?.name}</strong>?
              <span className="mt-2 block text-xs">Relaterade uppgifter, avvikelser och användarkopplingar kan påverkas. Åtgärden kan inte ångras.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteStore}>
              Ta bort butik
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CREATE GROUP DIALOG */}
      <Dialog open={showCreateGroup} onOpenChange={(o) => { setShowCreateGroup(o); if (!o) setError(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Ny grupp</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Gruppnamn *</Label>
              <Input placeholder="T.ex. Morgonpersonal" value={newGroup.name}
                onChange={(e) => setNewGroup(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Butik (valfritt)</Label>
              <Select value={newGroup.store_id || "__none"} onValueChange={(v) => setNewGroup(p => ({ ...p, store_id: v === "__none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Alla butiker" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Alla butiker</SelectItem>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Medlemmar</Label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                {users.filter(u => u.is_active).map(u => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                    <Checkbox
                      checked={newGroup.memberIds.includes(u.id)}
                      onCheckedChange={() => {
                        setNewGroup(p => ({
                          ...p,
                          memberIds: p.memberIds.includes(u.id) ? p.memberIds.filter(id => id !== u.id) : [...p.memberIds, u.id]
                        }));
                      }}
                    />
                    <span className="text-sm">{u.display_name}</span>
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateGroup(false); setError(""); }}>Avbryt</Button>
            <Button onClick={createGroup} disabled={saving}>{saving ? "Skapar..." : "Skapa grupp"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT GROUP DIALOG */}
      <Dialog open={!!editGroup} onOpenChange={(o) => { if (!o) { setEditGroup(null); setError(""); } }}>
        {editGroup && (
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Redigera grupp</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Gruppnamn</Label>
                <Input value={editGroup.name}
                  onChange={(e) => setEditGroup(g => g ? { ...g, name: e.target.value } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Medlemmar</Label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                  {users.filter(u => u.is_active).map(u => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                      <Checkbox
                        checked={editGroup.memberIds.includes(u.id)}
                        onCheckedChange={() => {
                          setEditGroup(g => g ? {
                            ...g,
                            memberIds: g.memberIds.includes(u.id) ? g.memberIds.filter(id => id !== u.id) : [...g.memberIds, u.id]
                          } : null);
                        }}
                      />
                      <span className="text-sm">{u.display_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditGroup(null); setError(""); }}>Avbryt</Button>
              <Button onClick={saveEditGroup} disabled={saving}>{saving ? "Sparar..." : "Spara"}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* DELETE GROUP CONFIRM */}
      <AlertDialog open={!!deleteGroup} onOpenChange={(o) => !o && setDeleteGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort grupp</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort gruppen <strong>{deleteGroup?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteGroup}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
