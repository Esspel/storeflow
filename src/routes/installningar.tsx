import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CircleCheck as CheckCircle2, Eye, EyeOff, KeyRound, Store, User, Hash } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase, logAudit, type Store as StoreType } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/installningar")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, refreshUser, userStores, activeStore, setActiveStore } = useAuth();
  const isAdmin = user?.role === "admin";

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);

  const [sapSiteIds, setSapSiteIds] = useState<Record<string, string>>({});
  const [sapSaving, setSapSaving] = useState<Record<string, boolean>>({});
  const [sapSuccess, setSapSuccess] = useState<Record<string, boolean>>({});

  const saveSapSiteId = async (store: StoreType) => {
    const val = sapSiteIds[store.id] ?? (store.sap_site_id ?? "");
    setSapSaving(p => ({ ...p, [store.id]: true }));
    await supabase.from("stores").update({ sap_site_id: val.trim() || null }).eq("id", store.id);
    logAudit(user?.id ?? null, "store.sap_site_id", "stores", store.id, { sap_site_id: val });
    setSapSaving(p => ({ ...p, [store.id]: false }));
    setSapSuccess(p => ({ ...p, [store.id]: true }));
    setTimeout(() => setSapSuccess(p => ({ ...p, [store.id]: false })), 2000);
  };

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const saveDisplayName = async () => {
    if (!displayName.trim() || !user) return;
    setNameSaving(true);
    await supabase.from("app_users").update({ display_name: displayName.trim() }).eq("id", user.id);
    logAudit(user.id, "user.edit", "app_users", user.id, { field: "display_name" });
    refreshUser({ ...user, display_name: displayName.trim() });
    setNameSaving(false);
    setNameSuccess(true);
    setTimeout(() => setNameSuccess(false), 2000);
  };

  const changePassword = async () => {
    setPwError("");
    setPwSuccess(false);
    if (!user) return;
    if (newPw !== confirmPw) { setPwError("Lösenorden stämmer inte överens."); return; }
    if (newPw.length < 8) { setPwError("Lösenordet måste vara minst 8 tecken."); return; }

    setPwSaving(true);

    const { data: userData } = await supabase
      .from("app_users")
      .select("password_hash")
      .eq("id", user.id)
      .maybeSingle();

    const { data: verified } = await supabase.rpc("verify_password", {
      plain_password: currentPw,
      hashed_password: userData?.password_hash ?? "",
    });

    if (!verified) {
      setPwError("Nuvarande lösenord är felaktigt.");
      setPwSaving(false);
      return;
    }

    const { data: hash } = await supabase.rpc("hash_password", { plain_password: newPw });
    await supabase.from("app_users").update({ password_hash: hash }).eq("id", user.id);
    logAudit(user.id, "user.password_change", "app_users", user.id, {});

    setPwSaving(false);
    setPwSuccess(true);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setTimeout(() => setPwSuccess(false), 2000);
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 md:px-8 md:py-10">
      <PageHeader title="Inställningar" description="Hantera ditt konto och lösenord." />

      <div className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <User className="h-4 w-4" />
            </div>
            <h2 className="font-semibold">Profil</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Användarnamn</Label>
              <Input value={user?.username ?? ""} disabled className="bg-muted/40" />
              <p className="text-xs text-muted-foreground">Användarnamn kan inte ändras.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Visningsnamn</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ditt namn" />
            </div>
            <div className="space-y-1.5">
              <Label>Roll</Label>
              <Input value={user?.role ?? ""} disabled className="bg-muted/40 capitalize" />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveDisplayName} disabled={nameSaving} className="rounded-full">
                {nameSaving ? "Sparar..." : "Spara ändringar"}
              </Button>
              {nameSuccess && <span className="text-sm text-success">Sparat!</span>}
            </div>
          </div>
        </div>

        {userStores.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Store className="h-4 w-4" />
              </div>
              <h2 className="font-semibold">Butiker</h2>
            </div>
            <div className="space-y-3">
              {userStores.map((store) => {
                const isActive = activeStore?.id === store.id;
                const sapVal = sapSiteIds[store.id] ?? (store.sap_site_id ?? "");
                return (
                  <div
                    key={store.id}
                    className="rounded-xl border border-border/60 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isActive && <CheckCircle2 className="h-4 w-4 text-success" />}
                        <span className="text-sm font-medium">{store.name}</span>
                        {store.region && <span className="text-xs text-muted-foreground">{store.region}</span>}
                      </div>
                      {!isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full text-xs"
                          onClick={() => setActiveStore(store)}
                        >
                          Välj
                        </Button>
                      )}
                      {isActive && <Badge variant="secondary" className="text-xs">Aktiv</Badge>}
                    </div>
                    {isAdmin && (
                      <div className="border-t border-border/40 bg-muted/20 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <Label className="w-28 shrink-0 text-xs">SAP-butiksnr</Label>
                          <Input
                            value={sapVal}
                            onChange={(e) => setSapSiteIds(p => ({ ...p, [store.id]: e.target.value }))}
                            placeholder="t.ex. 1452"
                            className="h-7 flex-1 rounded-full text-xs"
                            inputMode="numeric"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full text-xs h-7 px-3"
                            disabled={sapSaving[store.id]}
                            onClick={() => saveSapSiteId(store)}
                          >
                            {sapSaving[store.id] ? "..." : sapSuccess[store.id] ? "Sparat!" : "Spara"}
                          </Button>
                        </div>
                        {store.sap_site_id && (
                          <p className="mt-1 pl-[1.375rem] text-xs text-muted-foreground">
                            Mitt Coop siteId: <span className="font-mono">{store.sap_site_id}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <KeyRound className="h-4 w-4" />
            </div>
            <h2 className="font-semibold">Byt lösenord</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nuvarande lösenord</Label>
              <div className="relative">
                <Input
                  type={showCurrentPw ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurrentPw((v) => !v)}
                >
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nytt lösenord</Label>
              <div className="relative">
                <Input
                  type={showNewPw ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Minst 6 tecken"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPw((v) => !v)}
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bekräfta nytt lösenord</Label>
              <Input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Upprepa lösenordet"
              />
            </div>
            {pwError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{pwError}</p>
            )}
            <div className="flex items-center gap-3">
              <Button onClick={changePassword} disabled={pwSaving || !currentPw || !newPw || !confirmPw} className="rounded-full">
                {pwSaving ? "Byter lösenord..." : "Byt lösenord"}
              </Button>
              {pwSuccess && <span className="text-sm text-success">Lösenord bytt!</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
