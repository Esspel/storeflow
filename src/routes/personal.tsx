import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Users, Building2, Store, Plus, Search, Upload, Download, ChevronUp, ChevronDown, ChevronsUpDown, CreditCard as Edit2, Trash2, X, Check, UserCog, TriangleAlert as AlertTriangle, RefreshCw, Eye, EyeOff, Link as LinkIcon } from "lucide-react";
import { supabase, type AppUser, type Store as StoreType, type UserGroup } from "@/lib/supabase";
import { useAuth, useIsAdmin, useIsManager } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, formatDate, hierarchyLabel } from "@/lib/utils";
import { getSessionToken } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/personal")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: PersonalPage,
});

type Tab = "anvandare" | "grupper" | "butiker";
type SortDir = "asc" | "desc";
interface SortState { col: string; dir: SortDir }

// ─── CSV field mapping ─────────────────────────────────────────────────────
const CSV_FIELD_MAP: Record<string, keyof StoreType> = {
  "Bolag": "bolag",
  "Butiks nr": "butiks_nr",
  "Site-ID": "site_id",
  "Koncept": "koncept",
  "Kommentar": "kommentar",
  "Namn": "name",
  "Butik / Enhet": "butik_enhet",
  "Företag": "foretag",
  "Enhet": "enhet",
  "Organisationsnummer": "organisationsnummer",
  "Franchise": "franchise",
  "Gatuadress": "gatuadress",
  "Postnr": "postnr",
  "Postadress": "postadress",
  "Email-adress Butiks-/SM-chef": "email_sm_chef",
  "Butikschef (BC)": "butikschef",
  "Telefon butik": "phone",
  "BC Telefon": "bc_telefon",
  "Mobil": "mobil",
  "Direktör Försäljning": "direktor_forsaljning",
  "Försäljningschef": "forsaljningschef",
  "Marknadsområde": "marknadsomrade",
  "Distriktschef (DC)": "distriktschef",
  "Distrikt": "distrikt_name",
  "K Ställe": "k_stalle",
  "Namn2": "namn2",
  "Gamla butiksnummer": "gamla_butiksnummer",
  "Säljplan": "saljplan",
  "Säk, kval & Arbetsmiljö samordnare": "sak_kval_samordnare",
  "Kommun": "kommun",
  "HR Generalist": "hr_generalist",
  "Bemanningsspecialist": "bemanningsspecialist",
};

function parseStoreCsv(text: string): Partial<StoreType>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ""));
  const rows: Partial<StoreType>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = (values[j] ?? "").trim().replace(/^"|"$/g, ""); });

    const store: Partial<StoreType> = {};
    for (const [csvHeader, dbField] of Object.entries(CSV_FIELD_MAP)) {
      const val = row[csvHeader];
      if (val !== undefined && val !== "") {
        (store as Record<string, unknown>)[dbField as string] = val;
      }
    }
    // Derive city from postadress if available
    if (store.postadress && !store.city) store.city = store.postadress as string;
    if (store.name) rows.push(store);
  }
  return rows;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ─── Main Component ────────────────────────────────────────────────────────
function PersonalPage() {
  const { user, activeStore } = useAuth();
  const isAdmin = useIsAdmin();
  const isManager = useIsManager();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("anvandare");

  if (!isManager) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-warning-foreground" />
        <p>Du har inte behörighet att visa den här sidan.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Personal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Hantera användare, grupper och butiker</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {([
          { key: "anvandare", label: "Användare", icon: Users },
          { key: "grupper", label: "Grupper", icon: UserCog },
          { key: "butiker", label: "Butiker", icon: Building2 },
        ] as { key: Tab; label: string; icon: typeof Users }[]).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                tab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "anvandare" && <UsersTab isMobile={isMobile} isAdmin={isAdmin} activeStore={activeStore} />}
      {tab === "grupper" && <GroupsTab isMobile={isMobile} isAdmin={isAdmin} activeStore={activeStore} />}
      {tab === "butiker" && <StoresTab isMobile={isMobile} isAdmin={isAdmin} />}
    </div>
  );
}

