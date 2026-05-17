import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert as AlertCircle, ArrowUpDown, Building2, CircleCheck as CheckCircle2, ChevronDown, ChevronUp, Download, Hash, Mail, MapPin, Pencil, Phone, Plus, Search, Shield, Trash2, Upload, UserCog, Users, X } from "lucide-react";

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
import { supabase, type AppUser, type Store, type UserGroup, type UserGroupMember, logAudit, HIERARCHY_LABELS } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { GdprExport } from "@/components/gdpr-export";
import { useIsMobile } from "@/hooks/use-mobile";

const MIN_PW_LENGTH = 12;

export const Route = createFileRoute("/personal")({
  component: AccountsPage,
});

function hierarchyBadge(level: string | null | undefined) {
  const key = level ?? "anvandare";
  const label = HIERARCHY_LABELS[key] ?? key;
  if (key === "admin") return <Badge className="bg-destructive/10 text-destructive">{label}</Badge>;
  if (key === "hk" || key === "forening" || key === "distrikt") return <Badge className="bg-info/15 text-info">{label}</Badge>;
  if (key === "chef") return <Badge className="bg-warning/15 text-warning">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

function hierarchyLevelToRole(level: string): "admin" | "manager" | "employee" {
  if (level === "admin") return "admin";
  if (level === "hk" || level === "forening" || level === "distrikt" || level === "chef") return "manager";
  return "employee";
}

type UserWithStores = AppUser & { assignedStoreIds: string[] };
type SortDir = "asc" | "desc";

// CSV Import result
type CsvImportResult = {
  success: number;
  skipped: number;
  errors: string[];
};

// Store CSV row mapping (all 32 fields)
// "Butik / Enhet" is the primary display name; "Namn" is stored as namn2 (internal name)
const CSV_HEADERS: Record<string, keyof Store | null> = {
  "Bolag": "bolag",
  "Koncept": "koncept",
  "Kommentar": "kommentar",
  "Butiks nr": "butiks_nr",
  "Namn": "namn2",
  "Butik / Enhet": "name",
  "Företag": "foretag",
  "Enhet": "enhet",
  "Organisationsnummer": "organisationsnummer",
  "Franchise": null, // handled specially
  "Gatuadress": "gatuadress",
  "Postnr": "postnr",
  "Postadress": "postadress",
  "Email-adress Butiks-/SM-chef": "email_sm_chef",
  "Butikschef (BC)": "butikschef",
  "Telefon butik": "telefon_butik",
  "BC Telefon": "bc_telefon",
  "Mobil": "mobil",
  "Direktör Försäljning": "direktor_forsaljning",
  "Försäljningschef": "forsaljningschef",
  "Marknadsområde": "marknadsomrade",
  "Distriktschef (DC)": "distriktschef",
  "Distrikt": "distrikt_namn",
  "K Ställe": "k_stalle",
  "Namn2": "namn2",
  "Gamla butiksnummer": "gamla_butiksnummer",
  "Säljplan": "saljplan",
  "Säk kval & Arbetsmiljö samordnare": "sak_kval_samordnare",
  "Säk, kval & Arbetsmiljö samordnare": "sak_kval_samordnare",
  "Kommun": "kommun",
  "HR Generalist": "hr_generalist",
  "Bemanningsspecialist": "bemanningsspecialist",
  "Site-ID": "site_id",
};

function parseStoreCsv(text: string): { rows: Record<string, string>[]; headers: string[]; error?: string } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return { rows: [], headers: [], error: "Filen verkar tom eller saknar rubrikrad." };

  // Handle semicolon or comma separated
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ""));

  // Validate required headers — accept either "Butik / Enhet" or "Namn" for the name column
  const hasName = headers.includes("Butik / Enhet") || headers.includes("Namn");
  if (!hasName) {
    return { rows: [], headers, error: `Importen avbröts: Saknad obligatorisk kolumn "Butik / Enhet". Kontrollera att filen har rätt format.` };
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""));
    if (cells.length < headers.length / 2) continue; // skip too-short rows
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    if (!row["Namn"]?.trim()) continue; // skip empty name rows
    rows.push(row);
  }

  return { rows, headers };
}

