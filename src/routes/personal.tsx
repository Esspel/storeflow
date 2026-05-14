import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, UserCog, X } from "lucide-react";

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
import { supabase, type AppUser, type Store } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/personal")({
  component: AccountsPage,
});

function roleBadge(role: string) {
  if (role === "admin") return <Badge className="bg-destructive/10 text-destructive">Admin</Badge>;
  if (role === "manager") return <Badge className="bg-info/15 text-info">Chef</Badge>;
  return <Badge variant="secondary">Anställd</Badge>;
}

function AccountsPage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    display_name: "",
    role: "employee" as "admin" | "manager" | "employee",
    store_id: "",
  });
  const [resetPw, setResetPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      navigate({ to: "/" });
      return;
    }
    Promise.all([
      supabase.from("app_users").select("*").order("created_at"),
      supabase.from("stores").select("*").eq("is_active", true).order("name"),
    ]).then(([usersRes, storesRes]) => {
      setUsers((usersRes.data ?? []) as AppUser[]);
      setStores((storesRes.data ?? []) as Store[]);
      setLoading(false);
    });
  }, [currentUser, navigate]);

  const fetchUsers = async () => {
    const { data } = await supabase.from("app_users").select("*").order("created_at");
    if (data) setUsers(data as AppUser[]);
  };

  const createUser = async () => {
    setError("");
    if (!newUser.username || !newUser.password || !newUser.display_name) {
      setError("Fyll i alla obligatoriska fält.");
      return;
    }
    if (newUser.password.length < 6) {
      setError("Lösenordet måste vara minst 6 tecken.");
      return;
    }
    setSaving(true);

    const { data: existing } = await supabase
      .from("app_users")
      .select("id")
      .eq("username", newUser.username)
      .maybeSingle();

    if (existing) {
      setError("Användarnamnet är redan taget.");
      setSaving(false);
      return;
    }

    const { data: hash } = await supabase.rpc("hash_password", { plain_password: newUser.password });

    await supabase.from("app_users").insert({
      username: newUser.username.toLowerCase().trim(),
      password_hash: hash,
      display_name: newUser.display_name,
      role: newUser.role,
      store_id: newUser.store_id || null,
    });

    await fetchUsers();
    setSaving(false);
    setShowCreate(false);
    setNewUser({ username: "", password: "", display_name: "", role: "employee", store_id: "" });
  };

  const updateUser = async () => {
    if (!editUser) return;
    setSaving(true);
    const updates: Partial<AppUser> = {
      display_name: editUser.display_name,
      role: editUser.role,
      store_id: editUser.store_id,
    };
    await supabase.from("app_users").update(updates).eq("id", editUser.id);

    if (resetPw.length >= 6) {
      const { data: hash } = await supabase.rpc("hash_password", { plain_password: resetPw });
      await supabase.from("app_users").update({ password_hash: hash }).eq("id", editUser.id);
    }

    await fetchUsers();
    setSaving(false);
    setEditUser(null);
    setResetPw("");
  };

  const toggleUserActive = async (id: string, current: boolean) => {
    await supabase.from("app_users").update({ is_active: !current }).eq("id", id);
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, is_active: !current } : u));
  };

  const confirmDelete = async () => {
    if (!deleteUser) return;
    await supabase.from("app_users").delete().eq("id", deleteUser.id);
    setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
    setDeleteUser(null);
  };

  if (currentUser?.role !== "admin") return null;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader
        title="Hantera konton"
        description="Administrera användarkonton för hela systemet."
        actions={
          <Button className="rounded-full" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nytt konto
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground">Konto</th>
                <th className="hidden px-5 py-3.5 text-left text-xs font-medium text-muted-foreground md:table-cell">Butik</th>
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
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                        {u.display_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium">{u.display_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-5 py-3.5 text-muted-foreground md:table-cell">
                    {stores.find((s) => s.id === u.store_id)?.name ?? <span className="text-muted-foreground/50">—</span>}
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
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => { setEditUser(u); setResetPw(""); }}
                      >
                        <UserCog className="mr-1.5 h-3.5 w-3.5" /> Redigera
                      </Button>
                      {u.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteUser(u)}
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

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nytt konto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Användarnamn *</Label>
              <Input
                placeholder="t.ex. anna.svensson"
                value={newUser.username}
                onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visningsnamn *</Label>
              <Input
                placeholder="Anna Svensson"
                value={newUser.display_name}
                onChange={(e) => setNewUser((p) => ({ ...p, display_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lösenord *</Label>
              <Input
                type="password"
                placeholder="Minst 6 tecken"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Roll</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as "admin" | "manager" | "employee" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Anställd</SelectItem>
                    <SelectItem value="manager">Chef</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Butik</Label>
                <Select value={newUser.store_id} onValueChange={(v) => setNewUser((p) => ({ ...p, store_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Välj..." /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setError(""); }}>Avbryt</Button>
            <Button onClick={createUser} disabled={saving}>
              {saving ? "Skapar..." : "Skapa konto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        {editUser && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Redigera konto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Användarnamn</Label>
                <Input value={editUser.username} disabled className="bg-muted/40 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Visningsnamn</Label>
                <Input
                  value={editUser.display_name}
                  onChange={(e) => setEditUser((u) => u ? { ...u, display_name: e.target.value } : null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Roll</Label>
                  <Select
                    value={editUser.role}
                    onValueChange={(v) => setEditUser((u) => u ? { ...u, role: v as "admin" | "manager" | "employee" } : null)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Anställd</SelectItem>
                      <SelectItem value="manager">Chef</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Butik</Label>
                  <Select
                    value={editUser.store_id ?? ""}
                    onValueChange={(v) => setEditUser((u) => u ? { ...u, store_id: v || null } : null)}
                  >
                    <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Ingen</SelectItem>
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Nytt lösenord (lämna tomt för att behålla)</Label>
                <Input
                  type="password"
                  placeholder="Minst 6 tecken"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUser(null)}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Avbryt
              </Button>
              <Button onClick={updateUser} disabled={saving}>
                {saving ? "Sparar..." : "Spara"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort konto</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort kontot för{" "}
              <strong>{deleteUser?.display_name}</strong>? Åtgärden kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