// ─── Users Tab ─────────────────────────────────────────────────────────────
function UsersTab({ isMobile, isAdmin, activeStore }: { isMobile: boolean; isAdmin: boolean; activeStore: StoreType | null }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ col: "display_name", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showMapping, setShowMapping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("app_users").select("*").eq("is_active", true);
    if (!isAdmin && activeStore) {
      const { data: storeUserIds } = await supabase.from("user_stores").select("user_id").eq("store_id", activeStore.id);
      const ids = (storeUserIds ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length > 0) q = q.in("id", ids);
    }
    const { data } = await q.order("display_name");
    setUsers((data ?? []) as AppUser[]);

    if (activeStore) {
      const { data: gData } = await supabase.from("user_groups").select("*").eq("store_id", activeStore.id);
      setGroups((gData ?? []) as UserGroup[]);
    }
    setLoading(false);
  }, [isAdmin, activeStore]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = users;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      const va = (a as Record<string, unknown>)[sort.col] as string ?? "";
      const vb = (b as Record<string, unknown>)[sort.col] as string ?? "";
      return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [users, search, sort]);

  function toggleSort(col: string) {
    setSort(s => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  async function deleteUser(id: string) {
    if (!confirm("Är du säker? Användaren inaktiveras.")) return;
    await supabase.from("app_users").update({ is_active: false }).eq("id", id);
    toast.success("Användare inaktiverad");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök användare..."
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* Hide buttons on mobile per spec */}
        {!isMobile && (
          <div className="flex gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowMapping(true)}
                className="flex items-center gap-2 px-3 h-10 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium transition-colors"
              >
                <LinkIcon className="w-4 h-4" />
                Personalmappning
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-3 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Ny användare
              </button>
            )}
          </div>
        )}
        {isMobile && isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Ny
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-[1fr_1fr_auto_auto_auto] gap-0 border-b border-border bg-muted/50">
          {[
            { col: "display_name", label: "Namn" },
            ...(isMobile ? [] : [{ col: "username", label: "Användarnamn" }]),
            { col: "role", label: "Roll" },
            { col: "hierarchy_level", label: "Nivå" },
            { col: "_actions", label: "" },
          ].map(h => (
            <button
              key={h.col}
              onClick={() => h.col !== "_actions" && toggleSort(h.col)}
              className={cn(
                "px-4 py-2.5 text-xs font-semibold text-muted-foreground text-left flex items-center gap-1",
                h.col !== "_actions" && "hover:text-foreground cursor-pointer"
              )}
            >
              {h.label}
              {h.col !== "_actions" && (
                sort.col === h.col
                  ? sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  : <ChevronsUpDown className="w-3 h-3 opacity-40" />
              )}
            </button>
          ))}
        </div>

        <div className="divide-y divide-border">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Laddar...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Inga användare hittades</div>
          ) : (
            filtered.map(u => (
              <div key={u.id} className="grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-[1fr_1fr_auto_auto_auto] items-center px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {u.display_name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.display_name}</p>
                    {isMobile && <p className="text-xs text-muted-foreground truncate">@{u.username}</p>}
                  </div>
                </div>
                {!isMobile && <p className="text-sm text-muted-foreground truncate">@{u.username}</p>}
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                  u.role === "admin" ? "bg-red-50 text-red-600" :
                  u.role === "manager" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-600"
                )}>
                  {u.role === "admin" ? "Admin" : u.role === "manager" ? "Chef" : "Anv."}
                </span>
                <span className="text-xs text-muted-foreground hidden md:block">
                  {hierarchyLabel(u.hierarchy_level ?? "anvandare")}
                </span>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditUser(u)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteUser(u.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {(showCreate || editUser) && (
        <UserDialog
          user={editUser}
          onClose={() => { setShowCreate(false); setEditUser(null); }}
          onSave={() => { setShowCreate(false); setEditUser(null); load(); }}
        />
      )}

      {showMapping && !isMobile && (
        <EmployeeMappingDialog onClose={() => setShowMapping(false)} activeStore={activeStore} />
      )}
    </div>
  );
}

