import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  User,
  Hash,
  Bell,
  ArrowLeftRight,
  Delete,
  ScanBarcode,
  Bug,
  Download,
  Wifi,
  WifiOff,
  HardDrive,
  RefreshCw,
  Shield,
} from "lucide-react";
import { BarcodeScanButton } from "@/components/barcode-scan-button";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  supabase,
  logAudit,
  HIERARCHY_LABELS,
  errorToSwedish,
} from "@/lib/supabase";
import { getQueueLength as getOfflineQueueLength } from "@/lib/offline-queue";
import { getRecentErrors, initErrorCapture } from "@/lib/error-capture";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { PushNotificationSetup } from "@/components/push-notification-setup";
import { toast } from "sonner";

const APP_VERSION = "2.4.1";

export const Route = createFileRoute("/installningar")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, refreshUser, activeStore } = useAuth();

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
    initErrorCapture();
  }, []);

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
    if (!window.confirm("Ta bort din PIN-kod? Du kan inte längre logga in med PIN.")) return;
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
    if (!window.confirm("Ta bort din streckkod?")) return;
    await supabase.from("app_users").update({ barcode_id: null }).eq("id", user.id);
    logAudit(user.id, "user.clear_barcode", "app_users", user.id, {});
    setBarcodeId("");
  };

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Diagnostics panel
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [diagOnline, setDiagOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [diagIdbUsage, setDiagIdbUsage] = useState("–");
  const [diagLastError, setDiagLastError] = useState("–");
  const [diagLocalDrafts, setDiagLocalDrafts] = useState(0);
  const [diagRefreshing, setDiagRefreshing] = useState(false);

  const refreshDiagnostics = useCallback(async () => {
    setDiagRefreshing(true);
    setDiagOnline(navigator.onLine);
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        const used = est.usage ?? 0;
        const quota = est.quota ?? 0;
        setDiagIdbUsage(
          `${(used / 1024 / 1024).toFixed(2)} MB / ${(quota / 1024 / 1024).toFixed(0)} MB`,
        );
      }
    } catch {
      setDiagIdbUsage("Ej tillgängligt");
    }
    try {
      const draftKeys = Object.keys(localStorage).filter(
        (k) => k.startsWith("sf_draft_") || k.startsWith("sf_queue_"),
      );
      setDiagLocalDrafts(draftKeys.length);
    } catch {
      setDiagLocalDrafts(0);
    }
    try {
      const { data } = await supabase
        .from("system_errors")
        .select("error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const ts = new Date(data.created_at).toLocaleString("sv-SE", {
          dateStyle: "short",
          timeStyle: "short",
        });
        setDiagLastError(`${ts}: ${(data.error_message as string).slice(0, 120)}`);
      } else {
        setDiagLastError("Inga registrerade fel");
      }
    } catch {
      setDiagLastError("Kunde inte hämta");
    }
    setDiagRefreshing(false);
  }, []);

  const handleVersionTap = () => {
    const next = versionTapCount + 1;
    setVersionTapCount(next);
    if (versionTapTimer.current) clearTimeout(versionTapTimer.current);
    if (next >= 7) {
      setVersionTapCount(0);
      setShowDiagnostics(true);
      refreshDiagnostics();
    } else {
      versionTapTimer.current = setTimeout(() => setVersionTapCount(0), 2000);
    }
  };

  const downloadDebugLog = () => {
    const lines = [
      `StoreFlow Debug Log — ${new Date().toISOString()}`,
      `Version: ${APP_VERSION}`,
      `User: ${user?.username ?? "–"} (${user?.role ?? "–"})`,
      `Store: ${activeStore?.name ?? "–"} (${activeStore?.id ?? "–"})`,
      `Online: ${diagOnline}`,
      `IndexedDB: ${diagIdbUsage}`,
      `Local drafts: ${diagLocalDrafts}`,
      `Last error: ${diagLastError}`,
      `User-Agent: ${navigator.userAgent}`,
      `Screen: ${window.screen.width}x${window.screen.height} @ ${window.devicePixelRatio}x`,
      `Viewport: ${window.innerWidth}x${window.innerHeight}`,
      `Language: ${navigator.language}`,
      `Platform: ${(navigator as { platform?: string }).platform ?? "–"}`,
      `Service Worker: ${"serviceWorker" in navigator ? "supported" : "unsupported"}`,
      ``,
      `--- LocalStorage keys ---`,
      ...Object.keys(localStorage).map((k) => `  ${k}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storeflow-debug-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    if (newPw !== confirmPw) {
      setPwError("Lösenorden stämmer inte överens.");
      return;
    }
    if (newPw.length < 12) {
      setPwError("Lösenordet måste vara minst 12 tecken.");
      return;
    }

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
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title="Inställningar"
        description="Hantera ditt konto och personliga inställningar."
      />

      <div className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <User className="h-4 w-4" />
            </div>
            <h2 className="font-semibold">Profil</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Användarnamn</Label>
              <Input id="username" value={user?.username ?? ""} disabled className="bg-muted/40" />
              <p className="text-xs text-coop-gray-900">Användarnamn kan inte ändras.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Visningsnamn</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ditt namn"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hierarchy">Hierarkinivå</Label>
              <Input
                id="hierarchy"
                value={
                  HIERARCHY_LABELS[user?.hierarchy_level ?? "anvandare"] ??
                  user?.hierarchy_level ??
                  ""
                }
                disabled
                className="bg-muted/40"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveDisplayName} disabled={nameSaving} className="rounded-full">
                {nameSaving ? "Sparar…" : "Spara ändringar"}
                {nameSaving && (
                  <span className="sr-only" aria-busy="true">
                    Laddar…
                  </span>
                )}
              </Button>
              {nameSuccess && (
                <span role="status" className="text-sm text-success">
                  Sparat!
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Hash className="h-4 w-4" />
            </div>
            <h2 className="font-semibold">Butik</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="active-store">Aktiv butik</Label>
              <Input
                id="active-store"
                value={activeStore?.name ?? "Ingen aktiv butik"}
                disabled
                className="bg-muted/40"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold">Push-notiser</h2>
              <p className="text-xs text-coop-gray-900">
                Få aviseringar direkt på enheten när uppgifter tilldelas eller deadlines nalkas.
              </p>
            </div>
          </div>
          <PushNotificationSetup />
        </div>

        <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold">Snabbt användarbyte</h2>
              <p className="text-xs text-coop-gray-900">
                Registrera streckkod och/eller PIN för att ta över en delad Zebra-enhet på sekunder.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ScanBarcode className="h-4 w-4 text-coop-gray-900" />
                <label htmlFor="barcode-id" className="text-sm font-medium">
                  Passerkortets streckkod
                </label>
              </div>
              <p className="text-xs text-coop-gray-900">
                Scanna ditt passerkort med Zebra-skannern i fältet nedan, eller skriv in
                streckkodsvärdet manuellt.
              </p>
              <div className="flex gap-2">
                <Input
                  id="barcode-id"
                  value={barcodeId}
                  onChange={(e) => {
                    setBarcodeId(e.target.value);
                    setBarcodeError("");
                  }}
                  placeholder="Scanna kort eller ange ID manuellt"
                  className="flex-1 font-mono text-sm"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveBarcode();
                  }}
                />
                <BarcodeScanButton
                  onScan={(code) => {
                    setBarcodeId(code);
                    setBarcodeError("");
                  }}
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
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {barcodeError}
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button
                  onClick={saveBarcode}
                  disabled={barcodeSaving || !barcodeId.trim()}
                  size="sm"
                  className="rounded-full"
                >
                  {barcodeSaving ? "Sparar…" : "Spara streckkod"}
                  {barcodeSaving && (
                    <span className="sr-only" aria-busy="true">
                      Laddar…
                    </span>
                  )}
                </Button>
                {barcodeSuccess && (
                  <span role="status" className="text-sm text-success">
                    Sparat!
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-border/60" />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-coop-gray-900" />
                  <span className="text-sm font-medium">4-siffrig PIN-kod</span>
                </div>
                {hasPin && (
                  <button onClick={clearPin} className="text-xs text-destructive hover:underline">
                    Ta bort PIN
                  </button>
                )}
              </div>

              {hasPin && pinStep === "enter" && newPin.length === 0 && (
                <p className="text-xs text-coop-gray-900">
                  Du har en aktiv PIN. Ange nedan för att byta.
                </p>
              )}

              <p className="text-sm text-coop-gray-900">
                {pinStep === "enter"
                  ? hasPin
                    ? "Ange ny PIN-kod:"
                    : "Välj en 4-siffrig PIN:"
                  : "Bekräfta PIN-koden:"}
              </p>

              <div className="flex justify-center gap-4 py-1">
                {[0, 1, 2, 3].map((i) => {
                  const active = pinStep === "enter" ? newPin : confirmPin;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "h-4 w-4 rounded-full border-2 transition-all duration-100 motion-reduce:transition-none",
                        active.length > i
                          ? "border-primary bg-primary scale-110"
                          : "border-border bg-transparent",
                      )}
                    />
                  );
                })}
              </div>

              {pinError && (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
                >
                  {pinError}
                </p>
              )}
              {pinSuccess && (
                <p
                  role="status"
                  className="rounded-lg bg-success/10 px-3 py-2 text-center text-sm text-success-foreground"
                >
                  PIN sparad!
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button
                    key={d}
                    onClick={() => handlePinDigit(d)}
                    className="flex h-14 items-center justify-center rounded-xl border border-border/60 bg-coop-gray-100 text-xl font-semibold transition-all active:scale-95 hover:bg-accent motion-reduce:transition-none"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setNewPin("");
                    setConfirmPin("");
                    setPinStep("enter");
                    setPinError("");
                  }}
                  className="flex h-14 items-center justify-center rounded-xl text-xs text-coop-gray-900 transition-all active:scale-95 hover:bg-muted motion-reduce:transition-none"
                >
                  Rensa
                </button>
                <button
                  onClick={() => handlePinDigit("0")}
                  className="flex h-14 items-center justify-center rounded-xl border border-border/60 bg-coop-gray-100 text-xl font-semibold transition-all active:scale-95 hover:bg-accent motion-reduce:transition-none"
                >
                  0
                </button>
                <button
                  onClick={() => {
                    if (pinStep === "enter") setNewPin((p) => p.slice(0, -1));
                    else setConfirmPin((p) => p.slice(0, -1));
                    setPinError("");
                  }}
                  className="flex h-14 items-center justify-center rounded-xl text-coop-gray-900 transition-all active:scale-95 hover:bg-muted motion-reduce:transition-none"
                  aria-label="Radera siffra"
                >
                  <Delete className="h-4 w-4" />
                </button>
              </div>

              {pinStep === "confirm" && confirmPin.length === 4 && confirmPin === newPin && (
                <div className="flex justify-center">
                  <Button onClick={savePin} disabled={pinSaving} className="rounded-full">
                    {pinSaving ? "Sparar…" : "Spara PIN-kod"}
                    {pinSaving && (
                      <span className="sr-only" aria-busy="true">
                        Laddar…
                      </span>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <KeyRound className="h-4 w-4" />
            </div>
            <h2 className="font-semibold">Byt lösenord</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Nuvarande lösenord</Label>
              <div className="relative">
                <Input
                  id="current-pw"
                  type={showCurrentPw ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-coop-gray-900 hover:text-coop-gray-900"
                  onClick={() => setShowCurrentPw((v) => !v)}
                  aria-label={showCurrentPw ? "Dölj lösenord" : "Visa lösenord"}
                  aria-pressed={showCurrentPw}
                >
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">Nytt lösenord</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showNewPw ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Minst 12 tecken"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-coop-gray-900 hover:text-coop-gray-900"
                  onClick={() => setShowNewPw((v) => !v)}
                  aria-label={showNewPw ? "Dölj lösenord" : "Visa lösenord"}
                  aria-pressed={showNewPw}
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Bekräfta nytt lösenord</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Upprepa lösenordet"
              />
            </div>
            {pwError && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {pwError}
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button
                onClick={changePassword}
                disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                className="rounded-full"
              >
                {pwSaving ? "Byter lösenord…" : "Byt lösenord"}
                {pwSaving && (
                  <span className="sr-only" aria-busy="true">
                    Laddar…
                  </span>
                )}
              </Button>
              {pwSuccess && (
                <span role="status" className="text-sm text-success">
                  Lösenord bytt!
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold">Min data (GDPR)</h2>
              <p className="text-xs text-coop-gray-900">
                Exportera dina personuppgifter som lagras i systemet. Artikel 20 — rätt till
                dataportabilitet.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-coop-gray-900">
              Du kan ladda ned alla uppgifter som är kopplade till ditt konto: profil, tilldelade
              uppgifter, slutförda uppgifter, svar på frågor och avvikelserapporter.
            </p>
            <Button
              variant="outline"
              className="rounded-full gap-2"
              onClick={async () => {
                if (!user) return;
                const [profileRes, tasksRes, incidentsRes] = await Promise.all([
                  supabase
                    .from("app_users")
                    .select(
                      "id, username, display_name, role, employee_group, created_at, last_login",
                    )
                    .eq("id", user.id)
                    .maybeSingle(),
                  supabase
                    .from("tasks")
                    .select(
                      "id, title, category, priority, status, due_date, created_at, completed_at",
                    )
                    .or(`created_by.eq.${user.id}`)
                    .order("created_at", { ascending: false })
                    .limit(500),
                  supabase
                    .from("incidents")
                    .select("id, title, category, priority, status, created_at")
                    .eq("reported_by", user.id)
                    .order("created_at", { ascending: false })
                    .limit(500),
                ]);
                const data = {
                  exported_at: new Date().toISOString(),
                  profile: profileRes.data,
                  tasks: tasksRes.data ?? [],
                  incidents: incidentsRes.data ?? [],
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `storeflow-min-data-${user.username}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-4 w-4" /> Ladda ned min data
            </Button>
          </div>
        </div>

        {showDiagnostics ? (
          <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Bug className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold">Diagnostik</h2>
                  <p className="text-xs text-coop-gray-900">
                    Realtidsstatus för Helpdesk-support.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={refreshDiagnostics}
                  disabled={diagRefreshing}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-coop-gray-900 transition-colors hover:bg-muted"
                  aria-label="Uppdatera diagnostik"
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      diagRefreshing && "animate-spin motion-reduce:animate-none",
                    )}
                  />
                </button>
                <button
                  onClick={() => setShowDiagnostics(false)}
                  className="text-xs text-coop-gray-900 hover:text-coop-gray-900"
                >
                  Stäng
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {diagOnline ? (
                    <Wifi className="h-4 w-4 text-success" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-destructive" />
                  )}
                  Nätverksstatus
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    diagOnline ? "text-success" : "text-destructive",
                  )}
                >
                  {diagOnline ? "Online" : "Offline"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HardDrive className="h-4 w-4 text-coop-gray-900" />
                  IndexedDB-lagring
                </div>
                <span className="font-mono text-xs text-coop-gray-900">{diagIdbUsage}</span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <span className="text-sm font-medium">Lokala utkast (kö)</span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    diagLocalDrafts > 0 ? "text-warning-foreground" : "text-coop-gray-900",
                  )}
                >
                  {diagLocalDrafts} poster
                </span>
              </div>

              <div className="rounded-lg border border-border/60 px-3 py-2.5">
                <p className="mb-1 text-xs font-medium text-coop-gray-900">Senaste systemfel</p>
                <p className="break-all font-mono text-xs text-coop-gray-900/80">{diagLastError}</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <span className="text-sm font-medium">App-version</span>
                <span className="font-mono text-xs text-coop-gray-900">{APP_VERSION}</span>
              </div>
            </div>

            <div className="mt-4">
              <Button onClick={downloadDebugLog} className="w-full rounded-full gap-2">
                <Download className="h-4 w-4" />
                Exportera lokal debug-logg
              </Button>
              <p className="mt-2 text-center text-xs text-coop-gray-900">
                Exportera lokal debug-information för felsökning.
              </p>
            </div>
            <div className="mt-3 space-y-2">
              <Button
                onClick={() => {
                  const info = [
                    `User-Agent: ${navigator.userAgent}`,
                    `App-version: ${APP_VERSION}`,
                    `Senaste fel: ${getRecentErrors().slice(-1)[0] ?? "ingen"}`,
                    `Offline-kö: ${getOfflineQueueLength()}`,
                  ].join("\n");
                  navigator.clipboard
                    .writeText(info)
                    .then(() => toast.success("Kopierat – klistra in i mail till support"));
                }}
                variant="ghost"
                className="w-full rounded-full gap-2"
              >
                Kopiera felinfo
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center pt-2 pb-4">
            <button
              onClick={handleVersionTap}
              className="select-none rounded-full px-4 py-2 text-xs text-coop-gray-900/40 transition-colors hover:text-coop-gray-900/60 active:opacity-50"
              aria-label="App-version"
            >
              v{APP_VERSION}
              {versionTapCount > 0 && versionTapCount < 7 && (
                <span className="ml-2 tabular-nums text-coop-gray-900/60">
                  ({7 - versionTapCount} tryck kvar)
                </span>
              )}
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-border/60 bg-coop-gray-100 p-4 sm:p-6 shadow-[var(--shadow-sm)]">
          <h2 className="mb-3 font-semibold">Juridisk information</h2>
          <nav className="space-y-1">
            {(
              [
                ["/integritetspolicy", "Integritetspolicy"],
                ["/gdpr", "GDPR-information"],
                ["/anvandningsvillkor", "Användarvillkor"],
                ["/licens", "Licens (GNU GPL v3.0)"],
              ] as const
            ).map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-coop-gray-900 transition-colors hover:bg-muted hover:text-coop-gray-900"
              >
                {label}
                <svg
                  className="h-4 w-4 opacity-50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            ))}
          </nav>
        </div>

        <p className="pb-4 text-center text-xs text-coop-gray-900/50">
          &copy; 2024–2026 StoreFlow Contributors. Licensierat under GNU GPL v3.0.
        </p>
      </div>
    </div>
  );
}
