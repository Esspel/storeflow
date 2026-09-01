import { useEffect, useState, useCallback } from "react";
import { KeyRound, Copy, Check, RefreshCw, Ban, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type ScopeGroup = { label: string; read: string; write: string | null };

const SCOPE_GROUPS: ScopeGroup[] = [
  { label: "Mallar", read: "templates:read", write: "templates:write" },
  { label: "Uppgifter", read: "tasks:read", write: "tasks:write" },
  { label: "Kundönskemål", read: "customer_requests:read", write: "customer_requests:write" },
  { label: "Kundrundor", read: "customer_rounds:read", write: null },
  { label: "Avvikelser", read: "deviations:read", write: "deviations:write" },
  { label: "Butiksregister", read: "stores:read", write: null },
  { label: "Mallpaket", read: "template_packages:read", write: "template_packages:write" },
  { label: "Leveranser", read: "deliveries:read", write: "deliveries:write" },
  { label: "Schema", read: "schedule:read", write: "schedule:write" },
  { label: "Produktsök", read: "products:search", write: null },
];

const SCOPE_LABELS: Record<string, string> = SCOPE_GROUPS.reduce(
  (acc, g) => {
    acc[g.read] = `${g.label} (läs)`;
    if (g.write) acc[g.write] = `${g.label} (skriv)`;
    return acc;
  },
  {} as Record<string, string>,
);

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  store_id: string | null;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  rotated_from_id: string | null;
};