// ─── Groups Tab ─────────────────────────────────────────────────────────────
function GroupsTab({ isMobile, isAdmin, activeStore }: { isMobile: boolean; isAdmin: boolean; activeStore: StoreType | null }) {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editGroup, setEditGroup] = useState<UserGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("user_groups").select("*, user_group_members(user_id, app_users(display_name))");
    if (activeStore) q = q.eq("store_id", activeStore.id);
    const { data } = await q.order("name");
    setGroups((data ?? []) as UserGroup[]);
    setLoading(false);
  }, [activeStore]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(q) || g.display_name?.toLowerCase().includes(q));
  }, [groups, search]);

  async function deleteGroup(id: string) {
    if (!confirm("Ta bort grupp?")) return;
    await supabase.from("user_groups").delete().eq("id", id);
    toast.success("Grupp borttagen");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök grupper..."
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            {isMobile ? "Ny" : "Ny grupp"}
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-2/3 mb-2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground text-sm">Inga grupper hittades</div>
        ) : (
          filtered.map(g => {
            const members = (g.user_group_members ?? []) as { user_id: string; app_users?: { display_name: string } }[];
            return (
              <div key={g.id} className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{g.display_name || g.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{members.length} {members.length === 1 ? "medlem" : "medlemmar"}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditGroup(g)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteGroup(g.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {members.slice(0, 4).map(m => (
                    <span key={m.user_id} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {m.app_users?.display_name ?? "?"}
                    </span>
                  ))}
                  {members.length > 4 && (
                    <span className="text-xs text-muted-foreground">+{members.length - 4} fler</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {(showCreate || editGroup) && (
        <GroupDialog
          group={editGroup}
          activeStore={activeStore}
          onClose={() => { setShowCreate(false); setEditGroup(null); }}
          onSave={() => { setShowCreate(false); setEditGroup(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Stores Tab ─────────────────────────────────────────────────────────────
function StoresTab({ isMobile, isAdmin }: { isMobile: boolean; isAdmin: boolean }) {
  const [stores, setStores] = useState<StoreType[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ col: "name", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editStore, setEditStore] = useState<StoreType | null>(null);
  const [importPreview, setImportPreview] = useState<Partial<StoreType>[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("stores")
      .select("*, foreningar(name, short_code), distrikt(name)")
      .eq("is_active", true)
      .order("name");
    setStores((data ?? []) as StoreType[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = stores;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.butiks_nr?.toLowerCase().includes(q) ||
        s.bolag?.toLowerCase().includes(q) ||
        s.distrikt_name?.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      const va = String((a as Record<string, unknown>)[sort.col] ?? "");
      const vb = String((b as Record<string, unknown>)[sort.col] ?? "");
      return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [stores, search, sort]);

  function toggleSort(col: string) {
    setSort(s => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  function SortIcon({ col }: { col: string }) {
    if (sort.col !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseStoreCsv(text);
      setImportPreview(parsed);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  async function confirmImport() {
    if (!importPreview) return;
    setImporting(true);
    let imported = 0;
    let updated = 0;
    for (const row of importPreview) {
      if (!row.name) continue;
      const { data: existing } = await supabase
        .from("stores")
        .select("id")
        .eq("name", row.name)
        .maybeSingle();

      if (existing) {
        await supabase.from("stores").update(row).eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("stores").insert({ ...row, is_active: true });
        imported++;
      }
    }
    setImporting(false);
    setImportPreview(null);
    toast.success(`Import klar: ${imported} nya, ${updated} uppdaterade`);
    load();
  }

  async function exportStores() {
    const headers = Object.keys(CSV_FIELD_MAP);
    const rows = stores.map(s =>
      Object.values(CSV_FIELD_MAP).map(f => {
        const v = (s as Record<string, unknown>)[f as string];
        return `"${String(v ?? "").replace(/"/g, '""')}"`;
      }).join(";")
    );
    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `butiker_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök butik, nr, bolag, distrikt..."
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Hide import/export on mobile per spec */}
        {!isMobile && isAdmin && (
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 h-10 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              Importera CSV
            </button>
            <button
              onClick={exportStores}
              className="flex items-center gap-2 px-3 h-10 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Exportera
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              Ny butik
            </button>
          </div>
        )}
        {isMobile && isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Ny
          </button>
        )}
      </div>

      {/* Import preview */}
      {importPreview && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-warning/10 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-foreground">Förhandsgranskning av import</p>
              <p className="text-xs text-muted-foreground">{importPreview.length} butiker hittades i filen</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setImportPreview(null)} className="px-3 py-1.5 rounded-lg border border-border text-sm">Avbryt</button>
              <button
                onClick={confirmImport}
                disabled={importing}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-70"
              >
                {importing ? "Importerar..." : `Importera ${importPreview.length} butiker`}
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-auto" data-scroll-container>
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {["Namn", "Butiksnr", "Distrikt", "Bolag", "Stad"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {importPreview.map((s, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.butiks_nr}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.distrikt_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.bolag}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.city || s.postadress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stores table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {[
                  { col: "name", label: "Namn" },
                  { col: "butiks_nr", label: "Butiksnr" },
                  ...(isMobile ? [] : [
                    { col: "distrikt_name", label: "Distrikt" },
                    { col: "bolag", label: "Bolag" },
                    { col: "city", label: "Stad" },
                    { col: "koncept", label: "Koncept" },
                  ]),
                  { col: "_actions", label: "" },
                ].map(h => (
                  <th
                    key={h.col}
                    onClick={() => h.col !== "_actions" && toggleSort(h.col)}
                    className={cn(
                      "px-4 py-2.5 text-xs font-semibold text-muted-foreground text-left whitespace-nowrap",
                      h.col !== "_actions" && "cursor-pointer hover:text-foreground"
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {h.label}
                      {h.col !== "_actions" && <SortIcon col={h.col} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Laddar...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Inga butiker hittades</td></tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-sm text-foreground">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{s.butiks_nr || "–"}</td>
                    {!isMobile && (
                      <>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{s.distrikt_name || "–"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{s.bolag || "–"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{s.city || "–"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{s.koncept || "–"}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      {isAdmin && (
                        <button onClick={() => setEditStore(s)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(showCreate || editStore) && (
        <StoreDialog
          store={editStore}
          onClose={() => { setShowCreate(false); setEditStore(null); }}
          onSave={() => { setShowCreate(false); setEditStore(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── User Dialog ─────────────────────────────────────────────────────────────
function UserDialog({ user, onClose, onSave }: { user: AppUser | null; onClose: () => void; onSave: () => void }) {
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [role, setRole] = useState<string>(user?.role ?? "employee");
  const [hierarchyLevel, setHierarchyLevel] = useState<string>(user?.hierarchy_level ?? "anvandare");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!displayName || !username) { toast.error("Fyll i alla obligatoriska fält"); return; }
    setSaving(true);
    try {
      if (user) {
        const updates: Record<string, unknown> = { display_name: displayName, role, hierarchy_level: hierarchyLevel };
        if (password) {
          const { data: hashed } = await supabase.rpc("hash_password", { plain_password: password });
          if (hashed) updates.password_hash = hashed;
        }
        await supabase.from("app_users").update(updates).eq("id", user.id);
        toast.success("Användare uppdaterad");
      } else {
        if (!password) { toast.error("Lösenord krävs för ny användare"); setSaving(false); return; }
        const { data: hashed } = await supabase.rpc("hash_password", { plain_password: password });
        await supabase.from("app_users").insert({
          username, display_name: displayName, role, hierarchy_level: hierarchyLevel,
          password_hash: hashed, is_active: true,
        });
        toast.success("Användare skapad");
      }
      onSave();
    } catch (e: unknown) {
      toast.error("Kunde inte spara: " + String(e));
    }
    setSaving(false);
  }

  return (
    <Dialog title={user ? "Redigera användare" : "Ny användare"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Namn *">
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputCls} placeholder="För- och efternamn" />
        </Field>
        <Field label="Användarnamn *">
          <input value={username} onChange={e => setUsername(e.target.value)} disabled={!!user} className={cn(inputCls, user && "opacity-60 cursor-not-allowed")} placeholder="anv.namn" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Roll">
            <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
              <option value="employee">Anställd</option>
              <option value="manager">Chef</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Hierarkinivå">
            <select value={hierarchyLevel} onChange={e => setHierarchyLevel(e.target.value)} className={inputCls}>
              <option value="anvandare">Användare</option>
              <option value="chef">Chef</option>
              <option value="distrikt">Distrikt</option>
              <option value="forening">Förening</option>
              <option value="hk">Huvudkontor</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        </div>
        <Field label={user ? "Nytt lösenord (lämna tomt för oförändrat)" : "Lösenord *"}>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={cn(inputCls, "pr-10")}
              placeholder={user ? "••••••••" : "Välj lösenord"}
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Avbryt</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
            {saving ? "Sparar..." : "Spara"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Group Dialog ─────────────────────────────────────────────────────────────
function GroupDialog({ group, activeStore, onClose, onSave }: {
  group: UserGroup | null; activeStore: StoreType | null;
  onClose: () => void; onSave: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [displayName, setDisplayName] = useState(group?.display_name ?? "");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("app_users").select("*").eq("is_active", true).then(({ data }) => setAllUsers((data ?? []) as AppUser[]));
    if (group) {
      supabase.from("user_group_members").select("user_id").eq("group_id", group.id).then(({ data }) => {
        setSelectedUsers((data ?? []).map((r: { user_id: string }) => r.user_id));
      });
    }
  }, [group]);

  async function save() {
    if (!name) { toast.error("Namn krävs"); return; }
    if (!activeStore) { toast.error("Ingen aktiv butik"); return; }
    setSaving(true);
    try {
      let groupId = group?.id;
      if (group) {
        await supabase.from("user_groups").update({ name, display_name: displayName }).eq("id", group.id);
      } else {
        const { data } = await supabase.from("user_groups").insert({ name, display_name: displayName, store_id: activeStore.id }).select().single();
        groupId = data.id;
      }
      if (groupId) {
        await supabase.from("user_group_members").delete().eq("group_id", groupId);
        if (selectedUsers.length > 0) {
          await supabase.from("user_group_members").insert(selectedUsers.map(uid => ({ group_id: groupId, user_id: uid })));
        }
      }
      toast.success(group ? "Grupp uppdaterad" : "Grupp skapad");
      onSave();
    } catch (e: unknown) {
      toast.error("Fel: " + String(e));
    }
    setSaving(false);
  }

  return (
    <Dialog title={group ? "Redigera grupp" : "Ny grupp"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Systemnamn *">
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="t.ex. kassa_team" />
          </Field>
          <Field label="Visningsnamn">
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputCls} placeholder="t.ex. Kassateam" />
          </Field>
        </div>
        <Field label="Medlemmar">
          <div className="border border-border rounded-xl max-h-48 overflow-auto" data-scroll-container>
            {allUsers.map(u => (
              <label key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(u.id)}
                  onChange={e => setSelectedUsers(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                  className="rounded border-border text-primary"
                />
                <span className="text-sm text-foreground">{u.display_name}</span>
                <span className="text-xs text-muted-foreground ml-auto">@{u.username}</span>
              </label>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Avbryt</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
            {saving ? "Sparar..." : "Spara"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Store Dialog ─────────────────────────────────────────────────────────────
function StoreDialog({ store, onClose, onSave }: { store: StoreType | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<Partial<StoreType>>(store ?? { is_active: true });
  const [saving, setSaving] = useState(false);

  function set(k: keyof StoreType, v: unknown) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name) { toast.error("Namn krävs"); return; }
    setSaving(true);
    try {
      if (store) {
        await supabase.from("stores").update(form).eq("id", store.id);
        toast.success("Butik uppdaterad");
      } else {
        await supabase.from("stores").insert({ ...form, is_active: true });
        toast.success("Butik skapad");
      }
      onSave();
    } catch (e: unknown) {
      toast.error("Fel: " + String(e));
    }
    setSaving(false);
  }

  const fields: { key: keyof StoreType; label: string }[] = [
    { key: "name", label: "Namn *" },
    { key: "butiks_nr", label: "Butiksnr" },
    { key: "site_id", label: "Site-ID (SAP)" },
    { key: "bolag", label: "Bolag" },
    { key: "koncept", label: "Koncept" },
    { key: "distrikt_name", label: "Distrikt" },
    { key: "city", label: "Stad" },
    { key: "gatuadress", label: "Gatuadress" },
    { key: "postnr", label: "Postnr" },
    { key: "phone", label: "Telefon" },
    { key: "email", label: "E-post" },
    { key: "butikschef", label: "Butikschef" },
    { key: "marknadsomrade", label: "Marknadsområde" },
    { key: "forsaljningschef", label: "Försäljningschef" },
  ];

  return (
    <Dialog title={store ? "Redigera butik" : "Ny butik"} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(f => (
          <Field key={f.key} label={f.label}>
            <input
              value={String(form[f.key] ?? "")}
              onChange={e => set(f.key, e.target.value)}
              className={inputCls}
            />
          </Field>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-border">
        <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">Avbryt</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
          {saving ? "Sparar..." : "Spara"}
        </button>
      </div>
    </Dialog>
  );
}

// ─── Employee Mapping Dialog ─────────────────────────────────────────────────
function EmployeeMappingDialog({ onClose, activeStore }: { onClose: () => void; activeStore: StoreType | null }) {
  const [employees, setEmployees] = useState<{ id: string; name: string; mapped_user_id: string | null }[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!activeStore) { setLoading(false); return; }
    Promise.all([
      supabase.from("schedule_employees").select("id, name").eq("store_id", activeStore.id),
      supabase.from("app_users").select("*").eq("is_active", true),
      supabase.from("employee_mappings").select("schedule_employee_id, app_user_id").eq("store_id", activeStore.id),
    ]).then(([empRes, usersRes, mapRes]) => {
      const maps: Record<string, string> = {};
      ((mapRes.data ?? []) as { schedule_employee_id: string; app_user_id: string }[]).forEach(m => {
        maps[m.schedule_employee_id] = m.app_user_id;
      });
      const emps = ((empRes.data ?? []) as { id: string; name: string }[]).map(e => ({
        ...e, mapped_user_id: maps[e.id] ?? null,
      }));
      setEmployees(emps);
      setAppUsers((usersRes.data ?? []) as AppUser[]);
      setLoading(false);
    });
  }, [activeStore]);

  async function mapEmployee(empId: string, userId: string | null) {
    if (!activeStore) return;
    setSaving(empId);
    await supabase.from("employee_mappings").delete().eq("schedule_employee_id", empId).eq("store_id", activeStore.id);
    if (userId) {
      await supabase.from("employee_mappings").insert({ schedule_employee_id: empId, app_user_id: userId, store_id: activeStore.id });
    }
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, mapped_user_id: userId } : e));
    setSaving(null);
  }

  return (
    <Dialog title="Personalmappning" onClose={onClose} wide>
      <p className="text-sm text-muted-foreground mb-4">Koppla schemaanställda till appanvändare för {activeStore?.name}.</p>
      {loading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">Laddar...</div>
      ) : employees.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted-foreground">Inga schemaanställda hittades. Importera ett schema först.</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-auto" data-scroll-container>
          {employees.map(emp => (
            <div key={emp.id} className="flex items-center gap-3 p-3 border border-border rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{emp.name}</p>
                <p className="text-xs text-muted-foreground">Schema-anställd</p>
              </div>
              <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <select
                value={emp.mapped_user_id ?? ""}
                onChange={e => mapEmployee(emp.id, e.target.value || null)}
                disabled={saving === emp.id}
                className={cn(inputCls, "w-48 shrink-0")}
              >
                <option value="">– Ej kopplad –</option>
                {appUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name}</option>
                ))}
              </select>
              {saving === emp.id && <RefreshCw className="w-4 h-4 animate-spin text-primary shrink-0" />}
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end pt-4 border-t border-border mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Stäng</button>
      </div>
    </Dialog>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────
const inputCls = "w-full h-10 px-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Dialog({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={cn("bg-card rounded-2xl border border-border shadow-lg w-full max-h-[90vh] overflow-auto", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
