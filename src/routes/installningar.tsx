import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Eye, EyeOff, KeyRound, Store, User, Hash, Bell, ArrowLeftRight, Delete, ScanBarcode } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, logAudit, type Store as StoreType } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { PushNotificationSetup } from "@/components/push-notification-setup";

export const Route = createFileRoute("/installningar")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, refreshUser, userStores, activeStore } = useAuth();
  const isAdmin = user?.role === "admin";

  // Quick PIN state
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [hasPin, setHasPin] = useState(false);

  // Barcode ID state
  const [barcodeId, setBarcodeId] = useState("");
  const [barcodeSaving, setBarcodeSaving] = useState(false);
  const [barcodeSuccess, setBarcodeSuccess] = useState(false);
  const [barcodeError, setBarcodeError] = useState("");

  // Load current PIN and barcode status
  useEffect(() => {
    if (!user) return;
    supabase
      .from("app_users")
      .select("quick_pin_hash, barcode_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setHasPin(!!data?.quick_pin_hash);
        setBarcodeId(data?.barcode_id ?? "");
      });
  }, [user?.id]);

  const handlePinDigit = (digit: string) => {
    if (pinStep === "enter") {
      if (newPin.length >= 4) return;
      const next = newPin + digit;
      setNewPin(next);
      setPinError("");
      if (next.length === 4) setPinStep("confirm");
    } else {
      if (confirmPin.length >= 4) return;
      const next = confirmPin + digit;
      setConfirmPin(next);
      setPinError("");
      if (next.length === 4) {
        if (next !== newPin) {
          setPinError("PIN-koderna stämmer inte överens. Försök igen.");
          setNewPin("");
          setConfirmPin("");
          setPinStep("enter");
        }
      }
    }
  };

  const savePin = async () => {
    if (!user || confirmPin.length !== 4 || confirmPin !== newPin) return;
    setPinSaving(true);
    const { data: hash } = await supabase.rpc("hash_password", { plain_password: confirmPin });
    await supabase.from("app_users").update({ quick_pin_hash: hash }).eq("id", user.id);
    logAudit(user.id, "user.set_quick_pin", "app_users", user.id, {});
    setPinSaving(false);
    setPinSuccess(true);
    setHasPin(true);
    setNewPin("");
    setConfirmPin("");
    setPinStep("enter");
    setTimeout(() => setPinSuccess(false), 2000);
  };

  const clearPin = async () => {
    if (!user) return;
    await supabase.from("app_users").update({ quick_pin_hash: null }).eq("id", user.id);
    logAudit(user.id, "user.clear_quick_pin", "app_users", user.id, {});
    setHasPin(false);
  };

  const saveBarcode = async () => {
    if (!user) return;
    setBarcodeError("");
    const trimmed = barcodeId.trim();
    if (!trimmed) return;
    setBarcodeSaving(true);
    // Check uniqueness across users in same store(s)
    const { data: existing } = await supabase
      .from("app_users")
      .select("id, display_name")
      .eq("barcode_id", trimmed)
      .neq("id", user.id)
      .maybeSingle();
    if (existing) {
      setBarcodeError(`Streckkoden är redan registrerad på ${existing.display_name}.`);
      setBarcodeSaving(false);
      return;
    }
    await supabase.from("app_users").update({ barcode_id: trimmed }).eq("id", user.id);
    logAudit(user.id, "user.set_barcode", "app_users", user.id, {});
    setBarcodeSaving(false);
    setBarcodeSuccess(true);
    setTimeout(() => setBarcodeSuccess(false), 2000);
  };

  const clearBarcode = async () => {
    if (!user) return;
    await supabase.from("app_users").update({ barcode_id: null }).eq("id", user.id);
    logAudit(user.id, "user.clear_barcode", "app_users", user.id, {});
    setBarcodeId("");
  };

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
    if (newPw.length < 12) { setPwError("Lösenordet måste vara minst 12 tecken."); return; }

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

        {isAdmin && userStores.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Store className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-semibold">Butiksinställningar</h2>
                <p className="text-xs text-muted-foreground">SAP-koppling för Mitt Coop-integration.</p>
              </div>
            </div>
            <div className="space-y-3">
              {userStores.map((store) => {
                const sapVal = sapSiteIds[store.id] ?? (store.sap_site_id ?? "");
                return (
                  <div key={store.id} className="rounded-xl border border-border/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border/40">
                      <Store className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{store.name}</span>
                      {store.region && <span className="text-xs text-muted-foreground">{store.region}</span>}
                    </div>
                    <div className="px-4 py-3">
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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold">Push-notiser</h2>
              <p className="text-xs text-muted-foreground">Få aviseringar direkt på enheten när uppgifter tilldelas eller deadlines nalkas.</p>
            </div>
          </div>
          <PushNotificationSetup />
        </div>

        {/* Quick switch: barcode + PIN */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold">Snabbt användarbyte</h2>
              <p className="text-xs text-muted-foreground">
                Registrera streckkod och/eller PIN för att ta över en delad Zebra-enhet på sekunder.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* ── Barcode section ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ScanBarcode className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Passerkortets streckkod</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Scanna ditt passerkort med Zebra-skannern i fältet nedan, eller skriv in streckkodsvärdet manuellt.
              </p>
              <div className="flex gap-2">
                <Input
                  value={barcodeId}
                  onChange={(e) => { setBarcodeId(e.target.value); setBarcodeError(""); }}
                  placeholder="Scanna kort eller ange ID manuellt"
                  className="flex-1 font-mono text-sm"
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") saveBarcode(); }}
                />
                {barcodeId.trim() && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full shrink-0"
                    onClick={clearBarcode}
                  >
                    Rensa
                  </Button>
                )}
              </div>
              {barcodeError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{barcodeError}</p>
              )}
              <div className="flex items-center gap-3">
                <Button
                  onClick={saveBarcode}
                  disabled={barcodeSaving || !barcodeId.trim()}
                  size="sm"
                  className="rounded-full"
                >
                  {barcodeSaving ? "Sparar..." : "Spara streckkod"}
                </Button>
                {barcodeSuccess && <span className="text-sm text-success">Sparat!</span>}
              </div>
            </div>

            <div className="border-t border-border/60" />

            {/* ── PIN section ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">4-siffrig PIN-kod</span>
                </div>
                {hasPin && (
                  <button
                    onClick={clearPin}
                    className="text-xs text-destructive hover:underline"
                  >
                    Ta bort PIN
                  </button>
                )}
              </div>

              {hasPin && pinStep === "enter" && newPin.length === 0 && (
                <p className="text-xs text-muted-foreground">Du har en aktiv PIN. Ange nedan för att byta.</p>
              )}

              <p className="text-sm text-muted-foreground">
                {pinStep === "enter"
                  ? (hasPin ? "Ange ny PIN-kod:" : "Välj en 4-siffrig PIN:")
                  : "Bekräfta PIN-koden:"}
              </p>

              {/* PIN dots */}
              <div className="flex justify-center gap-4 py-1">
                {[0, 1, 2, 3].map((i) => {
                  const active = pinStep === "enter" ? newPin : confirmPin;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "h-4 w-4 rounded-full border-2 transition-all duration-100",
                        active.length > i ? "border-primary bg-primary scale-110" : "border-border bg-transparent",
                      )}
                    />
                  );
                })}
              </div>

              {pinError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{pinError}</p>
              )}
              {pinSuccess && (
                <p className="rounded-lg bg-success/10 px-3 py-2 text-center text-sm text-success-foreground">PIN sparad!</p>
              )}

              {/* PIN pad */}
              <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                {["1","2","3","4","5","6","7","8","9"].map((d) => (
                  <button
                    key={d}
                    onClick={() => handlePinDigit(d)}
                    className="flex h-14 items-center justify-center rounded-xl border border-border/60 bg-card text-xl font-semibold transition-all active:scale-95 hover:bg-accent"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => { setNewPin(""); setConfirmPin(""); setPinStep("enter"); setPinError(""); }}
                  className="flex h-14 items-center justify-center rounded-xl text-xs text-muted-foreground transition-all active:scale-95 hover:bg-muted"
                >
                  Rensa
                </button>
                <button
                  onClick={() => handlePinDigit("0")}
                  className="flex h-14 items-center justify-center rounded-xl border border-border/60 bg-card text-xl font-semibold transition-all active:scale-95 hover:bg-accent"
                >
                  0
                </button>
                <button
                  onClick={() => {
                    if (pinStep === "enter") setNewPin(p => p.slice(0, -1));
                    else setConfirmPin(p => p.slice(0, -1));
                    setPinError("");
                  }}
                  className="flex h-14 items-center justify-center rounded-xl text-muted-foreground transition-all active:scale-95 hover:bg-muted"
                >
                  <Delete className="h-4 w-4" />
                </button>
              </div>

              {pinStep === "confirm" && confirmPin.length === 4 && confirmPin === newPin && (
                <div className="flex justify-center">
                  <Button onClick={savePin} disabled={pinSaving} className="rounded-full">
                    {pinSaving ? "Sparar..." : "Spara PIN-kod"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

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