function AccountsPage() {
  const { user: currentUser, userStores: currentUserStores, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager" || isAdmin;

  const [users, setUsers] = useState<UserWithStores[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & sort state
  const [userSearch, setUserSearch] = useState("");
  const [userSortField, setUserSortField] = useState<"display_name" | "role" | "created_at">("display_name");
  const [userSortDir, setUserSortDir] = useState<SortDir>("asc");
  const [storeSearch, setStoreSearch] = useState("");
  const [storeSortField, setStoreSortField] = useState<"name" | "bolag" | "distrikt_namn" | "butiks_nr" | "koncept">("name");
  const [storeSortDir, setStoreSortDir] = useState<SortDir>("asc");
  const [groupSearch, setGroupSearch] = useState("");

  // User dialogs
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editUser, setEditUser] = useState<UserWithStores | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);
  const [newUser, setNewUser] = useState({
    username: "", password: "", display_name: "", role: "employee" as "admin" | "manager" | "employee",
    hierarchy_level: "anvandare" as string,
    employee_group: "", storeIds: [] as string[], pin: "", barcode: "",
  });
  const [resetPw, setResetPw] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editStoreSearch, setEditStoreSearch] = useState("");

  // Store dialogs
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [deleteStore, setDeleteStore] = useState<Store | null>(null);
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [newStore, setNewStore] = useState({ name: "", city: "", address: "", email: "", sap_site_id: "", butiks_nr: "", bolag: "" });

  // CSV import
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const [csvPreviewError, setCsvPreviewError] = useState<string | null>(null);

  // Groups
  const [groups, setGroups] = useState<(UserGroup & { members?: (UserGroupMember & { user?: AppUser })[] })[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", store_id: "", memberIds: [] as string[] });
  const [editGroup, setEditGroup] = useState<(UserGroup & { memberIds: string[] }) | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<UserGroup | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) return;
    if (!isManager) { navigate({ to: "/" }); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, authLoading]);

  const manageableStoreIds = isAdmin ? null : currentUserStores.map((s) => s.id);

  async function load() {
    const managerStoreIds = currentUserStores.map(s => s.id);
    const [usersRes, storesRes, userStoresRes] = await Promise.all([
      supabase.from("app_users").select("*").order("created_at"),
      isAdmin || managerStoreIds.length === 0
        ? supabase.from("stores").select("*").order("name")
        : supabase.from("stores").select("*").in("id", managerStoreIds).order("name"),
      supabase.from("user_stores").select("user_id, store_id"),
    ]);
    const rawUsers = (usersRes.data ?? []) as AppUser[];
    const storeAssignments = (userStoresRes.data ?? []) as { user_id: string; store_id: string }[];
    let usersWithStores: UserWithStores[] = rawUsers.map((u) => ({
      ...u, assignedStoreIds: storeAssignments.filter((a) => a.user_id === u.id).map((a) => a.store_id),
    }));
    if (!isAdmin) {
      const myStoreIds = currentUserStores.map((s) => s.id);
      usersWithStores = usersWithStores.filter((u) =>
        u.assignedStoreIds.some((sid) => myStoreIds.includes(sid)) || u.id === currentUser?.id
      );
    }
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
    let mapped: UserWithStores[] = rawUsers.map((u) => ({
      ...u, assignedStoreIds: storeAssignments.filter((a) => a.user_id === u.id).map((a) => a.store_id),
    }));
    if (!isAdmin) {
      const myStoreIds = currentUserStores.map((s) => s.id);
      mapped = mapped.filter((u) =>
        u.assignedStoreIds.some((sid) => myStoreIds.includes(sid)) || u.id === currentUser?.id
      );
    }
    setUsers(mapped);
  }

  function toggleStoreSelection(storeId: string, selected: string[], set: (ids: string[]) => void) {
    if (selected.includes(storeId)) set(selected.filter((id) => id !== storeId));
    else set([...selected, storeId]);
  }

  async function syncUserStores(userId: string, storeIds: string[]) {
    const allowedIds = isAdmin ? storeIds : storeIds.filter((sid) => manageableStoreIds?.includes(sid));
    await supabase.from("user_stores").delete().eq("user_id", userId);
    if (allowedIds.length > 0) {
      await supabase.from("user_stores").insert(
        allowedIds.map((sid, i) => ({ user_id: userId, store_id: sid, is_primary: i === 0 }))
      );
    }
    await supabase.from("app_users").update({ store_id: allowedIds[0] ?? null }).eq("id", userId);
  }

  const createUser = async () => {
    setError("");
    if (!newUser.username.trim() || !newUser.password || !newUser.display_name.trim()) {
      setError("Fyll i alla obligatoriska fält."); return;
    }
    if (newUser.password.length < MIN_PW_LENGTH) { setError(`Lösenordet måste vara minst ${MIN_PW_LENGTH} tecken.`); return; }
    setSaving(true);
    const { data: existing } = await supabase.from("app_users").select("id").eq("username", newUser.username.toLowerCase().trim()).maybeSingle();
    if (existing) { setError("Användarnamnet är redan taget."); setSaving(false); return; }
    const { data: hash } = await supabase.rpc("hash_password", { plain_password: newUser.password });
    const derivedRole = hierarchyLevelToRole(newUser.hierarchy_level);
    const safeRole = !isAdmin && derivedRole === "admin" ? "employee" : derivedRole;
    const safeStoreIds = isAdmin ? newUser.storeIds : newUser.storeIds.filter((sid) => manageableStoreIds?.includes(sid));
    let pinHash: string | null = null;
    if (newUser.pin.length >= 4) {
      const { data: ph } = await supabase.rpc("hash_password", { plain_password: newUser.pin });
      pinHash = ph;
    }
    if (newUser.barcode.trim()) {
      const { data: existingBarcode } = await supabase.from("app_users").select("id").eq("barcode_id", newUser.barcode.trim()).maybeSingle();
      if (existingBarcode) { setError("Streckkoden är redan registrerad på en annan användare."); setSaving(false); return; }
    }
    const { data: created } = await supabase.from("app_users").insert({
      username: newUser.username.toLowerCase().trim(),
      password_hash: hash,
      display_name: newUser.display_name.trim(),
      role: safeRole,
      hierarchy_level: newUser.hierarchy_level || "anvandare",
      employee_group: newUser.employee_group.trim(),
      store_id: safeStoreIds[0] ?? null,
      must_change_password: true,
      ...(pinHash ? { quick_pin_hash: pinHash } : {}),
      ...(newUser.barcode.trim() ? { barcode_id: newUser.barcode.trim() } : {}),
    }).select("id").maybeSingle();
    if (created?.id) {
      await syncUserStores(created.id, safeStoreIds);
      logAudit(currentUser?.id ?? null, "user.create", "app_users", created.id, { username: newUser.username });
    }
    await fetchUsers();
    setSaving(false);
    setShowCreateUser(false);
    setNewUser({ username: "", password: "", display_name: "", role: "employee", hierarchy_level: "anvandare", employee_group: "", storeIds: [], pin: "", barcode: "" });
  };

  const updateUser = async () => {
    if (!editUser) return;
    if (resetPw && resetPw.length < MIN_PW_LENGTH) { setError(`Nytt lösenord måste vara minst ${MIN_PW_LENGTH} tecken.`); return; }
    if (editPin && editPin.length > 0 && editPin.length < 4) { setError("PIN måste vara minst 4 siffror."); return; }
    if (!isAdmin) {
      const myStoreIds = currentUserStores.map((s) => s.id);
      const sharesStore = editUser.assignedStoreIds.some((sid) => myStoreIds.includes(sid)) || editUser.id === currentUser?.id;
      if (!sharesStore) { setError("Du har inte behörighet att redigera denna användare."); return; }
    }
    setSaving(true);
    if (editBarcode.trim()) {
      const { data: existingBarcode } = await supabase.from("app_users").select("id").eq("barcode_id", editBarcode.trim()).neq("id", editUser.id).maybeSingle();
      if (existingBarcode) { setError("Streckkoden är redan registrerad på en annan användare."); setSaving(false); return; }
    }
    const updates: Record<string, unknown> = {
      display_name: editUser.display_name.trim(),
      role: hierarchyLevelToRole(editUser.hierarchy_level ?? "anvandare"),
      hierarchy_level: editUser.hierarchy_level ?? "anvandare",
      role_manually_set: true,
      employee_group: (editUser.employee_group ?? "").trim(),
      store_id: editUser.assignedStoreIds[0] ?? null,
    };
    if (editBarcode.trim()) updates.barcode_id = editBarcode.trim();
    else if (editBarcode === "") updates.barcode_id = null;
    await supabase.from("app_users").update(updates).eq("id", editUser.id);
    await syncUserStores(editUser.id, editUser.assignedStoreIds);
    if (resetPw.length >= MIN_PW_LENGTH) {
      const { data: hash } = await supabase.rpc("hash_password", { plain_password: resetPw });
      await supabase.from("app_users").update({ password_hash: hash, must_change_password: true }).eq("id", editUser.id);
    }
    if (editPin.length >= 4) {
      const { data: pinHash } = await supabase.rpc("hash_password", { plain_password: editPin });
      await supabase.from("app_users").update({ quick_pin_hash: pinHash }).eq("id", editUser.id);
    } else if (editPin === "clear") {
      await supabase.from("app_users").update({ quick_pin_hash: null }).eq("id", editUser.id);
    }
    logAudit(currentUser?.id ?? null, "user.edit", "app_users", editUser.id, {});
    await fetchUsers();
    setSaving(false);
    setEditUser(null);
    setResetPw(""); setEditPin(""); setEditBarcode(""); setError("");
  };

  const toggleUserActive = async (id: string, current: boolean) => {
    await supabase.from("app_users").update({ is_active: !current }).eq("id", id);
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, is_active: !current } : u));
  };

  const confirmDeleteUser = async () => {
    if (!deleteUser) return;
    if (!isAdmin) {
      const myStoreIds = currentUserStores.map((s) => s.id);
      const target = users.find((u) => u.id === deleteUser.id);
      const sharesStore = target?.assignedStoreIds.some((sid) => myStoreIds.includes(sid));
      if (!sharesStore) { setSaving(false); setDeleteUser(null); return; }
    }
    setSaving(true);
    await supabase.from("app_users").update({
      display_name: "Gallrad användare",
      username: `deleted_${deleteUser.id.slice(0, 8)}`,
      is_active: false,
      password_hash: "",
    }).eq("id", deleteUser.id);
    await supabase.from("user_stores").delete().eq("user_id", deleteUser.id);
    await supabase.from("user_group_members").delete().eq("user_id", deleteUser.id);
    logAudit(currentUser?.id ?? null, "user.delete", "app_users", deleteUser.id, { username: deleteUser.username });
    await fetchUsers();
    setSaving(false);
    setDeleteUser(null);
  };

  const createStore = async () => {
    setError("");
    if (!newStore.name.trim()) { setError("Butiksnamn är obligatoriskt."); return; }
    setSaving(true);
    const { data: created } = await supabase.from("stores").insert({
      name: newStore.name.trim(),
      city: newStore.city.trim(),
      address: newStore.address.trim(),
      email: newStore.email.trim(),
      sap_site_id: newStore.sap_site_id.trim() || null,
      butiks_nr: newStore.butiks_nr.trim() || null,
      bolag: newStore.bolag.trim() || null,
    }).select("id").maybeSingle();
    logAudit(currentUser?.id ?? null, "store.create", "stores", created?.id ?? null, { name: newStore.name });
    const { data } = await supabase.from("stores").select("*").order("name");
    setStores((data ?? []) as Store[]);
    setSaving(false);
    setShowCreateStore(false);
    setNewStore({ name: "", city: "", address: "", email: "", sap_site_id: "", butiks_nr: "", bolag: "" });
  };

  const updateStore = async () => {
    if (!editStore) return;
    setError("");
    if (!editStore.name.trim()) { setError("Butiksnamn är obligatoriskt."); return; }
    setSaving(true);
    await supabase.from("stores").update({
      name: editStore.name.trim(),
      city: editStore.city?.trim() ?? "",
      address: editStore.address?.trim() ?? "",
      email: editStore.email?.trim() ?? "",
      sap_site_id: editStore.sap_site_id?.trim() || null,
      butiks_nr: editStore.butiks_nr?.trim() || null,
      bolag: editStore.bolag?.trim() || null,
      koncept: editStore.koncept?.trim() || null,
      gatuadress: editStore.gatuadress?.trim() || null,
      postnr: editStore.postnr?.trim() || null,
      postadress: editStore.postadress?.trim() || null,
      email_sm_chef: editStore.email_sm_chef?.trim() || null,
      butikschef: editStore.butikschef?.trim() || null,
      telefon_butik: editStore.telefon_butik?.trim() || null,
      distrikt_namn: editStore.distrikt_namn?.trim() || null,
      kommun: editStore.kommun?.trim() || null,
      site_id: editStore.site_id?.trim() || null,
    }).eq("id", editStore.id);
    logAudit(currentUser?.id ?? null, "store.edit", "stores", editStore.id, { name: editStore.name });
    const { data } = await supabase.from("stores").select("*").order("name");
    setStores((data ?? []) as Store[]);
    setSaving(false);
    setEditStore(null);
    setError("");
  };

  const confirmDeleteStore = async () => {
    if (!deleteStore) return;
    setSaving(true);
    await supabase.from("user_groups").update({ store_id: null }).eq("store_id", deleteStore.id);
    await supabase.from("stores").delete().eq("id", deleteStore.id);
    logAudit(currentUser?.id ?? null, "store.delete", "stores", deleteStore.id, { name: deleteStore.name });
    setStores((prev) => prev.filter((s) => s.id !== deleteStore.id));
    setDeleteStore(null);
    setSaving(false);
  };

  // --- CSV Store Directory Import ---
  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvPreviewError(null);
    setCsvResult(null);
    setCsvImporting(true);

    try {
      // Try UTF-8 first; fall back to Windows-1252 (covers Swedish ISO-8859-1) if replacement chars appear
      const buf = await file.arrayBuffer();
      const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      const text = utf8.includes("\uFFFD")
        ? (() => { try { return new TextDecoder("windows-1252").decode(buf); } catch { return utf8; } })()
        : utf8;
      const { rows, error: parseError } = parseStoreCsv(text);

      if (parseError) {
        setCsvPreviewError(parseError);
        setCsvImporting(false);
        if (csvInputRef.current) csvInputRef.current.value = "";
        return;
      }

      if (rows.length === 0) {
        setCsvPreviewError("Filen innehåller inga giltiga datarader.");
        setCsvImporting(false);
        if (csvInputRef.current) csvInputRef.current.value = "";
        return;
      }

      const result: CsvImportResult = { success: 0, skipped: 0, errors: [] };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because 1-indexed and row 1 is header

        // Primary name from "Butik / Enhet", fallback to "Namn"
        const siteId = row["Site-ID"]?.trim();
        const butikNr = row["Butiks nr"]?.trim();
        const displayName = row["Butik / Enhet"]?.trim() || row["Namn"]?.trim();

        if (!displayName) {
          result.errors.push(`Rad ${rowNum}: Saknar butiksnamn (Butik / Enhet).`);
          result.skipped++;
          continue;
        }

        // Build payload from CSV_HEADERS mapping
        const payload: Record<string, unknown> = {};
        for (const [csvKey, dbKey] of Object.entries(CSV_HEADERS)) {
          if (dbKey === null) continue;
          const val = row[csvKey]?.trim();
          if (val !== undefined && val !== "") {
            payload[dbKey] = val;
          }
        }
        // Ensure name is always set from Butik / Enhet (CSV_HEADERS maps it to "name")
        if (!payload["name"]) payload["name"] = displayName;

        // Special fields
        const franchiseVal = row["Franchise"]?.trim().toLowerCase();
        if (franchiseVal) payload.franchise = franchiseVal === "ja" || franchiseVal === "yes" || franchiseVal === "true" || franchiseVal === "1";
        if (siteId) { payload.site_id = siteId; payload.sap_site_id = siteId; }

        try {
          if (butikNr) {
            // Check if a store with this butiks_nr already exists
            const { data: existing } = await supabase
              .from("stores").select("id").eq("butiks_nr", butikNr).maybeSingle();
            if (existing) {
              // Already in database — skip (no overwrite)
              result.skipped++;
              continue;
            }
            const { error: insertErr } = await supabase.from("stores").insert({ ...payload, butiks_nr: butikNr });
            if (insertErr) {
              result.errors.push(`Rad ${rowNum} (${displayName}): ${insertErr.message}`);
              result.skipped++;
              continue;
            }
          } else {
            // No butiks_nr — check by name to avoid duplicate
            const { data: existing } = await supabase
              .from("stores").select("id").eq("name", displayName).maybeSingle();
            if (existing) {
              result.skipped++;
              continue;
            }
            const { error: insertErr } = await supabase.from("stores").insert(payload);
            if (insertErr) {
              result.errors.push(`Rad ${rowNum} (${displayName}): ${insertErr.message}`);
              result.skipped++;
              continue;
            }
          }
          result.success++;
        } catch (err) {
          result.errors.push(`Rad ${rowNum} (${displayName}): Okänt fel.`);
          result.skipped++;
        }
      }

      setCsvResult(result);
      // Refresh stores list
      const { data } = await supabase.from("stores").select("*").order("name");
      setStores((data ?? []) as Store[]);
    } catch {
      setCsvPreviewError("Kunde inte läsa filen. Kontrollera att det är en giltig CSV-fil.");
    } finally {
      setCsvImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  // --- Groups ---
  async function loadGroups() {
    const { data } = await supabase
      .from("user_groups")
      .select("*, members:user_group_members(*, user:app_users(id, display_name, username))")
      .order("name");
    const allGroups = (data ?? []) as typeof groups;
    if (isAdmin) {
      setGroups(allGroups);
    } else {
      const myStoreIds = currentUserStores.map((s) => s.id);
      setGroups(allGroups.filter((g) => g.store_id == null || myStoreIds.includes(g.store_id)));
    }
  }

  async function createGroup() {
    setError("");
    if (!newGroup.name.trim()) { setError("Gruppnamn obligatoriskt."); return; }
    if (!isAdmin && newGroup.store_id && !manageableStoreIds?.includes(newGroup.store_id)) {
      setError("Du kan bara skapa grupper i dina egna butiker."); return;
    }
    if (!isAdmin && !newGroup.store_id) { setError("Välj vilken butik gruppen tillhör."); return; }
    setSaving(true);
    const { data: created } = await supabase.from("user_groups").insert({
      name: newGroup.name.trim(), store_id: newGroup.store_id || null,
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
    if (!isAdmin && editGroup.store_id && !manageableStoreIds?.includes(editGroup.store_id)) {
      setError("Du har inte behörighet att redigera denna grupp."); return;
    }
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
    if (!isAdmin && deleteGroup.store_id && !manageableStoreIds?.includes(deleteGroup.store_id)) return;
    await supabase.from("user_groups").delete().eq("id", deleteGroup.id);
    logAudit(currentUser?.id ?? null, "group.delete", "user_groups", deleteGroup.id, { name: deleteGroup.name });
    setGroups((prev) => prev.filter((g) => g.id !== deleteGroup.id));
    setDeleteGroup(null);
  }

  // Sort helpers
  function toggleSort<T extends string>(field: T, current: T, dir: SortDir, setField: (f: T) => void, setDir: (d: SortDir) => void) {
    if (current === field) setDir(dir === "asc" ? "desc" : "asc");
    else { setField(field); setDir("asc"); }
  }

  function SortIcon({ field, current, dir }: { field: string; current: string; dir: SortDir }) {
    if (field !== current) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return dir === "asc" ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />;
  }

  // Filtered & sorted users
  const filteredUsers = useMemo(() => {
    let list = users.filter(u => u.display_name !== "Gallrad användare");
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      list = list.filter(u => u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      let av = "", bv = "";
      if (userSortField === "display_name") { av = a.display_name; bv = b.display_name; }
      else if (userSortField === "role") { av = a.role; bv = b.role; }
      else if (userSortField === "created_at") { av = a.created_at; bv = b.created_at; }
      const cmp = av.localeCompare(bv, "sv");
      return userSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [users, userSearch, userSortField, userSortDir]);

  // Filtered & sorted stores
  const filteredStores = useMemo(() => {
    let list = [...stores];
    if (storeSearch.trim()) {
      const q = storeSearch.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.bolag?.toLowerCase().includes(q) ||
        s.butiks_nr?.includes(q) ||
        s.distrikt_namn?.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.butikschef?.toLowerCase().includes(q) ||
        s.kommun?.toLowerCase().includes(q)
      );
    }
    list = list.sort((a, b) => {
      let av = "", bv = "";
      if (storeSortField === "name") { av = a.name; bv = b.name; }
      else if (storeSortField === "bolag") { av = a.bolag ?? ""; bv = b.bolag ?? ""; }
      else if (storeSortField === "distrikt_namn") { av = a.distrikt_namn ?? ""; bv = b.distrikt_namn ?? ""; }
      else if (storeSortField === "butiks_nr") { av = a.butiks_nr ?? ""; bv = b.butiks_nr ?? ""; }
      else if (storeSortField === "koncept") { av = a.koncept ?? ""; bv = b.koncept ?? ""; }
      const cmp = av.localeCompare(bv, "sv");
      return storeSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [stores, storeSearch, storeSortField, storeSortDir]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  if (!isManager) return null;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title="Administration"
        description={isAdmin ? "Hantera användarkonton, butiker och grupper." : "Hantera personal och grupper i dina butiker."}
      />

      <Tabs defaultValue="users" className="mt-6">
        <TabsList className="flex-wrap rounded-full bg-muted/60 p-1">
          <TabsTrigger value="users" className="rounded-full px-4 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Användare
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="stores" className="rounded-full px-4 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Butiker
            </TabsTrigger>
          )}
          <TabsTrigger value="groups" className="rounded-full px-4 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Grupper
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="gdpr" className="rounded-full px-4 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Shield className="mr-1.5 h-3.5 w-3.5" /> GDPR
            </TabsTrigger>
          )}
        </TabsList>

        {/* ──────────────────── USERS TAB ──────────────────── */}
        <TabsContent value="users" className="mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Användarkonton</h2>
              <p className="text-sm text-muted-foreground">{filteredUsers.length} konton</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-none sm:w-56">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Sök konto..." className="pl-9 rounded-full h-9 text-sm" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              </div>
              {/* Hide button on mobile */}
              <Button className="rounded-full hidden sm:flex" onClick={() => { setShowCreateUser(true); setError(""); }}>
                <Plus className="mr-2 h-4 w-4" /> Nytt konto
              </Button>
              {!isMobile && (
                <Button className="rounded-full sm:hidden" size="icon" onClick={() => { setShowCreateUser(true); setError(""); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />)}</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-3 text-left">
                        <button className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => toggleSort("display_name", userSortField, userSortDir, setUserSortField, setUserSortDir)}>
                          Konto <SortIcon field="display_name" current={userSortField} dir={userSortDir} />
                        </button>
                      </th>
                      <th className="hidden px-4 py-3 text-left md:table-cell">
                        <span className="text-xs font-medium text-muted-foreground">Butiker</span>
                      </th>
                      <th className="px-4 py-3 text-center">
                        <button className="flex items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground mx-auto"
                          onClick={() => toggleSort("role", userSortField, userSortDir, setUserSortField, setUserSortDir)}>
                          Hierarkinivå <SortIcon field="role" current={userSortField} dir={userSortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Aktiv</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
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
                        <td className="hidden px-4 py-3 md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {u.assignedStoreIds.length === 0 ? (
                              <span className="text-muted-foreground/50">—</span>
                            ) : (
                              u.assignedStoreIds.slice(0, 2).map((sid) => {
                                const s = stores.find((st) => st.id === sid);
                                return s ? (
                                  <span key={sid} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">{s.name}</span>
                                ) : null;
                              })
                            )}
                            {u.assignedStoreIds.length > 2 && (
                              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">+{u.assignedStoreIds.length - 2}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">{hierarchyBadge(u.hierarchy_level)}</td>
                        <td className="px-4 py-3 text-center">
                          <Switch checked={u.is_active} onCheckedChange={() => u.id !== currentUser?.id && toggleUserActive(u.id, u.is_active)} disabled={u.id === currentUser?.id} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="rounded-full text-xs"
                              onClick={() => { setEditUser({ ...u }); setResetPw(""); setEditPin(""); setEditBarcode((u as AppUser & { assignedStoreIds: string[]; barcode_id?: string }).barcode_id ?? ""); setError(""); }}>
                              <UserCog className="mr-1.5 h-3.5 w-3.5" /> Redigera
                            </Button>
                            {u.id !== currentUser?.id && (
                              <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteUser(u)} aria-label="Ta bort">
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
            </div>
          )}
        </TabsContent>

        {/* ──────────────────── GROUPS TAB ──────────────────── */}
        <TabsContent value="groups" className="mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Användargrupper</h2>
              <p className="text-sm text-muted-foreground">{filteredGroups.length} grupper</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-none sm:w-48">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Sök grupp..." className="pl-9 rounded-full h-9 text-sm" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} />
              </div>
              <Button className="rounded-full" onClick={() => { setShowCreateGroup(true); setError(""); }}>
                <Plus className="mr-2 h-4 w-4" /> Ny grupp
              </Button>
            </div>
          </div>
          {filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
              <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Inga grupper hittades</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((g) => (
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

        {/* ──────────────────── GDPR TAB ──────────────────── */}
        {isAdmin && (
          <TabsContent value="gdpr" className="mt-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">GDPR &amp; Dataportalitet</h2>
              <p className="text-sm text-muted-foreground">Artikel 20 — Exportera en anställds persondata på begäran.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-sm)]">
              <GdprExport />
            </div>
          </TabsContent>
        )}

        {/* ──────────────────── STORES TAB ──────────────────── */}
        {isAdmin && (
          <TabsContent value="stores" className="mt-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Butiksregister</h2>
                <p className="text-sm text-muted-foreground">{filteredStores.length} av {stores.length} butiker</p>
              </div>
              {/* Desktop-only import/create buttons */}
              {!isMobile && (
                <div className="flex items-center gap-2">
                  <input ref={csvInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFileChange} />
                  <Button variant="outline" className="rounded-full gap-1.5" onClick={() => csvInputRef.current?.click()} disabled={csvImporting}>
                    <Upload className="h-4 w-4" />
                    {csvImporting ? "Importerar..." : "Importera CSV"}
                  </Button>
                  <Button className="rounded-full" onClick={() => { setShowCreateStore(true); setError(""); }}>
                    <Plus className="mr-2 h-4 w-4" /> Ny butik
                  </Button>
                </div>
              )}
            </div>

            {/* CSV import result */}
            {csvPreviewError && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{csvPreviewError}</p>
                <button onClick={() => setCsvPreviewError(null)} className="ml-auto text-destructive/60 hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {csvResult && (
              <div className="mb-4 rounded-xl border border-border/60 bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <p className="text-sm font-medium">Import klar — {csvResult.success} butiker importerade, {csvResult.skipped} hoppades över</p>
                  <button onClick={() => setCsvResult(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                {csvResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-muted/40 p-2">
                    {csvResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Search + sort controls */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Sök butik, stad, förening, distrikt..." className="pl-9 rounded-full h-9 text-sm" value={storeSearch} onChange={e => setStoreSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Sortera:</span>
                {(["name", "bolag", "distrikt_namn", "butiks_nr", "koncept"] as const).map(f => (
                  <button key={f} onClick={() => toggleSort(f, storeSortField, storeSortDir, setStoreSortField, setStoreSortDir)}
                    className={`flex items-center rounded-full px-2.5 py-1 transition-colors ${storeSortField === f ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                    {{name:"Butiksnamn",bolag:"Bolag",distrikt_namn:"Distrikt",butiks_nr:"Butiksnr",koncept:"Koncept"}[f]}
                    <SortIcon field={f} current={storeSortField} dir={storeSortDir} />
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1,2,3].map(i => <div key={i} className="h-48 animate-pulse rounded-2xl bg-card" />)}
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card py-16 text-center">
                <Building2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">Inga butiker hittades</p>
                {!isMobile && (
                  <Button className="mt-4 rounded-full" size="sm" onClick={() => setShowCreateStore(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Lägg till butik
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStores.map((store) => (
                  <div key={store.id} className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditStore({ ...store }); setError(""); }} aria-label="Redigera butik">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteStore(store)} aria-label="Ta bort butik">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <h3 className="mt-3 text-base font-semibold">{store.name}</h3>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {store.butiks_nr && <div className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 shrink-0" /><span className="font-mono">#{store.butiks_nr}</span></div>}
                      {store.bolag && <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 shrink-0" /><span>{store.bolag}</span></div>}
                      {store.distrikt_namn && <div className="flex items-center gap-1.5"><span className="text-[10px] font-semibold uppercase tracking-wide">Distrikt</span><span>{store.distrikt_namn}</span></div>}
                      {(store.gatuadress || store.postadress) && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span>{[store.gatuadress, store.postnr, store.postadress].filter(Boolean).join(", ")}</span>
                        </div>
                      )}
                      {store.email_sm_chef && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{store.email_sm_chef}</span></div>}
                      {store.telefon_butik && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /><span>{store.telefon_butik}</span></div>}
                      {store.butikschef && <div className="flex items-center gap-1.5"><UserCog className="h-3.5 w-3.5 shrink-0" /><span>{store.butikschef}</span></div>}
                      {store.site_id && <div className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 shrink-0" /><span className="font-mono text-[10px]">Site-ID {store.site_id}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ──────────────────── DIALOGS ──────────────────── */}

      {/* CREATE USER */}
      <Dialog open={showCreateUser} onOpenChange={(o) => { setShowCreateUser(o); if (!o) setError(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nytt konto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Användarnamn *</Label>
              <Input placeholder="t.ex. anna.svensson" value={newUser.username}
                onChange={(e) => setNewUser(p => ({ ...p, username: e.target.value }))}
                autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </div>
            <div className="space-y-1.5">
              <Label>Visningsnamn *</Label>
              <Input placeholder="Anna Svensson" value={newUser.display_name}
                onChange={(e) => setNewUser(p => ({ ...p, display_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Lösenord *</Label>
              <Input type="password" placeholder={`Minst ${MIN_PW_LENGTH} tecken`} value={newUser.password}
                onChange={(e) => setNewUser(p => ({ ...p, password: e.target.value }))} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Användaren tvingas byta lösenord vid första inlogg.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Hierarkinivå</Label>
              <Select value={newUser.hierarchy_level} onValueChange={(v) => setNewUser(p => ({ ...p, hierarchy_level: v, role: hierarchyLevelToRole(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(HIERARCHY_LABELS).filter(([val]) => isAdmin || val !== "admin").map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Anställningsgrupp</Label>
              <Input placeholder="t.ex. Butik Timlön" value={newUser.employee_group}
                onChange={(e) => setNewUser(p => ({ ...p, employee_group: e.target.value }))} />
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
                    {s.butiks_nr && <span className="text-xs text-muted-foreground">#{s.butiks_nr}</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>PIN-kod (snabbyte)</Label>
                <Input type="password" inputMode="numeric" placeholder="Min. 4 siffror" maxLength={8}
                  value={newUser.pin} onChange={(e) => setNewUser(p => ({ ...p, pin: e.target.value.replace(/\D/g, "") }))} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label>Streckkods-ID</Label>
                <Input placeholder="Skanna eller ange" value={newUser.barcode}
                  onChange={(e) => setNewUser(p => ({ ...p, barcode: e.target.value }))} autoComplete="off" />
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

      {/* EDIT USER */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) { setEditUser(null); setError(""); setEditStoreSearch(""); } }}>
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
                <Label>Hierarkinivå</Label>
                <Select value={editUser.hierarchy_level ?? "anvandare"} onValueChange={(v) => setEditUser(u => u ? { ...u, hierarchy_level: v as AppUser["hierarchy_level"], role: hierarchyLevelToRole(v) } : null)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(HIERARCHY_LABELS).filter(([val]) => isAdmin || val !== "admin").map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Anställningsgrupp</Label>
                <Input placeholder="t.ex. Butik Timlön" value={editUser.employee_group ?? ""}
                  onChange={(e) => setEditUser(u => u ? { ...u, employee_group: e.target.value } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Butiker</Label>
                <div className="relative mb-1.5">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Sök butik..."
                    value={editStoreSearch}
                    onChange={(e) => setEditStoreSearch(e.target.value)}
                    className="h-8 w-full rounded-md border border-border/60 bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                  {stores
                    .filter(s => {
                      const q = editStoreSearch.toLowerCase();
                      return !q || s.name.toLowerCase().includes(q) || (s.butiks_nr && String(s.butiks_nr).includes(q));
                    })
                    .map(s => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                        <Checkbox
                          checked={editUser.assignedStoreIds.includes(s.id)}
                          onCheckedChange={() => toggleStoreSelection(s.id, editUser.assignedStoreIds, (ids) => setEditUser(u => u ? { ...u, assignedStoreIds: ids } : null))}
                        />
                        <span className="text-sm">{s.name}</span>
                        {s.butiks_nr && <span className="text-xs text-muted-foreground">#{s.butiks_nr}</span>}
                        {editUser.assignedStoreIds[0] === s.id && (
                          <span className="ml-auto text-xs text-primary">Primär</span>
                        )}
                      </label>
                    ))}
                  {stores.filter(s => {
                    const q = editStoreSearch.toLowerCase();
                    return !q || s.name.toLowerCase().includes(q) || (s.butiks_nr && String(s.butiks_nr).includes(q));
                  }).length === 0 && (
                    <p className="py-3 text-center text-xs text-muted-foreground">Inga butiker matchar sökningen</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Nytt lösenord (lämna tomt för att behålla)</Label>
                <Input type="password" placeholder={`Minst ${MIN_PW_LENGTH} tecken`} value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)} autoComplete="new-password" />
                {resetPw.length > 0 && <p className="text-xs text-muted-foreground">Användaren tvingas byta lösenord vid nästa inlogg.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>PIN-kod (snabbyte)</Label>
                  <Input type="password" inputMode="numeric" placeholder="Ny PIN, min 4 siffror" maxLength={8}
                    value={editPin} onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
                  <p className="text-xs text-muted-foreground">Lämna tomt för att behålla befintlig PIN.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Streckkods-ID</Label>
                  <Input placeholder="Skanna eller ange" value={editBarcode}
                    onChange={(e) => setEditBarcode(e.target.value)} autoComplete="off" />
                  <p className="text-xs text-muted-foreground">Lämna tomt för att ta bort streckkod.</p>
                </div>
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditUser(null); setEditPin(""); setEditBarcode(""); setError(""); setStoreSearch(""); }}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Avbryt
              </Button>
              <Button onClick={updateUser} disabled={saving}>{saving ? "Sparar..." : "Spara"}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* CREATE STORE */}
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
                <Label>Butiksnummer</Label>
                <Input placeholder="t.ex. 1452" value={newStore.butiks_nr}
                  onChange={(e) => setNewStore(p => ({ ...p, butiks_nr: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Bolag (Förening)</Label>
                <Input placeholder="t.ex. Coop Mitt" value={newStore.bolag}
                  onChange={(e) => setNewStore(p => ({ ...p, bolag: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stad</Label>
                <Input placeholder="Stockholm" value={newStore.city}
                  onChange={(e) => setNewStore(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>E-post</Label>
                <Input type="email" placeholder="butik@example.com" value={newStore.email}
                  onChange={(e) => setNewStore(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adress</Label>
              <Input placeholder="Gatuadress" value={newStore.address}
                onChange={(e) => setNewStore(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>SAP Site-ID (Mitt Coop)</Label>
              <Input placeholder="t.ex. 1452" value={newStore.sap_site_id} inputMode="numeric"
                onChange={(e) => setNewStore(p => ({ ...p, sap_site_id: e.target.value }))} />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateStore(false); setError(""); }}>Avbryt</Button>
            <Button onClick={createStore} disabled={saving || !newStore.name}>{saving ? "Sparar..." : "Lägg till"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT STORE */}
      <Dialog open={!!editStore} onOpenChange={(o) => { if (!o) { setEditStore(null); setError(""); } }}>
        {editStore && (
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>Redigera butik</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Butiksnamn *</Label>
                <Input value={editStore.name}
                  onChange={(e) => setEditStore(s => s ? { ...s, name: e.target.value } : null)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Butiksnummer</Label>
                  <Input value={editStore.butiks_nr ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, butiks_nr: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bolag (Förening)</Label>
                  <Input value={editStore.bolag ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, bolag: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Koncept</Label>
                  <Input value={editStore.koncept ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, koncept: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Distrikt</Label>
                  <Input value={editStore.distrikt_namn ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, distrikt_namn: e.target.value } : null)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Gatuadress</Label>
                <Input value={editStore.gatuadress ?? ""}
                  onChange={(e) => setEditStore(s => s ? { ...s, gatuadress: e.target.value } : null)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Postnummer</Label>
                  <Input value={editStore.postnr ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, postnr: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Stad</Label>
                  <Input value={editStore.postadress ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, postadress: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Butikschef</Label>
                  <Input value={editStore.butikschef ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, butikschef: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-post chef</Label>
                  <Input type="email" value={editStore.email_sm_chef ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, email_sm_chef: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Telefon butik</Label>
                  <Input value={editStore.telefon_butik ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, telefon_butik: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Kommun</Label>
                  <Input value={editStore.kommun ?? ""}
                    onChange={(e) => setEditStore(s => s ? { ...s, kommun: e.target.value } : null)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>SAP Site-ID (Mitt Coop)</Label>
                <Input value={editStore.site_id ?? ""}
                  onChange={(e) => setEditStore(s => s ? { ...s, site_id: e.target.value, sap_site_id: e.target.value } : null)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>BC Telefon</Label>
                  <Input value={editStore.bc_telefon ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, bc_telefon: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobil</Label>
                  <Input value={editStore.mobil ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, mobil: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Marknadsområde</Label>
                  <Input value={editStore.marknadsomrade ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, marknadsomrade: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Distriktschef (DC)</Label>
                  <Input value={editStore.distriktschef ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, distriktschef: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Direktör Försäljning</Label>
                  <Input value={editStore.direktor_forsaljning ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, direktor_forsaljning: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Försäljningschef</Label>
                  <Input value={editStore.forsaljningschef ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, forsaljningschef: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Företag</Label>
                  <Input value={editStore.foretag ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, foretag: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Enhet</Label>
                  <Input value={editStore.enhet ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, enhet: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Org.nummer</Label>
                  <Input value={editStore.organisationsnummer ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, organisationsnummer: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>K Ställe</Label>
                  <Input value={editStore.k_stalle ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, k_stalle: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Gamla butiksnummer</Label>
                  <Input value={editStore.gamla_butiksnummer ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, gamla_butiksnummer: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Säljplan</Label>
                  <Input value={editStore.saljplan ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, saljplan: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>HR Generalist</Label>
                  <Input value={editStore.hr_generalist ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, hr_generalist: e.target.value } : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bemanningsspecialist</Label>
                  <Input value={editStore.bemanningsspecialist ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, bemanningsspecialist: e.target.value } : null)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Säk, kval & Arbetsmiljö samordnare</Label>
                <Input value={editStore.sak_kval_samordnare ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, sak_kval_samordnare: e.target.value } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Kommentar</Label>
                <Input value={editStore.kommentar ?? ""} onChange={(e) => setEditStore(s => s ? { ...s, kommentar: e.target.value } : null)} />
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditStore(null); setError(""); }}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Avbryt
              </Button>
              <Button onClick={updateStore} disabled={saving}>{saving ? "Sparar..." : "Spara"}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* DELETE USER */}
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

      {/* DELETE STORE */}
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

      {/* CREATE GROUP */}
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
              <Label>{isAdmin ? "Butik (valfritt)" : "Butik"}</Label>
              <Select value={newGroup.store_id || "__none"} onValueChange={(v) => setNewGroup(p => ({ ...p, store_id: v === "__none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder={isAdmin ? "Alla butiker" : "Välj butik"} /></SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="__none">Alla butiker (global)</SelectItem>}
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Medlemmar</Label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                {users.filter(u => u.is_active && u.display_name !== "Gallrad användare").map(u => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                    <Checkbox
                      checked={newGroup.memberIds.includes(u.id)}
                      onCheckedChange={() => setNewGroup(p => ({
                        ...p, memberIds: p.memberIds.includes(u.id) ? p.memberIds.filter(id => id !== u.id) : [...p.memberIds, u.id]
                      }))}
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

      {/* EDIT GROUP */}
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
                  {users.filter(u => u.is_active && u.display_name !== "Gallrad användare").map(u => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                      <Checkbox
                        checked={editGroup.memberIds.includes(u.id)}
                        onCheckedChange={() => setEditGroup(g => g ? {
                          ...g, memberIds: g.memberIds.includes(u.id) ? g.memberIds.filter(id => id !== u.id) : [...g.memberIds, u.id]
                        } : null)}
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

      {/* DELETE GROUP */}
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