type StoreOption = { id: string; name: string };

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/issue-api-key`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const EXPIRY_OPTIONS = [
  { value: "never", label: "Aldrig" },
  { value: "30", label: "30 dagar" },
  { value: "90", label: "90 dagar" },
  { value: "180", label: "180 dagar" },
  { value: "365", label: "1 år" },
] as const;

function expiryDaysToIso(days: string): string | null {
  if (days === "never") return null;
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
}

function keyStatus(key: ApiKeyRow): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (key.revoked_at) return { label: "Återkallad", variant: "destructive" };
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now())
    return { label: "Utgången", variant: "secondary" };
  return { label: "Aktiv", variant: "default" };
}

export function ApiKeysManager() {
  const { token, user } = useAuth();

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formStoreId, setFormStoreId] = useState<string>("all");
  const [formScopes, setFormScopes] = useState<Record<string, boolean>>({});
  const [formExpiry, setFormExpiry] = useState<string>("never");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [rotateTarget, setRotateTarget] = useState<ApiKeyRow | null>(null);
  const [rotating, setRotating] = useState(false);

  const [issuedKey, setIssuedKey] = useState<{ key: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const callEdge = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON_KEY}`,
          "x-session-token": token ?? "",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Fel (${res.status})`);
      return data;
    },
    [token],
  );

  // Load keys - using user as dependency to satisfy React Compiler
  const loadKeys = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError("");
    try {
      const data = await callEdge({ action: "list", user_id: user.id });
      setKeys(data.keys ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta API-nycklar.");
    } finally {
      setLoading(false);
    }
  }, [callEdge, user]);

  useEffect(() => {
    if (user?.id) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => loadKeys(), 0);
    }

    supabase
      .from("stores")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setStores((data ?? []) as StoreOption[]);
      });

    // Reset loading state when user changes
    if (!user?.id) {
      setTimeout(() => setLoading(false), 0);
    }
  }, [loadKeys, user?.id]);

  const storeName = (id: string | null) => {
    if (!id) return "Alla butiker";
    return stores.find((s) => s.id === id)?.name ?? id;
  };

  const openCreateDialog = () => {
    setFormName("");
    setFormStoreId("all");
    setFormScopes({});
    setFormExpiry("never");
    setFormError("");
    setCreateOpen(true);
  };

  const toggleScope = (scope: string) => {
    setFormScopes((prev) => ({ ...prev, [scope]: !prev[scope] }));
  };

  const submitCreate = async () => {
    setFormError("");
    if (!formName.trim()) {
      setFormError("Ange ett namn för nyckeln.");
      return;
    }
    const scopes = Object.entries(formScopes)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (scopes.length === 0) {
      setFormError("Välj minst en behörighet.");
      return;
    }

    setCreating(true);
    try {
      const data = await callEdge({
        action: "create",
        user_id: user?.id,
        name: formName.trim(),
        store_id: formStoreId === "all" ? null : formStoreId,
        scopes,
        expires_at: expiryDaysToIso(formExpiry),
      });
      setCreateOpen(false);
      setIssuedKey({ key: data.api_key, label: formName.trim() });
      await loadKeys();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kunde inte skapa nyckel.");
    } finally {
      setCreating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await callEdge({ action: "revoke", key_id: revokeTarget.id, user_id: user?.id });
      setRevokeTarget(null);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte återkalla nyckeln.");
    } finally {
      setRevoking(false);
    }
  };

  const confirmRotate = async () => {
    if (!rotateTarget) return;
    setRotating(true);
    try {
      const data = await callEdge({ action: "rotate", key_id: rotateTarget.id, user_id: user?.id });
      setIssuedKey({ key: data.api_key, label: `${rotateTarget.name} (roterad)` });
      setRotateTarget(null);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte rotera nyckeln.");
    } finally {
      setRotating(false);
    }
  };

  const copyIssuedKey = async () => {
    if (!issuedKey) return;
    try {
      await navigator.clipboard.writeText(issuedKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API kan vara otillgänglig — nyckeln visas ändå i klartext att kopiera manuellt.
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold">API-nycklar</h2>
            <p className="text-xs text-coop-gray-600">
              Hantera roterbara API-nycklar för automation (Power Automate, MCP, egna skript).
            </p>
          </div>
        </div>
        <Button size="sm" className="rounded-full gap-1.5 shrink-0" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" /> Ny nyckel
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-coop-gray-600">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
          <span className="sr-only" aria-busy="true">
            Laddar…
          </span>
        </div>
      ) : keys.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-coop-gray-600">
          Inga API-nycklar ännu. Skapa en för att låsa upp automation via storeflow-api eller
          MCP-servern.
        </p>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => {
            const status = keyStatus(key);
            return (
              <div key={key.id} className="rounded-xl border border-border/60 p-3.5 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{key.name}</span>
                      <Badge variant={status.variant} className="rounded-full">
                        {status.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-coop-gray-600">
                      {key.key_prefix}…
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {!key.revoked_at && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full gap-1.5"
                        onClick={() => setRotateTarget(key)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Rotera
                      </Button>
                    )}
                    {!key.revoked_at && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setRevokeTarget(key)}
                      >
                        <Ban className="h-3.5 w-3.5" /> Återkalla
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-coop-gray-600">Butik</p>
                    <p className="font-medium">{storeName(key.store_id)}</p>
                  </div>
                  <div>
                    <p className="text-coop-gray-600">Skapad</p>
                    <p className="font-medium">{formatDate(key.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-coop-gray-600">Senast använd</p>
                    <p className="font-medium">{formatDate(key.last_used_at)}</p>
                  </div>
                  <div>
                    <p className="text-coop-gray-600">Utgår</p>
                    <p className="font-medium">
                      {key.expires_at ? formatDate(key.expires_at) : "Aldrig"}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {key.scopes.map((s) => (
                    <Badge key={s} variant="secondary" className="rounded-full font-normal">
                      {SCOPE_LABELS[s] ?? s}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Skapa nyckel */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skapa API-nyckel</DialogTitle>
            <DialogDescription>
              Nyckeln visas i klartext bara en gång direkt efter att den skapats.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="api-key-name">Namn</Label>
              <Input
                id="api-key-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="T.ex. Power Automate – leveransimport"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Butik</Label>
              <Select value={formStoreId} onValueChange={setFormStoreId}>
                <SelectTrigger aria-label="Butik">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla butiker</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Giltighetstid</Label>
              <Select value={formExpiry} onValueChange={setFormExpiry}>
                <SelectTrigger aria-label="Giltighetstid">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Behörigheter (scopes)</Label>
              <div className="space-y-2 rounded-xl border border-border/60 p-3">
                {SCOPE_GROUPS.map((g) => (
                  <div key={g.label} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-sm">{g.label}</span>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-coop-gray-600">
                        <Checkbox
                          aria-label={`${g.label} – Läs`}
                          checked={!!formScopes[g.read]}
                          onCheckedChange={() => toggleScope(g.read)}
                        />
                        Läs
                      </label>
                      {g.write && (
                        <label className="flex items-center gap-1.5 text-xs text-coop-gray-600">
                          <Checkbox
                            aria-label={`${g.label} – Skriv`}
                            checked={!!formScopes[g.write]}
                            onCheckedChange={() => toggleScope(g.write!)}
                          />
                          Skriv
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setCreateOpen(false)}>
              Avbryt
            </Button>
            <Button className="rounded-full" onClick={submitCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Skapar
                  <span className="sr-only" aria-busy="true">
                    Laddar…
                  </span>
                </>
              ) : (
                "Skapa nyckel"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visa nyskapad/roterad nyckel */}
      <Dialog
        open={!!issuedKey}
        onOpenChange={(open) => {
          if (!open) setIssuedKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nyckel skapad</DialogTitle>
            <DialogDescription>
              Kopiera nyckeln för <span className="font-medium">{issuedKey?.label}</span> nu — den
              visas aldrig igen.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
            <code className="flex-1 break-all font-mono text-sm">{issuedKey?.key}</code>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full shrink-0 gap-1.5"
              onClick={copyIssuedKey}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Kopierad" : "Kopiera"}
            </Button>
          </div>

          <DialogFooter>
            <Button className="rounded-full" onClick={() => setIssuedKey(null)}>
              Klar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Återkalla-bekräftelse */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Återkalla nyckeln "{revokeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Alla anrop som använder denna nyckel slutar fungera omedelbart. Detta går inte att
              ångra — skapa en ny nyckel om åtkomsten behövs igen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              disabled={revoking}
              onClick={(e) => {
                e.preventDefault();
                confirmRevoke();
              }}
            >
              {revoking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Återkallar
                  <span className="sr-only" aria-busy="true">
                    Laddar…
                  </span>
                </>
              ) : (
                "Återkalla nyckel"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rotera-bekräftelse */}
      <AlertDialog
        open={!!rotateTarget}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotera nyckeln "{rotateTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              En ny nyckel skapas med samma namn, butik och behörigheter. Den gamla nyckeln
              återkallas omedelbart — uppdatera alla integrationer som använder den innan du
              fortsätter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotating}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={rotating}
              onClick={(e) => {
                e.preventDefault();
                confirmRotate();
              }}
            >
              {rotating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Roterar
                  <span className="sr-only" aria-busy="true">
                    Laddar…
                  </span>
                </>
              ) : (
                "Rotera nyckel"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
